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

# Community Schemas
class UserProfileResponse(BaseModel):
    id: int
    name: str
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    created_at: datetime

class PostCreate(BaseModel):
    caption: Optional[str] = Field(None, max_length=2000)

class PostResponse(BaseModel):
    id: int
    user: UserProfileResponse
    image_url: str
    caption: Optional[str] = None
    likes_count: int
    comments_count: int
    is_liked: bool
    created_at: datetime

class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=1000)

class CommentResponse(BaseModel):
    id: int
    user: UserProfileResponse
    content: str
    created_at: datetime

class PostListResponse(BaseModel):
    posts: list[PostResponse]
    total: int
    page: int
    limit: int
    has_more: bool
