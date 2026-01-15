from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.core.config import settings
from app.api.v1 import detect, chat, sync, push
from app.models.database import engine, SessionLocal
from sqlalchemy import text
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    debug=settings.DEBUG
)

# Add rate limit exception handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,  # Specific origins only
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],  # Add OPTIONS for CORS preflight
    allow_headers=["*"],
)

# Include routers
app.include_router(detect.router, prefix="/api/v1", tags=["detection"])
app.include_router(chat.router, prefix="/api/v1", tags=["chat"])
app.include_router(sync.router, prefix="/api/v1", tags=["sync"])
app.include_router(push.router, prefix="/api/v1", tags=["push"])

@app.get("/")
@limiter.limit("30/minute")
async def root(request: Request):
    """Root endpoint"""
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "endpoints": {
            "health": "/health",
            "health_db": "/health/db",
            "docs": "/docs",
            "api": "/api/v1"
        }
    }

@app.get("/health")
@limiter.limit("60/minute")
async def health_check(request: Request):
    """Basic health check"""
    return {
        "status": "healthy",
        "version": settings.APP_VERSION,
        "app": settings.APP_NAME
    }

@app.get("/health/db")
@limiter.limit("30/minute")
async def health_check_db(request: Request):
    """Database health check - test connection to PostgreSQL"""
    db = SessionLocal()
    try:
        # Test connection
        result = db.execute(text("SELECT version(), current_database(), current_user"))
        row = result.fetchone()
        
        # Count tables
        tables_result = db.execute(text("""
            SELECT COUNT(*) 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        """))
        table_count = tables_result.fetchone()[0]
        
        return JSONResponse({
            "status": "healthy",
            "database": "connected",
            "db_name": row[1],
            "db_user": row[2],
            "db_version": row[0].split(',')[0],  # PostgreSQL version only
            "tables": table_count,
            "connection_url": settings.DATABASE_URL.replace(settings.DATABASE_URL.split('@')[0].split('://')[1], '***')  # Hide credentials
        })
    except Exception as e:
        logger.error(f"Database health check failed: {str(e)}")
        return JSONResponse(
            {
                "status": "unhealthy",
                "database": "disconnected",
                "error": str(e),
                "connection_url": settings.DATABASE_URL.replace(settings.DATABASE_URL.split('@')[0].split('://')[1], '***')
            },
            status_code=503
        )
    finally:
        db.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
