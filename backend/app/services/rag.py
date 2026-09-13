from app.services.vector_store import search
from app.services.hf import generate
from app.services.small_talk import detect_small_talk


async def chat_with_document(document_id: str, question: str, top_k: int = 5):
    # Casual messages ("hi", "thanks", "who are you?", ...) are answered
    # directly and never touch Mongo, the vector search, or the LLM —
    # the document RAG path below is completely unchanged for real questions.
    canned_reply = detect_small_talk(question)
    if canned_reply:
        return canned_reply, []

    hits = await search(document_id, question, top_k)
    if not hits:
        return "I couldn't find relevant content in this document.", []

    context = "\n\n".join(
        f"[Page {h.get('page', '?')}]\n{h['text']}" for h in hits
    )

    prompt = f"""You are QuantumMines AI, an assistant that helps a user work with one uploaded document.

Ground rule: never invent facts, figures, or claims that aren't supported by the document context below.

Within that rule, you should actively help with whatever the user is asking for — not just answer factual
questions. That includes drafting emails, generating outlines or new write-ups, rewriting or translating
passages, building summaries, quizzes, mind maps, presentations, or structured extracts, and comparing the
document to something the user describes. These are legitimate requests: use the document as your source
material and your own judgment to phrase, translate, restructure, or reformat it as asked. Do not refuse a
request just because the exact output text isn't already written verbatim in the document — that's expected
for tasks like drafting, rewriting, or translating.

Only push back if the request genuinely cannot be completed with what you have — for example, comparing
against a job description or second document the user hasn't actually provided yet. In that case, briefly
say what's missing and ask for it, rather than giving a blanket refusal.

DOCUMENT CONTEXT:
{context}

USER REQUEST:
{question}

RESPONSE:
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
