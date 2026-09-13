from app.services.vector_store import search
from app.services.hf import generate


async def rewrite_text(document_id: str, text: str, instruction: str):
    hits = await search(document_id, text, top_k=3)
    context = "\n\n".join(h["text"] for h in hits)

    prompt = f"""Rewrite the user's text naturally.

Rules:
- Preserve the original meaning.
- Preserve facts, names, numbers, citations, references, and technical terms.
- Do not invent information.
- Do not remove important claims.
- Improve natural flow, clarity, sentence variety, and readability.
- Follow the user's instruction.

USER INSTRUCTION:
{instruction}

SURROUNDING DOCUMENT CONTEXT:
{context}

TEXT TO REWRITE:
{text}

REWRITTEN TEXT:
"""
    return (await generate(prompt)).strip()
