from pymongo import MongoClient
from app.config import settings

_client = None


def get_client():
    global _client
    if _client is None:
        _client = MongoClient(
            settings.mongodb_uri,
            serverSelectionTimeoutMS=5000,
            maxPoolSize=10,
        )
    return _client


def get_db():
    return get_client()[settings.mongodb_database]


def get_collection(name: str):
    return get_db()[name]
