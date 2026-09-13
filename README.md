# DocuSense AI

A Vercel-compatible document intelligence chatbot that:
- Uploads PDF, DOCX, TXT, and MD documents
- Extracts and chunks text
- Generates Hugging Face embeddings
- Stores vectors in MongoDB Atlas Vector Search
- Estimates AI-likelihood using multiple text signals
- Chats with documents using RAG + a Hugging Face LLM
- Rewrites selected text naturally while preserving meaning

## Architecture

Next.js frontend -> FastAPI Python serverless API -> MongoDB Atlas + Hugging Face

This starter is designed for Vercel. It does not use Ollama, local model serving, or persistent local filesystem storage.

## Setup

### 1. MongoDB Atlas

Create a database and a `chunks` collection.

Create an Atlas Vector Search index named `vector_index` on `chunks.embedding`.

The vector dimensions must match the embedding model you select.

Example index definition:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 384,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "document_id"
    }
  ]
}
```

The default embedding model in this project is:
`sentence-transformers/all-MiniLM-L6-v2` (384 dimensions).

### 2. Hugging Face

Create an HF token with inference access and set:
- `HF_TOKEN`
- `HF_LLM_MODEL`
- `HF_EMBEDDING_MODEL`

The app uses the Hugging Face Inference API.

### 3. Environment variables

Copy `.env.example` to `.env.local` for local development.

Required:
- `MONGODB_URI`
- `MONGODB_DATABASE`
- `MONGODB_VECTOR_INDEX`
- `HF_TOKEN`

Optional:
- `HF_LLM_MODEL`
- `HF_EMBEDDING_MODEL`
- `ALLOWED_ORIGINS`

### 4. Backend local run

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### 5. Frontend local run

```bash
cd frontend
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_URL=http://localhost:8000`.

### 6. Vercel

For a simple deployment, the frontend and backend can be deployed as separate Vercel projects.

Frontend:
- Root Directory: `frontend`
- Framework: Next.js

Backend:
- Root Directory: `backend`
- Runtime: Python
- The included `vercel.json` routes `/api/*` to the FastAPI entrypoint.

Set the production environment variables in Vercel.

## API

- `GET /api/health`
- `POST /api/upload`
- `POST /api/analyze`
- `POST /api/chat`
- `POST /api/rewrite`
- `GET /api/documents/{document_id}`

## Detection note

The detector reports an AI-likelihood estimate, not proof of authorship. It combines stylometric and statistical signals. A classifier can be added later through `detector.py`.

## Production considerations

For large documents, move parsing/embedding work to a queue/worker architecture rather than doing long-running work inside a serverless request. This starter keeps the workflow simple for an MVP.
