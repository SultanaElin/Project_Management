import ollama
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .database import get_db
from .models import User, Conversation, ChatSession
from .auth import get_current_user
from .schemas import ChatRequest, ChatResponse, ConversationResponse, ChatSessionCreate, ChatSessionResponse, ChatSessionUpdate
from .config import Config
from typing import List
from datetime import datetime

router = APIRouter()

def get_ollama_response(message: str) -> str:
    """Generate response using Ollama with Qwen model"""
    try:
        response = ollama.chat(
            model=Config.MODEL_NAME,
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant. Provide clear, concise, and accurate responses in English or Bengali as appropriate."
                },
                {
                    "role": "user",
                    "content": message
                }
            ]
        )
        return response['message']['content']
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM Error: {str(e)}")

@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send a message to the chatbot and get response"""
    
    # Generate response from LLM
    bot_response = get_ollama_response(request.message)
    
    # Save conversation to database
    conversation = Conversation(
        user_id=current_user.id,
        session_id=request.session_id,
        user_message=request.message,
        bot_response=bot_response
    )
    db.add(conversation)
    db.commit()
    
    return ChatResponse(response=bot_response)

@router.get("/history", response_model=List[ConversationResponse])
async def get_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 100
):
    """Get user's chat history"""
    conversations = db.query(Conversation)\
        .filter(Conversation.user_id == current_user.id)\
        .order_by(Conversation.timestamp.desc())\
        .limit(limit)\
        .all()
    
    return conversations[::-1]  # Return in chronological order

@router.post("/sessions", response_model=ChatSessionResponse)
async def create_session(
    payload: ChatSessionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new chat session"""
    name = payload.name or f"Chat {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')}"
    session = ChatSession(user_id=current_user.id, name=name)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session

@router.get("/sessions", response_model=List[ChatSessionResponse])
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List user's chat sessions"""
    sessions = db.query(ChatSession)\
        .filter(ChatSession.user_id == current_user.id)\
        .order_by(ChatSession.created_at.desc())\
        .all()
    return sessions

@router.get("/sessions/{session_id}/history", response_model=List[ConversationResponse])
async def get_session_history(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get history for a specific session"""
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")

    conversations = db.query(Conversation)\
        .filter(Conversation.user_id == current_user.id, Conversation.session_id == session_id)\
        .order_by(Conversation.timestamp.asc())\
        .all()
    return conversations

@router.patch("/sessions/{session_id}", response_model=ChatSessionResponse)
async def rename_session(
    session_id: int,
    payload: ChatSessionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Rename a chat session"""
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")

    session.name = payload.name
    db.commit()
    db.refresh(session)
    return session

@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a chat session and its conversations"""
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")

    db.delete(session)
    db.commit()
    return {"message": "Chat session deleted"}

@router.delete("/history/{conversation_id}")
async def delete_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a specific conversation"""
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id,
        Conversation.user_id == current_user.id
    ).first()
    
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    db.delete(conversation)
    db.commit()
    
    return {"message": "Conversation deleted successfully"}