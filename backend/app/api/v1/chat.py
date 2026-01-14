from fastapi import APIRouter, HTTPException, Depends, Request
from app.models.schemas import ChatRequest, ChatResponse
from app.models.database import SessionLocal, KnowledgeBase
from app.services.n8n_client import N8NClient
from app.core.config import settings
from app.core.security import verify_api_key
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import text
from slowapi import Limiter
from slowapi.util import get_remote_address
import logging
import os
import openai
from datetime import datetime

logger = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

n8n_client = N8NClient()

# Configure OpenAI (optional, falls back to knowledge base if not configured)
openai_api_key = os.getenv("OPENAI_API_KEY")
if openai_api_key:
    openai.api_key = openai_api_key
    logger.info("OpenAI API configured")
else:
    logger.warning("OPENAI_API_KEY not set - using knowledge base only")


def search_knowledge_base(query: str, db, limit: int = 3):
    """Search knowledge base for relevant information."""
    try:
        # Simple search using ILIKE (case-insensitive pattern match)
        results = db.query(KnowledgeBase).filter(
            KnowledgeBase.is_active == True,
            (KnowledgeBase.title.ilike(f"%{query}%") | 
             KnowledgeBase.content.ilike(f"%{query}%"))
        ).limit(limit).all()
        
        return [{
            "title": r.title,
            "content": r.content,
            "category": r.category
        } for r in results]
    except Exception as e:
        logger.error(f"Knowledge base search error: {e}")
        return []


@router.post("/chat", response_model=ChatResponse)
@limiter.limit("20/minute")  # 20 chat messages per minute per IP
async def chat(
    request: Request,
    chat_request: ChatRequest,
    api_key: str = Depends(verify_api_key)
):
    """Chat endpoint with OpenAI integration and knowledge base fallback."""
    
    # VALIDATION: Input validation
    if not chat_request.message or len(chat_request.message.strip()) == 0:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    if len(chat_request.message) > 1000:
        raise HTTPException(status_code=400, detail="Message too long (max 1000 characters)")
    
    db = SessionLocal()
    
    try:
        logger.info(f"Chat request: {chat_request.message[:50]}...")
        
        # Search knowledge base first
        kb_results = search_knowledge_base(chat_request.message, db)
        
        # Try OpenAI if configured
        if openai_api_key:
            try:
                # Build context from knowledge base
                context = "\n\n".join([
                    f"**{r['title']}**\n{r['content']}" 
                    for r in kb_results
                ]) if kb_results else ""
                
                # Call OpenAI API
                response = openai.ChatCompletion.create(
                    model="gpt-3.5-turbo",
                    messages=[
                        {
                            "role": "system", 
                            "content": f"""Bạn là chuyên gia tư vấn nuôi tôm. 
Trả lời câu hỏi dựa trên kiến thức sau (nếu có):
{context}

Nếu không có thông tin liên quan, hãy dùng kiến thức chung về nuôi tôm."""
                        },
                        {"role": "user", "content": chat_request.message}
                    ],
                    max_tokens=500,
                    temperature=0.7
                )
                
                response_text = response.choices[0].message.content
                logger.info(f"OpenAI response generated ({len(response_text)} chars)")
                
            except Exception as openai_error:
                logger.error(f"OpenAI API error: {openai_error}")
                # Fallback to knowledge base
                if kb_results:
                    response_text = f"Dựa trên kiến thức của chúng tôi:\n\n{kb_results[0]['content']}"
                else:
                    response_text = "Xin lỗi, tôi không tìm thấy thông tin liên quan. Vui lòng liên hệ chuyên gia để được tư vấn chi tiết."
        else:
            # Knowledge base only mode
            if kb_results:
                response_text = f"**{kb_results[0]['title']}**\n\n{kb_results[0]['content']}"
                if len(kb_results) > 1:
                    response_text += f"\n\nXem thêm: {', '.join([r['title'] for r in kb_results[1:]])}"
            else:
                response_text = "Xin lỗi, tôi không tìm thấy thông tin liên quan trong cơ sở dữ liệu. Vui lòng hỏi về bệnh tôm, cách chăm sóc hoặc phòng bệnh."
        
        return ChatResponse(
            response=response_text,
            timestamp=datetime.utcnow()
        )
        
    except HTTPException:
        raise
    except SQLAlchemyError as db_error:
        logger.error(f"Database error in chat: {db_error}", exc_info=True)
        raise HTTPException(status_code=500, detail="Database query failed")
    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Chat processing failed")
    finally:
        db.close()
