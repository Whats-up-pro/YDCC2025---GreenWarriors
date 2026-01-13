from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from app.models.schemas import DetectionResponse
from app.services.ai_service import AIService
from app.services.n8n_client import N8NClient
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

ai_service = AIService()
n8n_client = N8NClient()

async def _trigger_n8n_background(detection_data: dict):
    await n8n_client.log_detection(detection_data)

@router.post("/detect", response_model=DetectionResponse)
async def detect_disease(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="Invalid file type")
    
    try:
        image_bytes = await file.read()
        if len(image_bytes) > settings.MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=400, detail="File too large")
        
        label, confidence, processing_time = ai_service.predict(image_bytes)
        
        if confidence >= settings.MODEL_CONFIDENCE_THRESHOLD:
            detection_data = {
                "label": label,
                "confidence": confidence,
                "processing_time": processing_time
            }
            background_tasks.add_task(_trigger_n8n_background, detection_data)
        
        return DetectionResponse(
            label=label,
            confidence=confidence,
            processing_time=processing_time
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Detection error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Detection failed")
