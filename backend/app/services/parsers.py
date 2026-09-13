from io import BytesIO
from pathlib import Path
import fitz
from docx import Document as DocxDocument


SUPPORTED = {".pdf", ".docx", ".txt", ".md"}


def extract_text(data: bytes, filename: str):
    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED:
        raise ValueError(f"Unsupported file type: {ext}")

    pages = []

    if ext == ".pdf":
        pdf = fitz.open(stream=data, filetype="pdf")
        for i, page in enumerate(pdf):
            text = page.get_text("text") or ""
            if text.strip():
                pages.append({"page": i + 1, "text": text.strip()})
        pdf.close()

    elif ext == ".docx":
        doc = DocxDocument(BytesIO(data))
        text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        if text.strip():
            pages.append({"page": 1, "text": text.strip()})

    else:
        text = data.decode("utf-8", errors="ignore")
        if text.strip():
            pages.append({"page": 1, "text": text.strip()})

    if not pages:
        raise ValueError("No readable text was found in the document.")

    return pages
