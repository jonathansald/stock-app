import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# Use DATABASE_URL env var if set (e.g. Railway volume at /data/cache.db),
# otherwise fall back to local file.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./cache.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from database.models import CacheEntry  # noqa: F401
    Base.metadata.create_all(bind=engine)
