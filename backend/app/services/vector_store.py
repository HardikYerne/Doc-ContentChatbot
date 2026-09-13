from app.database.mongodb import get_collection
from app.config import settings
from app.services.hf import embed_texts


async def store_chunks(document_id: str, filename: str, chunks: list[dict]):
    texts = [c["text"] for c in chunks]
    embeddings = await embed_texts(texts)

    collection = get_collection("chunks")
    docs = []
    for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        docs.append({
            "document_id": document_id,
            "filename": filename,
            "chunk_index": i,
            "page": chunk["page"],
            "text": chunk["text"],
            "embedding": embedding,
        })

    if docs:
        collection.insert_many(docs)
    return len(docs)


async def search(document_id: str, query: str, top_k: int = 5):
    vector = (await embed_texts([query]))[0]
    collection = get_collection("chunks")

    pipeline = [
        {
            "$vectorSearch": {
                "index": settings.mongodb_vector_index,
                "path": "embedding",
                "queryVector": vector,
                "numCandidates": max(top_k * 20, 50),
                "limit": top_k,
                "filter": {"document_id": document_id},
            }
        },
        {
            "$project": {
                "_id": 0,
                "text": 1,
                "page": 1,
                "chunk_index": 1,
                "score": {"$meta": "vectorSearchScore"},
            }
        },
    ]

    return list(collection.aggregate(pipeline))
