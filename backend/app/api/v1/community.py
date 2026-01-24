from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Request, Form
from app.models.schemas import PostCreate, PostResponse, PostListResponse, CommentCreate, CommentResponse, UserProfileResponse
from app.models.database import SessionLocal, CommunityPost, PostComment, PostLike, User
from app.core.config import settings
from app.core.security import verify_api_key
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import desc, func
from slowapi import Limiter
from slowapi.util import get_remote_address
from datetime import datetime
import logging
import os
import shutil
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

# Create uploads directory if it doesn't exist
UPLOAD_DIR = Path("static/uploads/posts")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

def get_user_id(request: Request) -> int:
    """Get user ID from request (using API key for now, can be extended with auth)"""
    # For demo: use a default user ID or extract from API key
    # In production, this would come from JWT token or session
    return 1  # Default user for demo

def get_image_url(image_path: str) -> str:
    """Convert image path to URL"""
    if not image_path:
        return ""
    # Return relative URL that will be served by static file handler
    return f"/static/uploads/posts/{os.path.basename(image_path)}"

@router.post("/community/posts", response_model=PostResponse)
@limiter.limit("10/minute")
async def create_post(
    request: Request,
    image: UploadFile = File(...),
    caption: Optional[str] = Form(None),
    api_key: str = Depends(verify_api_key)
):
    """Create a new community post with image and optional caption."""
    db = SessionLocal()
    user_id = get_user_id(request)
    
    try:
        # Validate image
        if not image.content_type or not image.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="Invalid file type. Must be image.")
        
        # Save image
        file_ext = os.path.splitext(image.filename)[1] if image.filename else '.jpg'
        filename = f"{user_id}_{int(datetime.utcnow().timestamp())}{file_ext}"
        file_path = UPLOAD_DIR / filename
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        
        # Create post
        post = CommunityPost(
            user_id=user_id,
            image_path=str(file_path),
            caption=caption,
            likes_count=0,
            comments_count=0
        )
        db.add(post)
        db.commit()
        db.refresh(post)
        
        # Get user or create if not exists
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            user = User(id=user_id, phone="demo", name="Người dùng", created_at=datetime.utcnow())
            db.add(user)
            db.commit()
        
        return PostResponse(
            id=post.id,
            user=UserProfileResponse(
                id=user.id,
                name=user.name or "Người dùng",
                avatar_url=get_image_url(user.avatar_path) if user.avatar_path else None,
                bio=user.bio,
                created_at=user.created_at or datetime.utcnow()
            ),
            image_url=get_image_url(post.image_path),
            caption=post.caption,
            likes_count=post.likes_count,
            comments_count=post.comments_count,
            is_liked=False,
            created_at=post.created_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create post: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create post")
    finally:
        db.close()

@router.get("/community/posts", response_model=PostListResponse)
@limiter.limit("30/minute")
async def list_posts(
    request: Request,
    page: int = 1,
    limit: int = 20,
    api_key: str = Depends(verify_api_key)
):
    """List community posts with pagination."""
    import json
    # #region agent log
    with open('d:\\YDCC\\code\\.cursor\\debug.log', 'a', encoding='utf-8') as f:
        f.write(json.dumps({"location":"community.py:106","message":"list_posts entry","data":{"page":page,"limit":limit,"origin":request.headers.get("origin")},"timestamp":int(__import__('time').time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"C,E"})+"\n")
    # #endregion
    db = SessionLocal()
    user_id = get_user_id(request)
    
    try:
        # Calculate offset
        offset = (page - 1) * limit
        
        # Get posts
        posts_query = db.query(CommunityPost).order_by(desc(CommunityPost.created_at))
        total = posts_query.count()
        posts = posts_query.offset(offset).limit(limit).all()
        
        # Get user IDs
        user_ids = {post.user_id for post in posts}
        users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()}
        
        # Get liked posts for current user
        liked_post_ids = {
            like.post_id for like in 
            db.query(PostLike).filter(
                PostLike.post_id.in_([p.id for p in posts]),
                PostLike.user_id == user_id
            ).all()
        }
        
        # Build response
        post_responses = []
        for post in posts:
            user = users.get(post.user_id)
            if not user:
                # Create user in database if not exists
                user = User(id=post.user_id, phone="demo", name="Người dùng", created_at=datetime.utcnow())
                db.add(user)
                db.commit()
                db.refresh(user)
            
            post_responses.append(PostResponse(
                id=post.id,
                user=UserProfileResponse(
                    id=user.id,
                    name=user.name or "Người dùng",
                    avatar_url=get_image_url(user.avatar_path) if user.avatar_path else None,
                    bio=user.bio,
                    created_at=user.created_at or datetime.utcnow()
                ),
                image_url=get_image_url(post.image_path),
                caption=post.caption,
                likes_count=post.likes_count,
                comments_count=post.comments_count,
                is_liked=post.id in liked_post_ids,
                created_at=post.created_at
            ))
        
        result = PostListResponse(
            posts=post_responses,
            total=total,
            page=page,
            limit=limit,
            has_more=(offset + limit) < total
        )
        # #region agent log
        import json
        with open('d:\\YDCC\\code\\.cursor\\debug.log', 'a', encoding='utf-8') as f:
            f.write(json.dumps({"location":"community.py:164","message":"list_posts success","data":{"postsCount":len(post_responses),"total":total},"timestamp":int(__import__('time').time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"C"})+"\n")
        # #endregion
        return result
        
    except Exception as e:
        # #region agent log
        import json
        with open('d:\\YDCC\\code\\.cursor\\debug.log', 'a', encoding='utf-8') as f:
            f.write(json.dumps({"location":"community.py:172","message":"list_posts error","data":{"error":str(e)},"timestamp":int(__import__('time').time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"C"})+"\n")
        # #endregion
        logger.error(f"Failed to list posts: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to list posts")
    finally:
        db.close()

@router.get("/community/posts/{post_id}", response_model=PostResponse)
@limiter.limit("30/minute")
async def get_post(
    request: Request,
    post_id: int,
    api_key: str = Depends(verify_api_key)
):
    """Get a single post by ID."""
    db = SessionLocal()
    user_id = get_user_id(request)
    
    try:
        post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
        if not post:
            raise HTTPException(status_code=404, detail="Post not found")
        
        user = db.query(User).filter(User.id == post.user_id).first()
        if not user:
            user = User(id=post.user_id, phone="demo", name="Người dùng", created_at=datetime.utcnow())
            db.add(user)
            db.commit()
            db.refresh(user)
        
        # Check if liked
        is_liked = db.query(PostLike).filter(
            PostLike.post_id == post_id,
            PostLike.user_id == user_id
        ).first() is not None
        
        return PostResponse(
            id=post.id,
            user=UserProfileResponse(
                id=user.id,
                name=user.name or "Người dùng",
                avatar_url=get_image_url(user.avatar_path) if user.avatar_path else None,
                bio=user.bio,
                created_at=user.created_at or datetime.utcnow()
            ),
            image_url=get_image_url(post.image_path),
            caption=post.caption,
            likes_count=post.likes_count,
            comments_count=post.comments_count,
            is_liked=is_liked,
            created_at=post.created_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get post: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get post")
    finally:
        db.close()

@router.post("/community/posts/{post_id}/like")
@limiter.limit("30/minute")
async def toggle_like(
    request: Request,
    post_id: int,
    api_key: str = Depends(verify_api_key)
):
    """Toggle like on a post."""
    db = SessionLocal()
    user_id = get_user_id(request)
    
    try:
        post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
        if not post:
            raise HTTPException(status_code=404, detail="Post not found")
        
        # Check if already liked
        existing_like = db.query(PostLike).filter(
            PostLike.post_id == post_id,
            PostLike.user_id == user_id
        ).first()
        
        if existing_like:
            # Unlike
            db.delete(existing_like)
            post.likes_count = max(0, post.likes_count - 1)
            is_liked = False
        else:
            # Like
            like = PostLike(post_id=post_id, user_id=user_id)
            db.add(like)
            post.likes_count += 1
            is_liked = True
        
        db.commit()
        
        return {
            "post_id": post_id,
            "is_liked": is_liked,
            "likes_count": post.likes_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to toggle like: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to toggle like")
    finally:
        db.close()

@router.post("/community/posts/{post_id}/comments", response_model=CommentResponse)
@limiter.limit("20/minute")
async def add_comment(
    request: Request,
    post_id: int,
    comment: CommentCreate,
    api_key: str = Depends(verify_api_key)
):
    """Add a comment to a post."""
    db = SessionLocal()
    user_id = get_user_id(request)
    
    try:
        post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
        if not post:
            raise HTTPException(status_code=404, detail="Post not found")
        
        # Create comment
        new_comment = PostComment(
            post_id=post_id,
            user_id=user_id,
            content=comment.content
        )
        db.add(new_comment)
        
        # Update comment count
        post.comments_count += 1
        
        db.commit()
        db.refresh(new_comment)
        
        # Get user
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            user = User(id=user_id, phone="demo", name="Người dùng", created_at=datetime.utcnow())
            db.add(user)
            db.commit()
            db.refresh(user)
        
        return CommentResponse(
            id=new_comment.id,
            user=UserProfileResponse(
                id=user.id,
                name=user.name or "Người dùng",
                avatar_url=get_image_url(user.avatar_path) if user.avatar_path else None,
                bio=user.bio,
                created_at=user.created_at or datetime.utcnow()
            ),
            content=new_comment.content,
            created_at=new_comment.created_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to add comment: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to add comment")
    finally:
        db.close()

@router.get("/community/posts/{post_id}/comments", response_model=list[CommentResponse])
@limiter.limit("30/minute")
async def get_comments(
    request: Request,
    post_id: int,
    api_key: str = Depends(verify_api_key)
):
    """Get all comments for a post."""
    db = SessionLocal()
    
    try:
        post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
        if not post:
            raise HTTPException(status_code=404, detail="Post not found")
        
        comments = db.query(PostComment).filter(
            PostComment.post_id == post_id
        ).order_by(PostComment.created_at).all()
        
        # Get user IDs
        user_ids = {comment.user_id for comment in comments}
        users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()}
        
        comment_responses = []
        for comment in comments:
            user = users.get(comment.user_id)
            if not user:
                # Create user in database if not exists
                user = User(id=comment.user_id, phone="demo", name="Người dùng", created_at=datetime.utcnow())
                db.add(user)
                db.commit()
                db.refresh(user)
                users[comment.user_id] = user  # Cache for next iteration
            
            comment_responses.append(CommentResponse(
                id=comment.id,
                user=UserProfileResponse(
                    id=user.id,
                    name=user.name or "Người dùng",
                    avatar_url=get_image_url(user.avatar_path) if user.avatar_path else None,
                    bio=user.bio,
                    created_at=user.created_at or datetime.utcnow()
                ),
                content=comment.content,
                created_at=comment.created_at
            ))
        
        return comment_responses
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get comments: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get comments")
    finally:
        db.close()

@router.get("/community/users/{user_id}", response_model=UserProfileResponse)
@limiter.limit("30/minute")
async def get_user_profile(
    request: Request,
    user_id: int,
    api_key: str = Depends(verify_api_key)
):
    """Get user profile."""
    db = SessionLocal()
    
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return UserProfileResponse(
            id=user.id,
            name=user.name or "Người dùng",
            avatar_url=get_image_url(user.avatar_path) if user.avatar_path else None,
            bio=user.bio,
            created_at=user.created_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get user profile: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get user profile")
    finally:
        db.close()
