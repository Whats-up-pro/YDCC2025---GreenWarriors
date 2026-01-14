from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1 import detect, chat, sync
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    debug=settings.DEBUG
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(detect.router, prefix="/api/v1", tags=["detection"])
app.include_router(chat.router, prefix="/api/v1", tags=["chat"])
app.include_router(sync.router, prefix="/api/v1", tags=["sync"])

@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": settings.APP_VERSION}

@app.get("/health/db") 
async def health_check_db(): 
    try: 
        with engine.connect() as conn: conn.execute(text("SELECT 1")) 
        return {"status": "ok", "db": "connected"} 
    except Exception as e: 
        return {"status": "error", "db": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
