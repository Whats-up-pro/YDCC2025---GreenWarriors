# backend/app/api/v1/shrimp_video.py
import os
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse, JSONResponse

from app.services.shrimp_behavior_service import process_shrimp_behavior_video

router = APIRouter(prefix="/shrimp", tags=["shrimp-video"])

WORK_DIR = os.getenv("WORK_DIR", "backend_storage")  # bạn có thể đổi
UPLOAD_DIR = os.path.join(WORK_DIR, "uploads")
OUT_DIR = os.path.join(WORK_DIR, "outputs")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUT_DIR, exist_ok=True)

@router.post("/behavior")
async def shrimp_behavior(file: UploadFile = File(...)):
    if not file.filename.lower().endswith((".mp4", ".mov", ".avi", ".mkv")):
        raise HTTPException(status_code=400, detail="Unsupported video format")

    job_id = str(uuid.uuid4())
    in_path = os.path.join(UPLOAD_DIR, f"{job_id}_{file.filename}")
    out_video = os.path.join(OUT_DIR, f"{job_id}_annotated.mp4")
    out_json = os.path.join(OUT_DIR, f"{job_id}_metrics.json")

    # save upload
    try:
        with open(in_path, "wb") as f:
            f.write(await file.read())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Save video failed: {e}")

    # run pipeline (sync để dễ demo)
    try:
        result = process_shrimp_behavior_video(
            video_path=in_path,
            out_video_path=out_video,
            out_json_path=out_json,
            model_weights="yolov8n.pt",
            conf=0.25,
            iou=0.5,
            process_fps=10,
            window_sec=10,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Process failed: {e}")

    return JSONResponse({
        "job_id": job_id,
        "result": result,
        "download": {
            "annotated_video": f"/api/v1/shrimp/behavior/video/{job_id}",
            "metrics_json": f"/api/v1/shrimp/behavior/json/{job_id}",
        }
    })

@router.get("/behavior/video/{job_id}")
def get_annotated_video(job_id: str):
    path = os.path.join(OUT_DIR, f"{job_id}_annotated.mp4")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Annotated video not found")
    return FileResponse(path, media_type="video/mp4", filename=os.path.basename(path))

@router.get("/behavior/json/{job_id}")
def get_metrics_json(job_id: str):
    path = os.path.join(OUT_DIR, f"{job_id}_metrics.json")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Metrics json not found")
    return FileResponse(path, media_type="application/json", filename=os.path.basename(path))
