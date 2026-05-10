from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings
import logging

logger = logging.getLogger(__name__)

_client: AsyncIOMotorClient | None = None
_db = None

# In-memory fallback when MongoDB is unavailable
_memory_store: dict = {
    "scans": [],
    "optimizations": [],
}


async def connect_db():
    global _client, _db
    if not settings.has_mongodb:
        logger.warning("MONGODB_URI not set — using in-memory store (data resets on restart)")
        return
    try:
        _client = AsyncIOMotorClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
        await _client.admin.command("ping")
        _db = _client[settings.mongodb_db_name]
        logger.info(f"Connected to MongoDB: {settings.mongodb_db_name}")
    except Exception as e:
        logger.warning(f"MongoDB connection failed: {e} — using in-memory store")
        _client = None
        _db = None


async def disconnect_db():
    global _client
    if _client:
        _client.close()


def get_db():
    return _db


def get_memory_store():
    return _memory_store
