from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Request
from app.models.schemas import DetectionResponse
from app.models.database import SessionLocal, DetectionLog
from app.services.ai_service import AIService
from app.core.config import settings
from app.core.security import verify_api_key
from sqlalchemy.exc import SQLAlchemyError
from slowapi import Limiter
from slowapi.util import get_remote_address
from datetime import datetime
import logging
import magic
import os

logger = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

ai_service = AIService()

@router.post("/detect", response_model=DetectionResponse)
@limiter.limit("10/minute")  # 10 detections per minute per IP
async def detect_disease(
    request: Request,
    file: UploadFile = File(...),
    api_key: str = Depends(verify_api_key)
):
    """Detect shrimp disease from uploaded image with database logging."""
    
    # VALIDATION LAYER 1: Content-Type check
    if not file.content_type or not file.content_type.startswith('image/'):
        logger.warning(f"Invalid content type: {file.content_type}")
        raise HTTPException(status_code=400, detail="Invalid file type. Must be image.")
    
    # VALIDATION LAYER 2: File extension check
    file_ext = os.path.splitext(file.filename)[1].lower() if file.filename else ''
    if file_ext not in settings.ALLOWED_EXTENSIONS:
        logger.warning(f"Disallowed file extension: {file_ext}")
        raise HTTPException(
            status_code=400, 
            detail=f"File extension not allowed. Allowed: {', '.join(settings.ALLOWED_EXTENSIONS)}"
        )
    
    db = SessionLocal()
    detection_id = None
    
    try:
        # Read file content
        image_bytes = await file.read()
        
        # VALIDATION LAYER 3: File size check
        if len(image_bytes) > settings.MAX_UPLOAD_SIZE:
            logger.warning(f"File too large: {len(image_bytes)} bytes")
            raise HTTPException(
                status_code=400, 
                detail=f"File too large. Max size: {settings.MAX_UPLOAD_SIZE / 1024 / 1024}MB"
            )
        
        # VALIDATION LAYER 4: Magic bytes check (verify actual file type)
        try:
            mime = magic.Magic(mime=True)
            actual_mime = mime.from_buffer(image_bytes)
            if not actual_mime.startswith('image/'):
                logger.warning(f"File is not an image. Actual MIME: {actual_mime}")
                raise HTTPException(
                    status_code=400,
                    detail="File content is not a valid image"
                )
        except Exception as magic_error:
            logger.warning(f"Magic bytes check failed: {magic_error}. Proceeding with caution.")
        
        # AI PREDICTION
        logger.info(f"Processing image: {file.filename} ({len(image_bytes)} bytes)")
        label, confidence, processing_time = ai_service.predict(image_bytes)
        logger.info(f"Prediction: {label} ({confidence:.2%}) in {processing_time:.2f}s")
        
        # SAVE TO DATABASE (TRANSACTION)
        with db.begin():
            detection_log = DetectionLog(
                user_id=None,  # TODO: Add user authentication
                image_path=file.filename,
                prediction_label=label,
                confidence=confidence,
                created_at=datetime.utcnow()
            )
            db.add(detection_log)
            db.flush()  # Get ID before commit
            detection_id = detection_log.id
        
        logger.info(f"Saved detection to database: ID={detection_id}")
        
        return DetectionResponse(
            label=label,
            confidence=confidence,
            processing_time=processing_time
        )
        
    except HTTPException:
        # Re-raise HTTP exceptions (validation errors)
        raise
    except SQLAlchemyError as db_error:
        # Database errors
        logger.error(f"Database error during detection: {db_error}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=500, 
            detail="Failed to save detection result to database"
        )
    except Exception as e:
        # Unexpected errors
        logger.error(f"Detection error: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Detection processing failed")
    finally:
        db.close()
