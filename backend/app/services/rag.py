from app.services.vector_store import search
from app.services.hf import generate


async def chat_with_document(document_id: str, question: str, top_k: int = 5):
    hits = await search(document_id, question, top_k)
    if not hits:
        return "I couldn't find relevant content in this document.", []

    context = "\n\n".join(
        f"[Page {h.get('page', '?')}]\n{h['text']}" for h in hits
    )

    prompt = f"""You are a document-grounded assistant.
Answer only from the supplied document context.
If the answer is not in the context, say you cannot find it in the document.
Do not invent facts.

DOCUMENT CONTEXT:
{context}

QUESTION:
{question}

ANSWER:
"""
    answer = await generate(prompt)
    sources = [
        {
            "page": h.get("page"),
            "chunk_index": h.get("chunk_index"),
            "score": h.get("score"),
        }
        for h in hits
    ]
    return answer.strip(), sources
