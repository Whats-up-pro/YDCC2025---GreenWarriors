import httpx
import logging
import asyncio
from typing import Optional, Dict, Any
from app.core.config import settings

logger = logging.getLogger(__name__)

class N8NClient:
    def __init__(self):
        self.webhook_url = settings.N8N_WEBHOOK_URL
        self.timeout = settings.N8N_TIMEOUT
        self.max_retries = settings.N8N_MAX_RETRIES
        self.retry_delay = settings.N8N_RETRY_DELAY
    
    async def trigger_workflow(self, workflow_name: str, data: Dict[str, Any]) -> bool:
        if not self.webhook_url:
            logger.warning("N8N webhook URL not configured")
            return False
        
        url = f"{self.webhook_url}/{workflow_name}"
        
        for attempt in range(1, self.max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(url, json=data)
                    response.raise_for_status()
                    logger.info(f"Workflow {workflow_name} triggered successfully (attempt {attempt})")
                    return True
            except httpx.TimeoutException:
                logger.warning(f"Workflow {workflow_name} timeout (attempt {attempt}/{self.max_retries})")
                if attempt < self.max_retries:
                    await asyncio.sleep(self.retry_delay * attempt)
                else:
                    logger.error(f"Workflow {workflow_name} failed after {self.max_retries} attempts (timeout)")
                    return False
            except httpx.HTTPStatusError as e:
                if e.response.status_code >= 500:
                    logger.warning(f"Workflow {workflow_name} server error {e.response.status_code} (attempt {attempt}/{self.max_retries})")
                    if attempt < self.max_retries:
                        await asyncio.sleep(self.retry_delay * attempt)
                    else:
                        logger.error(f"Workflow {workflow_name} failed after {self.max_retries} attempts (server error)")
                        return False
                else:
                    logger.error(f"Workflow {workflow_name} client error {e.response.status_code}: {e}")
                    return False
            except Exception as e:
                logger.error(f"Failed to trigger workflow {workflow_name} (attempt {attempt}): {e}", exc_info=True)
                if attempt < self.max_retries:
                    await asyncio.sleep(self.retry_delay * attempt)
                else:
                    logger.error(f"Workflow {workflow_name} failed after {self.max_retries} attempts")
                    return False
        
        return False
    
    async def log_detection(self, detection_data: Dict[str, Any]) -> bool:
        return await self.trigger_workflow("detect_notification", detection_data)
    
    async def send_notification(self, user_id: int, message: str) -> bool:
        return await self.trigger_workflow("detect_notification", {
            "user_id": user_id,
            "message": message
        })
