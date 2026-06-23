from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from .config import Config

# SQLite needs connect_args for thread safety with FastAPI
connect_args = {"check_same_thread": False} if Config.DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(Config.DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
