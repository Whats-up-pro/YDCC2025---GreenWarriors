"""
Sync endpoints - Backend API để đồng bộ dữ liệu từ client
"""
from fastapi import APIRouter, UploadFile, File, Form, Header, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional
import logging
import json

from app.models.database import SessionLocal, DetectionLog, User

router = APIRouter()
logger = logging.getLogger(__name__)

def get_db():
    """Get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/sync/detection")
async def sync_detection(
    background_tasks: BackgroundTasks,
    image: UploadFile = File(...),
    label: str = Form(...),
    confidence: float = Form(...),
    timestamp: str = Form(...),
    localInference: str = Form("false"),
    clientId: str = Form(""),
    metadata: Optional[str] = Form(None),
    processing_time: Optional[float] = Form(None),
    x_client_id: Optional[str] = Header(None),
):
    """
    Sync detection result từ client lên server
    
    Args:
        image: Image file
        label: Detection label (Healthy/WSD/Unknown)
        confidence: Confidence score (0-1)
        timestamp: ISO timestamp từ client
        localInference: true nếu inference trên client
        clientId: Unique client ID
        metadata: JSON metadata (location, pondId, notes)
        processing_time: Processing time in seconds
    
    Returns:
        JSON với detection_id
    """
    db_gen = get_db()
    db = next(db_gen)
    
    try:
        # Validate label
        if label not in ['Healthy', 'WSD', 'Unknown']:
            raise HTTPException(status_code=400, detail="Invalid label")
        
        # Validate confidence
        if not 0 <= confidence <= 1:
            raise HTTPException(status_code=400, detail="Confidence must be between 0 and 1")
        
        # Parse timestamp
        try:
            detected_at = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        except Exception:
            detected_at = datetime.utcnow()
        
        # Get or create user based on clientId
        client_id = clientId or x_client_id or "anonymous"
        user = db.query(User).filter(User.phone == client_id).first()
        if not user:
            user = User(
                phone=client_id,
                name=f"User_{client_id[:8]}"
            )
            db.add(user)
            db.flush()
        
        # Save image path (trong production nên lưu vào S3/CloudStorage)
        image_path = f"uploads/{client_id}_{int(detected_at.timestamp())}.jpg"
        
        # TODO: Thực tế nên save file vào storage
        # from pathlib import Path
        # upload_dir = Path("static/uploads")
        # upload_dir.mkdir(parents=True, exist_ok=True)
        # file_path = upload_dir / f"{client_id}_{int(detected_at.timestamp())}.jpg"
        # with open(file_path, "wb") as f:
        #     f.write(await image.read())
        
        # Tạo detection log
        detection = DetectionLog(
            user_id=user.id,
            image_path=image_path,
            prediction_label=label,
            confidence=confidence,
            created_at=detected_at
        )
        db.add(detection)
        db.commit()
        db.refresh(detection)
        
        logger.info(f"✅ Synced detection {detection.id} from client {client_id}: {label} ({confidence:.2f})")
        
        return JSONResponse({
            "status": "success",
            "detection_id": detection.id,
            "message": "Detection synced successfully"
        })
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Failed to sync detection: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")
    finally:
        db.close()


@router.post("/sync/beacon")
async def sync_beacon(
    background_tasks: BackgroundTasks,
    x_client_id: Optional[str] = Header(None)
):
    """
    Beacon API endpoint - Last chance sync khi page unload
    Nhận batch detections metadata (không có image)
    """
    try:
        # Beacon thường gửi lightweight data
        # Log for analytics
        logger.info(f"📡 Received beacon from client {x_client_id or 'unknown'}")
        
        return JSONResponse({
            "status": "received",
            "message": "Beacon data logged"
        })
        
    except Exception as e:
        logger.error(f"❌ Beacon sync failed: {str(e)}")
        # Don't raise exception for beacon - just log
        return JSONResponse({
            "status": "error",
            "message": str(e)
        }, status_code=200)  # Return 200 anyway


@router.get("/sync/status")
async def get_sync_status(
    client_id: Optional[str] = None,
    x_client_id: Optional[str] = Header(None)
):
    """
    Get sync status cho client
    Trả về số lượng detections đã sync
    """
    db_gen = get_db()
    db = next(db_gen)
    
    try:
        cid = client_id or x_client_id or "anonymous"
        
        user = db.query(User).filter(User.phone == cid).first()
        if not user:
            return JSONResponse({
                "synced_count": 0,
                "last_sync": None,
                "server_time": datetime.utcnow().isoformat()
            })
        
        detections = db.query(DetectionLog).filter(
            DetectionLog.user_id == user.id
        ).all()
        
        last_sync = None
        if detections:
            last_sync = max(d.created_at for d in detections).isoformat()
        
        wsd_count = sum(1 for d in detections if d.prediction_label == 'WSD')
        healthy_count = sum(1 for d in detections if d.prediction_label == 'Healthy')
        
        return JSONResponse({
            "synced_count": len(detections),
            "last_sync": last_sync,
            "user_id": user.id,
            "server_time": datetime.utcnow().isoformat(),
            "stats": {
                "total": len(detections),
                "wsd": wsd_count,
                "healthy": healthy_count
            }
        })
        
    except Exception as e:
        logger.error(f"❌ Failed to get sync status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.get("/sync/health")
async def sync_health():
    """Health check for sync service"""
    db_gen = get_db()
    db = next(db_gen)
    
    try:
        # Test database connection
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
        
        return JSONResponse({
            "status": "healthy",
            "database": "connected",
            "timestamp": datetime.utcnow().isoformat()
        })
    except Exception as e:
        return JSONResponse({
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }, status_code=503)
    finally:
        db.close()


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
        "notes": "Initial model release",
        "size_mb": 12.5
    }

