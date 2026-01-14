"""
API Security Module
Provides authentication and authorization functionality for API endpoints.
"""

from fastapi import HTTPException, Security, status, Request
from fastapi.security import APIKeyHeader
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

# API Key Header for authentication
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(api_key: str = Security(api_key_header)) -> str:
    """
    Verify API key from request header.
    
    Args:
        api_key: API key from X-API-Key header
        
    Returns:
        str: The verified API key
        
    Raises:
        HTTPException: If API key is missing or invalid
    """
    # If no API key configured in settings, skip verification (dev mode)
    if not settings.API_KEY:
        logger.warning("API_KEY not configured - authentication disabled!")
        return "dev-mode"
    
    # Check if API key provided in request
    if not api_key:
        logger.warning("API request without API key")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key. Please provide X-API-Key header.",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    
    # Verify API key matches configured value
    if api_key != settings.API_KEY:
        logger.warning(f"Invalid API key attempt: {api_key[:8]}...")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid API key",
        )
    
    logger.debug("API key verified successfully")
    return api_key


def get_client_ip(request: Request) -> str:
    """
    Extract client IP address from request.
    Handles X-Forwarded-For header for proxied requests.
    
    Args:
        request: FastAPI Request object
        
    Returns:
        str: Client IP address
    """
    # Check X-Forwarded-For header (for requests through proxy/load balancer)
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # X-Forwarded-For can contain multiple IPs, take the first one
        return forwarded.split(",")[0].strip()
    
    # Fallback to direct client IP
    return request.client.host if request.client else "unknown"

