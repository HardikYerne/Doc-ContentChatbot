from fastapi import APIRouter, HTTPException
from app.database.mongodb import get_collection

router = APIRouter()


@router.get("/documents/{document_id}")
async def get_document(document_id: str):
    doc = get_collection("documents").find_one(
        {"_id": document_id},
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(404, "Document not found.")

    analysis = get_collection("analyses").find_one(
        {"document_id": document_id},
        {"_id": 0},
    )

    return {"document": doc, "analysis": analysis}
