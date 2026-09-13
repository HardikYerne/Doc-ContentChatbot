import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.database.mongodb import get_collection
from app.services.parsers import extract_text
from app.services.chunker import chunk_pages
from app.services.vector_store import store_chunks

router = APIRouter()


@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    try:
        data = await file.read()
        if len(data) > 8 * 1024 * 1024:
            raise HTTPException(413, "File is larger than the 8 MB MVP limit.")

        pages = extract_text(data, file.filename or "document.txt")
        chunks = chunk_pages(pages)
        document_id = str(uuid.uuid4())

        get_collection("documents").insert_one({
            "_id": document_id,
            "filename": file.filename,
            "content_type": file.content_type,
            "word_count": sum(len(p["text"].split()) for p in pages),
            "page_count": len(pages),
            "status": "processing",
        })

        count = await store_chunks(document_id, file.filename or "document", chunks)

        get_collection("documents").update_one(
            {"_id": document_id},
            {"$set": {"status": "completed", "chunk_count": count}},
        )

        return {
            "document_id": document_id,
            "filename": file.filename,
            "pages": len(pages),
            "chunks": count,
            "status": "completed",
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, str(exc))
