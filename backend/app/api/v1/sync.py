from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from datetime import datetime
from typing import Optional
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/sync")
async def sync_detection(
    image: UploadFile = File(...),
    label: str = Form(...),
    confidence: float = Form(...),
    timestamp: str = Form(...),
    processing_time: Optional[float] = Form(None)
):
    """
    Sync detection result from offline device.
    Receives data that was stored locally and syncs to server.
    """
    try:
        # Parse timestamp
        detection_time = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        
        # Validate label
        if label not in ['Healthy', 'WSD']:
            raise HTTPException(status_code=400, detail="Invalid label")
        
        # Validate confidence
        if not 0 <= confidence <= 1:
            raise HTTPException(status_code=400, detail="Confidence must be between 0 and 1")
        
        # Read image data
        image_data = await image.read()
        
        # TODO: Save to database
        # For now, just log the sync
        logger.info(f"Synced detection: label={label}, confidence={confidence:.2f}, timestamp={detection_time}")
        
        # TODO: Trigger n8n webhook for notifications if WSD detected
        # if label == 'WSD' and confidence > 0.8:
        #     await n8n_client.trigger_alert(...)
        
        return {
            "status": "synced",
            "message": "Detection record synced successfully",
            "timestamp": datetime.utcnow().isoformat(),
            "data": {
                "label": label,
                "confidence": confidence,
                "original_timestamp": detection_time.isoformat()
            }
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid data format: {str(e)}")
    except Exception as e:
        logger.error(f"Sync failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Sync failed")


@router.get("/sync/status")
async def get_sync_status():
    """
    Get server sync status and statistics.
    """
    # TODO: Implement actual statistics from database
    return {
        "status": "healthy",
        "server_time": datetime.utcnow().isoformat(),
        "stats": {
            "total_synced_today": 0,
            "total_detections": 0,
            "wsd_count": 0,
            "healthy_count": 0
        }
    }


@router.get("/model/version")
async def get_model_version():
    """
    Get current AI model version for client-side model updates.
    """
    return {
        "version": "1.0.0",
        "release_date": "2024-01-01",
        "model_url": "/models/shrimp_model_v1.zip",
        "checksum": "abc123",  # For integrity verification
        "notes": "Initial model release"
    }
