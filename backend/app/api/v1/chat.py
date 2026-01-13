from fastapi import APIRouter, HTTPException
from app.models.schemas import ChatRequest, ChatResponse
from app.services.n8n_client import N8NClient
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

n8n_client = N8NClient()

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        response_text = f"Mock response to: {request.message}"
        
        return ChatResponse(response=response_text)
    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail="Chat processing failed")
