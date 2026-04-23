import json
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from database.models import CacheEntry


def get_cached(db: Session, key: str) -> dict | None:
    entry = db.query(CacheEntry).filter(CacheEntry.cache_key == key).first()
    if entry and entry.expires_at > datetime.utcnow():
        return json.loads(entry.data)
    if entry:
        db.delete(entry)
        db.commit()
    return None


def set_cache(db: Session, key: str, data: dict, ttl_seconds: int) -> None:
    now = datetime.utcnow()
    expires = now + timedelta(seconds=ttl_seconds)
    entry = db.query(CacheEntry).filter(CacheEntry.cache_key == key).first()
    if entry:
        entry.data = json.dumps(data)
        entry.created_at = now
        entry.expires_at = expires
    else:
        entry = CacheEntry(
            cache_key=key,
            data=json.dumps(data),
            created_at=now,
            expires_at=expires,
        )
        db.add(entry)
    db.commit()
