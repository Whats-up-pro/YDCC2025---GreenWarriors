"""
Push notification endpoints - Backend API cho Push Notifications
+ Video upload endpoint
+ (Optional) Run shrimp behavior pipeline (YOLOv8 + ByteTrack) after upload
"""
from fastapi import APIRouter, HTTPException, Body, UploadFile, File, BackgroundTasks, Query
from fastapi.responses import JSONResponse
from typing import Optional, Dict, Any
import logging
from pathlib import Path
import uuid
import time

router = APIRouter(prefix="/push", tags=["push"])
logger = logging.getLogger(__name__)

# In-memory storage cho demo (production nên dùng database)
subscriptions_store: Dict[str, Dict[str, Any]] = {}

# In-memory job store cho xử lý video (demo)
video_jobs: Dict[str, Dict[str, Any]] = {}

# =========================
# VIDEO UPLOAD CONFIG
# =========================
UPLOAD_DIR = Path("media/uploads/videos")   # bạn có thể đổi
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

OUTPUT_DIR = Path("media/outputs/shrimp_behavior")  # output annotated + metrics
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_VIDEO_TYPES = {
    "video/mp4",
    "video/quicktime",   # .mov
    "video/webm",
    "video/x-matroska",  # .mkv (tùy browser sẽ khác)
    "application/octet-stream",  # một số client gửi kiểu này
}
MAX_UPLOAD_MB = 200  # chỉnh theo nhu cầu
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024


async def _save_upload_file_streaming(upload_file: UploadFile, dst_path: Path) -> int:
    """
    Save UploadFile to disk by streaming chunks (không load hết vào RAM).
    Returns: total bytes written
    """
    total = 0
    chunk_size = 1024 * 1024  # 1MB

    try:
        with dst_path.open("wb") as f:
            while True:
                chunk = await upload_file.read(chunk_size)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large. Max {MAX_UPLOAD_MB}MB"
                    )
                f.write(chunk)
    finally:
        await upload_file.close()

    return total


def _run_behavior_pipeline_job(file_id: str, in_path: Path) -> None:
    """
    Background task wrapper: chạy pipeline và cập nhật trạng thái vào video_jobs (demo).
    """
    started_at = time.time()
    try:
        video_jobs[file_id] = {
            "status": "running",
            "started_at": started_at,
            "finished_at": None,
            "error": None,
            "input_path": str(in_path),
            "annotated_video_url": f"/media/outputs/shrimp_behavior/{file_id}_annotated.mp4",
            "metrics_json_url": f"/media/outputs/shrimp_behavior/{file_id}_metrics.json",
        }

        # Import service tại đây để nếu thiếu deps thì báo lỗi rõ ràng
        try:
            from app.services.shrimp_behavior_service import process_shrimp_behavior_video
        except Exception as e:
            raise RuntimeError(
                "Missing shrimp behavior dependencies/service. "
                "Ensure you added ultralytics + supervision + opencv-python-headless "
                "and created app/services/shrimp_behavior_service.py"
            ) from e

        out_video = OUTPUT_DIR / f"{file_id}_annotated.mp4"
        out_json = OUTPUT_DIR / f"{file_id}_metrics.json"

        # Chạy pipeline
        result = process_shrimp_behavior_video(
            video_path=str(in_path),
            out_video_path=str(out_video),
            out_json_path=str(out_json),
            model_weights="yolov8n.pt",
            conf=0.25,
            iou=0.5,
            process_fps=10,
            window_sec=10,
        )

        video_jobs[file_id].update({
            "status": "done",
            "finished_at": time.time(),
            "result": result,
        })

    except Exception as e:
        logger.exception(f"Behavior pipeline failed for {file_id}: {e}")
        if file_id not in video_jobs:
            video_jobs[file_id] = {}
        video_jobs[file_id].update({
            "status": "failed",
            "finished_at": time.time(),
            "error": str(e),
        })


@router.post("/upload-video")





