import ollama
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .database import get_db
from .models import User, Conversation, ChatSession
from .auth import get_current_user
from .schemas import (
    ChatRequest,
    ChatResponse,
    ConversationResponse,
    ChatSessionCreate,
    ChatSessionResponse,
    ChatSessionUpdate,
)
from .config import Config
from typing import List, Dict
from datetime import datetime

router = APIRouter()

# Keep the most recent exchanges in the LLM prompt. One exchange means one
# user message and its assistant response. This avoids an endlessly growing
# prompt while still preserving useful context inside each chat session.
MAX_CONTEXT_EXCHANGES = 20


def get_ollama_response(messages: List[Dict[str, str]]) -> str:
    """Generate a response using Ollama and the configured local model."""
    try:
        client = ollama.Client(host=Config.OLLAMA_HOST)
        response = client.chat(model=Config.MODEL_NAME, messages=messages)
        return response["message"]["content"]
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"LLM error: {exc}") from exc


def build_context_messages(db: Session, user_id: int, session_id: int, new_message: str):
    """Build an Ollama prompt from only this user's selected chat session."""
    conversations = (
        db.query(Conversation)
        .filter(
            Conversation.user_id == user_id,
            Conversation.session_id == session_id,
        )
        .order_by(Conversation.timestamp.desc(), Conversation.id.desc())
        .limit(MAX_CONTEXT_EXCHANGES)
        .all()
    )
    conversations.reverse()

    messages = [
        {
            "role": "system",
            "content": (
                "You are a helpful assistant. Use the conversation history from "
                "this chat session to maintain context. Provide clear, concise, "
                "and accurate responses in English or Bengali as appropriate. "
                "Do not claim to remember information outside the supplied history."
            ),
        }
    ]

    for conversation in conversations:
        messages.append({"role": "user", "content": conversation.user_message})
        messages.append({"role": "assistant", "content": conversation.bot_response})

    messages.append({"role": "user", "content": new_message})
    return messages


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send a message, retain context within its session, and save the exchange."""
    if request.session_id is None:
        raise HTTPException(status_code=400, detail="session_id is required")

    session = (
        db.query(ChatSession)
        .filter(
            ChatSession.id == request.session_id,
            ChatSession.user_id == current_user.id,
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")

    clean_message = request.message.strip()
    if not clean_message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    messages = build_context_messages(
        db=db,
        user_id=current_user.id,
        session_id=session.id,
        new_message=clean_message,
    )
    bot_response = get_ollama_response(messages)

    conversation = Conversation(
        user_id=current_user.id,
        session_id=session.id,
        user_message=clean_message,
        bot_response=bot_response,
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    return ChatResponse(response=bot_response)


@router.get("/history", response_model=List[ConversationResponse])
async def get_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 100,
):
    """Get all of the current user's recent chat history."""
    conversations = (
        db.query(Conversation)
        .filter(Conversation.user_id == current_user.id)
        .order_by(Conversation.timestamp.desc(), Conversation.id.desc())
        .limit(limit)
        .all()
    )
    return conversations[::-1]


@router.post("/sessions", response_model=ChatSessionResponse)
async def create_session(
    payload: ChatSessionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new chat session."""
    name = (payload.name or "").strip() or f"Chat {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    session = ChatSession(user_id=current_user.id, name=name[:120])
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("/sessions", response_model=List[ChatSessionResponse])
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the current user's chat sessions."""
    return (
        db.query(ChatSession)
        .filter(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.created_at.desc(), ChatSession.id.desc())
        .all()
    )


@router.get("/sessions/{session_id}/history", response_model=List[ConversationResponse])
async def get_session_history(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the saved history for one chat session."""
    session = (
        db.query(ChatSession)
        .filter(
            ChatSession.id == session_id,
            ChatSession.user_id == current_user.id,
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")

    return (
        db.query(Conversation)
        .filter(
            Conversation.user_id == current_user.id,
            Conversation.session_id == session_id,
        )
        .order_by(Conversation.timestamp.asc(), Conversation.id.asc())
        .all()
    )


@router.patch("/sessions/{session_id}", response_model=ChatSessionResponse)
async def rename_session(
    session_id: int,
    payload: ChatSessionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Rename a chat session."""
    session = (
        db.query(ChatSession)
        .filter(
            ChatSession.id == session_id,
            ChatSession.user_id == current_user.id,
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Session name cannot be empty")

    session.name = name[:120]
    db.commit()
    db.refresh(session)
    return session


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a chat session and all conversations belonging to it."""
    session = (
        db.query(ChatSession)
        .filter(
            ChatSession.id == session_id,
            ChatSession.user_id == current_user.id,
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")

    db.delete(session)
    db.commit()
    return {"message": "Chat session deleted"}


@router.delete("/history/{conversation_id}")
async def delete_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a specific conversation owned by the current user."""
    conversation = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    db.delete(conversation)
    db.commit()
    return {"message": "Conversation deleted successfully"}
