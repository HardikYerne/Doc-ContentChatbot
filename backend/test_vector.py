import asyncio

from app.services.hf import embed_texts
from app.database.mongodb import get_collection


async def main():
    query = "What tools and technologies are mentioned in this document?"

    vector = (await embed_texts([query]))[0]

    collection = get_collection("chunks")

    pipeline = [
        {
            "$vectorSearch": {
                "index": "vector_index",
                "path": "embedding",
                "queryVector": vector,
                "numCandidates": 50,
                "limit": 5,
            }
        },
        {
            "$project": {
                "_id": 0,
                "document_id": 1,
                "text": 1,
                "page": 1,
                "chunk_index": 1,
                "score": {"$meta": "vectorSearchScore"},
            }
        },
    ]

    results = list(collection.aggregate(pipeline))

    print("RESULTS:")
    print(results)


asyncio.run(main())