from fastapi import APIRouter, HTTPException
from app.models.schemas import ChatRequest
from app.services.rag import chat_with_document

router = APIRouter()


@router.post("/chat")
async def chat(request: ChatRequest):
    try:
        answer, sources = await chat_with_document(
            request.document_id, request.message, request.top_k
        )
        return {"answer": answer, "sources": sources}
    except Exception as exc:
        raise HTTPException(500, str(exc))
