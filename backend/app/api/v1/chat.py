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
from datetime import datetime

logger = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

n8n_client = N8NClient()

# Configure Gemini AI (optional, falls back to knowledge base if not configured)
gemini_model = None
if settings.GEMINI_API_KEY:
    try:
        from google import genai
        from google.genai import types
        
        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        gemini_model = client
        logger.info("Gemini AI configured (google.genai)")
    except Exception as e:
        logger.warning(f"Failed to configure Gemini AI: {e}")
else:
    logger.warning("GEMINI_API_KEY not set - using knowledge base only")


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


def _get_generic_response(message: str) -> str:
    """Provide generic helpful response when OpenAI and KB are unavailable."""
    message_lower = message.lower()
    
    # Disease detection keywords
    if any(word in message_lower for word in ['bệnh', 'wsd', 'white spot', 'đốm trắng', 'chết']):
        return """🔬 **Về phát hiện bệnh tôm:**

Hệ thống của chúng tôi hỗ trợ phát hiện bệnh đốm trắng (WSD) qua hình ảnh. Bạn có thể:
- Chụp ảnh tôm và upload lên để AI phân tích
- Nhận kết quả ngay lập tức với độ tin cậy cao
- Được cảnh báo sớm nếu phát hiện bệnh

Nếu cần tư vấn chi tiết, vui lòng liên hệ chuyên gia."""

    # Care and prevention keywords
    elif any(word in message_lower for word in ['chăm sóc', 'nuôi', 'phòng', 'điều trị']):
        return """🦐 **Về chăm sóc tôm:**

Một số nguyên tắc cơ bản:
- Kiểm tra chất lượng nước thường xuyên
- Cho ăn đúng liều lượng và thời gian
- Theo dõi dấu hiệu bất thường hàng ngày
- Vệ sinh ao thường xuyên

Sử dụng tính năng phát hiện bệnh để theo dõi sức khỏe đàn tôm."""

    # General greeting
    elif any(word in message_lower for word in ['xin chào', 'hello', 'chào', 'hê lô', 'hi']):
        return """👋 Xin chào! Tôi là trợ lý AI chuyên về nuôi tôm.

Tôi có thể giúp bạn:
- Phát hiện bệnh tôm qua hình ảnh
- Tư vấn về chăm sóc và phòng bệnh
- Cung cấp thông tin về bệnh đốm trắng (WSD)

Bạn cần hỗ trợ gì?"""

    # Default response
    else:
        return """Xin lỗi, tôi không tìm thấy thông tin liên quan trong cơ sở dữ liệu. 

Bạn có thể hỏi về:
- Phát hiện bệnh tôm
- Cách chăm sóc và nuôi tôm
- Phòng ngừa bệnh đốm trắng (WSD)

Hoặc sử dụng tính năng phát hiện bệnh bằng hình ảnh."""


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
        
        # Try Gemini AI if configured
        if gemini_model:
            try:
                # Build context from knowledge base
                context = "\n\n".join([
                    f"**{r['title']}**\n{r['content']}" 
                    for r in kb_results
                ]) if kb_results else ""
                
                # Build prompt for Gemini
                prompt = f"""Bạn là chuyên gia tư vấn nuôi tôm. 
Trả lời câu hỏi dựa trên kiến thức sau (nếu có):
{context}

Nếu không có thông tin liên quan, hãy dùng kiến thức chung về nuôi tôm.

Câu hỏi: {chat_request.message}

Trả lời ngắn gọn, súc tích trong 2-3 đoạn văn."""
                
                # Call Gemini API with correct model name
                response = gemini_model.models.generate_content(
                    model='embedding-gecko-001',
                    contents=prompt
                )
                response_text = response.text
                logger.info(f"Gemini AI response generated ({len(response_text)} chars)")
                
            except Exception as gemini_error:
                logger.error(f"Gemini AI error: {gemini_error}")
                # Fallback to knowledge base or generic response
                if kb_results:
                    response_text = f"Dựa trên kiến thức của chúng tôi:\n\n{kb_results[0]['content']}"
                else:
                    # Provide helpful generic response
                    response_text = _get_generic_response(chat_request.message)
        else:
            # Knowledge base only mode
            if kb_results:
                response_text = f"**{kb_results[0]['title']}**\n\n{kb_results[0]['content']}"
                if len(kb_results) > 1:
                    response_text += f"\n\nXem thêm: {', '.join([r['title'] for r in kb_results[1:]])}"
            else:
                response_text = _get_generic_response(chat_request.message)
        
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
