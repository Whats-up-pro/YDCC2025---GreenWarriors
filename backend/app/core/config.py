from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)
    
    APP_NAME: str = "Shrimp Disease Detection API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    
    DATABASE_URL: str
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    
    MODEL_PATH: str = "ml_models/wsd_model_v1.pth"
    MODEL_DEVICE: str = "cpu"
    MODEL_CONFIDENCE_THRESHOLD: float = 0.7
    
    N8N_WEBHOOK_URL: Optional[str] = None
    N8N_TIMEOUT: int = 5
    N8N_MAX_RETRIES: int = 3
    N8N_RETRY_DELAY: float = 1.0
    
    API_KEY: Optional[str] = None
    CORS_ORIGINS: list[str] = ["*"]
    
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024
    ALLOWED_EXTENSIONS: list[str] = [".jpg", ".jpeg", ".png"]

settings = Settings()
