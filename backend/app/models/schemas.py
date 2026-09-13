from typing import Optional, List
from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    document_id: str


class ChatRequest(BaseModel):
    document_id: str
    message: str = Field(min_length=1, max_length=10000)
    top_k: int = Field(default=5, ge=1, le=10)


class RewriteRequest(BaseModel):
    document_id: str
    text: str = Field(min_length=1, max_length=12000)
    instruction: Optional[str] = "Make the writing natural and clear while preserving meaning."


class ChatResponse(BaseModel):
    answer: str
    sources: List[dict] = []
