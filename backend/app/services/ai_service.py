import torch
import torch.nn as nn
import torchvision.transforms as transforms
from PIL import Image
import io
import time
import os
from typing import Tuple, Optional
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

class SimpleClassifier(nn.Module):
    def __init__(self, num_classes=2):
        super().__init__()
        self.classifier = nn.Sequential(
            nn.Linear(3 * 224 * 224, 512),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(512, num_classes)
        )
    
    def forward(self, x):
        x = x.view(x.size(0), -1)
        return self.classifier(x)

class AIService:
    def __init__(self):
        self.model: Optional[nn.Module] = None
        self.device = torch.device(settings.MODEL_DEVICE)
        self.transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])
        self._load_model()
    
    def _load_model(self):
        try:
            if not settings.MODEL_PATH or not os.path.exists(settings.MODEL_PATH):
                logger.warning("Model file not found. Using mock predictions.")
                return
            
            if settings.MODEL_PATH.endswith('.pth'):
                checkpoint = torch.load(settings.MODEL_PATH, map_location=self.device)
                
                if isinstance(checkpoint, dict) and 'state_dict' in checkpoint:
                    state_dict = checkpoint['state_dict']
                    num_classes = checkpoint.get('num_classes', 2)
                elif isinstance(checkpoint, dict):
                    state_dict = checkpoint
                    num_classes = 2
                else:
                    logger.error("Unknown model format. Expected dict with 'state_dict' key or state_dict directly.")
                    return
                
                model = SimpleClassifier(num_classes=num_classes)
                model.load_state_dict(state_dict, strict=False)
                model.to(self.device)
                model.eval()
                self.model = model
                logger.info(f"Model loaded from {settings.MODEL_PATH}")
            else:
                logger.warning(f"Unsupported model format: {settings.MODEL_PATH}")
        except Exception as e:
            logger.error(f"Failed to load model: {e}. Using mock predictions.", exc_info=True)
    
    def preprocess_image(self, image_bytes: bytes) -> torch.Tensor:
        image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        tensor = self.transform(image).unsqueeze(0)
        return tensor.to(self.device)
    
    def predict(self, image_bytes: bytes) -> Tuple[str, float, float]:
        start_time = time.time()
        
        if self.model is None:
            label, confidence = self._mock_predict()
        else:
            try:
                tensor = self.preprocess_image(image_bytes)
                with torch.inference_mode():
                    output = self.model(tensor)
                    probabilities = torch.nn.functional.softmax(output, dim=1)
                    confidence, predicted = torch.max(probabilities, 1)
                    confidence = confidence.item()
                    predicted = predicted.item()
                    
                    label = "WSD" if predicted == 1 else "Healthy"
            except Exception as e:
                logger.error(f"Prediction error: {e}", exc_info=True)
                label, confidence = self._mock_predict()
        
        processing_time = time.time() - start_time
        return label, confidence, processing_time
    
    def _mock_predict(self) -> Tuple[str, float]:
        return "Healthy", 0.85
