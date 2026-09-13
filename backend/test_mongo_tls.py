import certifi
import pymongo
from app.config import settings

print("PyMongo:", pymongo.version)
print("CA:", certifi.where())

client = pymongo.MongoClient(
    settings.mongodb_uri,
    tls=True,
    tlsCAFile=certifi.where(),
    serverSelectionTimeoutMS=10000,
)

print(client.admin.command("ping"))
print("MongoDB TLS connection OK")