async def upload_video(
    background_tasks: BackgroundTasks,
    video: UploadFile = File(...),
    process: bool = Query(True, description="Nếu true sẽ chạy pipeline hành vi sau khi upload"),
    async_mode: bool = Query(True, description="Nếu true chạy background; nếu false chạy sync và trả kết quả ngay"),

):
    """
    Upload video (multipart/form-data)

    Form field:
      - video: file video

    Query:
      - process: bool (default true) -> có chạy pipeline hay không
      - async_mode: bool (default true) -> background hay sync

    Returns:
      - file info + URL + (optional) job info / result
    """
    logger.warning("=== PUSH UPLOAD VIDEO endpoint NEW VERSION ===")
    try:
        if not video:
            raise HTTPException(status_code=400, detail="Missing video file")

        content_type = (video.content_type or "").lower()

        # Validate content-type (mềm dẻo vì có client gửi octet-stream)
        if content_type not in ALLOWED_VIDEO_TYPES:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported media type: {content_type}. Allowed: {sorted(ALLOWED_VIDEO_TYPES)}"
            )

        # Lấy extension từ tên file (fallback .mp4)
        orig_name = video.filename or "video"
        suffix = Path(orig_name).suffix.lower()
        if not suffix:
            suffix = ".mp4" if content_type in ("video/mp4", "application/octet-stream") else ""

        # Tạo tên file unique
        file_id = uuid.uuid4().hex
        safe_name = f"{file_id}{suffix}"
        dst_path = UPLOAD_DIR / safe_name

        size_bytes = await _save_upload_file_streaming(video, dst_path)

        # URL public (cần app.mount để serve folder media)
        # Ví dụ mount: app.mount("/media", StaticFiles(directory="media"), name="media")
        public_url = f"/media/uploads/videos/{safe_name}"

        resp: Dict[str, Any] = {
            "status": "success",
            "file_id": file_id,
            "filename": safe_name,
            "original_filename": orig_name,
            "content_type": content_type,
            "size_bytes": size_bytes,
            "url": public_url
        }

        if process:
            # set job placeholder
            video_jobs[file_id] = {
                "status": "queued",
                "started_at": None,
                "finished_at": None,
                "error": None,
                "input_path": str(dst_path),
                "annotated_video_url": f"/media/outputs/shrimp_behavior/{file_id}_annotated.mp4",
                "metrics_json_url": f"/media/outputs/shrimp_behavior/{file_id}_metrics.json",
            }

            if async_mode:
                background_tasks.add_task(_run_behavior_pipeline_job, file_id, dst_path)
                resp["processed"] = {
                    "status": "queued",
                    "job_status_url": f"/api/v1/push/video-job/{file_id}",
                    "annotated_video_url": video_jobs[file_id]["annotated_video_url"],
                    "metrics_json_url": video_jobs[file_id]["metrics_json_url"],
                }
            else:
                # chạy sync (demo nhanh nhưng request có thể lâu)
                _run_behavior_pipeline_job(file_id, dst_path)
                resp["processed"] = {
                    "status": video_jobs[file_id]["status"],
                    "job_status_url": f"/api/v1/push/video-job/{file_id}",
                    "annotated_video_url": video_jobs[file_id]["annotated_video_url"],
                    "metrics_json_url": video_jobs[file_id]["metrics_json_url"],
                    "error": video_jobs[file_id].get("error"),
                    "result": video_jobs[file_id].get("result"),
                }

        return JSONResponse(resp)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to upload video: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/video-job/{file_id}")
async def get_video_job(file_id: str):
    """
    Lấy trạng thái job xử lý video (demo).
    Frontend có thể poll endpoint này tới khi status=done.
    """
    job = video_jobs.get(file_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JSONResponse({"status": "success", "job": job})


@router.post("/subscribe")
async def subscribe_push(
    subscription: Dict[str, Any] = Body(...),
    userAgent: Optional[str] = Body(None),
    timestamp: Optional[int] = Body(None)
):
    try:
        endpoint = subscription.get('endpoint')
        if not endpoint:
            raise HTTPException(status_code=400, detail="Missing endpoint in subscription")

        subscriptions_store[endpoint] = {
            'subscription': subscription,
            'userAgent': userAgent,
            'timestamp': timestamp,
            'active': True
        }

        logger.info(f"Push subscription saved: {endpoint[:50]}...")

        return JSONResponse({
            "status": "success",
            "message": "Push subscription saved",
            "endpoint": endpoint[:50] + "..."
        })

    except Exception as e:
        logger.error(f"Failed to save push subscription: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/unsubscribe")
async def unsubscribe_push(
    endpoint: str = Body(..., embed=True)
):
    try:
        if endpoint in subscriptions_store:
            del subscriptions_store[endpoint]
            logger.info(f"Push subscription removed: {endpoint[:50]}...")

            return JSONResponse({
                "status": "success",
                "message": "Push subscription removed"
            })
        else:
            return JSONResponse({
                "status": "not_found",
                "message": "Subscription not found"
            })

    except Exception as e:
        logger.error(f"Failed to remove push subscription: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/send")
async def send_push_notification(
    endpoint: Optional[str] = Body(None),
    title: str = Body(...),
    body: str = Body(...),
    icon: Optional[str] = Body(None),
    data: Optional[Dict[str, Any]] = Body(None),
    broadcast: bool = Body(False)
):
    try:
        sent_count = 0
        failed_count = 0

        targets = []
        if broadcast:
            targets = list(subscriptions_store.values())
        elif endpoint and endpoint in subscriptions_store:
            targets = [subscriptions_store[endpoint]]

        for sub_data in targets:
            try:
                sent_count += 1
                logger.info(f"Push notification sent: {title}")
            except Exception as e:
                failed_count += 1
                logger.error(f"Failed to send push: {str(e)}")

        return JSONResponse({
            "status": "success",
            "sent": sent_count,
            "failed": failed_count,
            "total_subscribers": len(subscriptions_store)
        })

    except Exception as e:
        logger.error(f"Failed to send push notifications: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/subscriptions")
async def get_subscriptions():
    try:
        return JSONResponse({
            "status": "success",
            "count": len(subscriptions_store),
            "subscriptions": [
                {
                    "endpoint": endpoint[:50] + "...",
                    "userAgent": data.get('userAgent', 'Unknown'),
                    "timestamp": data.get('timestamp'),
                    "active": data.get('active', True)
                }
                for endpoint, data in subscriptions_store.items()
            ]
        })

    except Exception as e:
        logger.error(f"Failed to get subscriptions: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def push_health():
    return JSONResponse({
        "status": "healthy",
        "active_subscriptions": len(subscriptions_store),
        "video_jobs": len(video_jobs),
    })
