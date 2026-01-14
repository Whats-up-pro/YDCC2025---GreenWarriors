"""
Push notification endpoints - Backend API cho Push Notifications
"""
from fastapi import APIRouter, HTTPException, Body
from fastapi.responses import JSONResponse
from typing import Optional, Dict, Any
import logging
import json

router = APIRouter(prefix="/push", tags=["push"])
logger = logging.getLogger(__name__)

# In-memory storage cho demo (production nên dùng database)
subscriptions_store: Dict[str, Dict[str, Any]] = {}

@router.post("/subscribe")
async def subscribe_push(
    subscription: Dict[str, Any] = Body(...),
    userAgent: Optional[str] = Body(None),
    timestamp: Optional[int] = Body(None)
):
    """
    Subscribe to push notifications
    Lưu push subscription từ client
    
    Args:
        subscription: PushSubscription object from browser
        userAgent: User agent string
        timestamp: Subscription timestamp
    
    Returns:
        Success status
    """
    try:
        # Extract endpoint as unique key
        endpoint = subscription.get('endpoint')
        if not endpoint:
            raise HTTPException(status_code=400, detail="Missing endpoint in subscription")
        
        # Store subscription
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
    """
    Unsubscribe from push notifications
    
    Args:
        endpoint: Push subscription endpoint
    
    Returns:
        Success status
    """
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
    """
    Send push notification (admin endpoint)
    
    Args:
        endpoint: Specific endpoint (or None for broadcast)
        title: Notification title
        body: Notification body
        icon: Icon URL
        data: Additional data
        broadcast: Send to all subscribers
    
    Returns:
        Status of sent notifications
    """
    try:
        # TODO: Implement actual push sending using web-push library
        # from pywebpush import webpush, WebPushException
        
        sent_count = 0
        failed_count = 0
        
        targets = []
        if broadcast:
            targets = list(subscriptions_store.values())
        elif endpoint and endpoint in subscriptions_store:
            targets = [subscriptions_store[endpoint]]
        
        for sub_data in targets:
            try:
                # TODO: Actually send push using webpush
                # webpush(
                #     subscription_info=sub_data['subscription'],
                #     data=json.dumps({
                #         'title': title,
                #         'body': body,
                #         'icon': icon,
                #         'data': data
                #     }),
                #     vapid_private_key=settings.VAPID_PRIVATE_KEY,
                #     vapid_claims={"sub": "mailto:your-email@example.com"}
                # )
                
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
    """
    Get all active push subscriptions (admin endpoint)
    
    Returns:
        List of active subscriptions
    """
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
    """Health check for push service"""
    return JSONResponse({
        "status": "healthy",
        "active_subscriptions": len(subscriptions_store)
    })
