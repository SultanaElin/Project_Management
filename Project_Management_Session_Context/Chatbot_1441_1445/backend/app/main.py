from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import timedelta
from .database import engine, get_db
from . import models, auth, chat
from .schemas import UserCreate, UserResponse, Token, UserLogin
from .auth import authenticate_user, create_access_token, get_password_hash
from .config import Config

# Create database tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="LLM Chatbot API", version="1.0.0")

# CORS configuration - Allow frontend apps
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:8501",
        "http://localhost:5000",
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(chat.router, prefix="/api", tags=["chat"])

@app.post("/api/register", response_model=UserResponse)
def register(user: UserCreate, db: Session = Depends(get_db)):
    """Register a new user"""
    # Check if user exists
    existing_user = db.query(models.User).filter(models.User.username == user.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    # Create new user
    hashed_password = get_password_hash(user.password)
    db_user = models.User(username=user.username, password_hash=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    return db_user

@app.post("/api/login", response_model=Token)
def login(user: UserLogin, db: Session = Depends(get_db)):
    """Login and get access token"""
    authenticated_user = authenticate_user(db, user.username, user.password)
    if not authenticated_user:
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    
    access_token_expires = timedelta(minutes=Config.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": authenticated_user.username}, expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "model": Config.MODEL_NAME}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)