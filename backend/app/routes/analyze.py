from fastapi import APIRouter, HTTPException
from app.models.schemas import AnalyzeRequest
from app.database.mongodb import get_collection
from app.services.detector import analyze_text

router = APIRouter()


@router.post("/analyze")
async def analyze_document(request: AnalyzeRequest):
    chunks = list(get_collection("chunks").find(
        {"document_id": request.document_id},
        {"_id": 0, "text": 1, "page": 1, "chunk_index": 1},
    ))

    if not chunks:
        raise HTTPException(404, "Document chunks not found.")

    sections = []
    all_text = []

    for chunk in chunks:
        result = analyze_text(chunk["text"])
        sections.append({
            "chunk_index": chunk["chunk_index"],
            "page": chunk.get("page"),
            **result,
        })
        all_text.append(chunk["text"])

    combined = analyze_text("\n\n".join(all_text))
    valid_scores = [s["score"] for s in sections if s["score"] is not None]

    result = {
        "document_id": request.document_id,
        "overall_ai_likelihood": combined["score"],
        "confidence": combined["confidence"],
        "word_count": combined["features"]["word_count"],
        "sections": sections,
        "high_likelihood_sections": [
            s for s in sections if s["score"] is not None and s["score"] >= 70
        ],
        "note": "AI-likelihood is an estimate based on text signals and should not be treated as proof of AI authorship.",
    }

    get_collection("analyses").update_one(
        {"document_id": request.document_id},
        {"$set": result},
        upsert=True,
    )

    return result
