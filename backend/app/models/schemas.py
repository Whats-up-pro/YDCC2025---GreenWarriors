from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class DetectionRequest(BaseModel):
    image_base64: Optional[str] = None

class DetectionResponse(BaseModel):
    label: str = Field(..., description="Prediction label: Healthy or WSD")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score")
    processing_time: float = Field(..., description="Processing time in seconds")

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)
    user_id: Optional[int] = None

class ChatResponse(BaseModel):
    response: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
