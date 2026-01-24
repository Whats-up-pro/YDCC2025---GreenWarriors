from fastapi import APIRouter, HTTPException, Depends, Request
from app.models.schemas import ChatRequest, ChatResponse
from app.models.database import SessionLocal, KnowledgeBase
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

# Configure OpenAI (optional, falls back to knowledge base if not configured)
openai_client = None
if settings.OPENAI_API_KEY:
    try:
        from openai import OpenAI
        
        openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)
        logger.info("OpenAI configured successfully")
    except Exception as e:
        logger.warning(f"Failed to configure OpenAI: {e}")
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
        
        # Try OpenAI if configured
        if openai_client:
            try:
                # Build context from knowledge base
                context = "\n\n".join([
                    f"**{r['title']}**\n{r['content']}" 
                    for r in kb_results
                ]) if kb_results else ""
                
                # Build system prompt
                system_prompt = """Bạn là chuyên gia tư vấn nuôi tôm tại Việt Nam. 
Bạn có kiến thức sâu rộng về:
- Phát hiện và phòng ngừa bệnh tôm (đặc biệt bệnh đốm trắng WSD/WSSV)
- Kỹ thuật nuôi tôm thẻ chân trắng, tôm sú
- Quản lý chất lượng nước ao nuôi
- Cho ăn và dinh dưỡng tôm

Trả lời ngắn gọn, súc tích, dễ hiểu. Sử dụng emoji phù hợp để tăng tính thân thiện."""

                # Build user message with context
                user_message = chat_request.message
                if context:
                    user_message = f"""Thông tin tham khảo từ cơ sở dữ liệu:
{context}

Câu hỏi của người dùng: {chat_request.message}"""
                
                # Call OpenAI API
                response = openai_client.chat.completions.create(
                    model="gpt-4o-mini",  # Cost-effective model
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message}
                    ],
                    max_tokens=500,
                    temperature=0.7
                )
                response_text = response.choices[0].message.content
                logger.info(f"OpenAI response generated ({len(response_text)} chars)")
                
            except Exception as openai_error:
                logger.error(f"OpenAI error: {openai_error}")
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
