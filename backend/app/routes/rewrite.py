from fastapi import APIRouter, HTTPException
from app.models.schemas import RewriteRequest
from app.services.rewriter import rewrite_text

router = APIRouter()


@router.post("/rewrite")
async def rewrite(request: RewriteRequest):
    try:
        result = await rewrite_text(
            request.document_id,
            request.text,
            request.instruction or "Make the writing natural and clear.",
        )
        return {"original": request.text, "rewritten": result}
    except Exception as exc:
        raise HTTPException(500, str(exc))
