import io
import os
import time
import logging
from typing import Tuple, Optional, List

import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.transforms as transforms
from PIL import Image

from app.core.config import settings
from app.models.resnet_cbam import ResNetCBAM  # <-- bạn phải tạo file này

logger = logging.getLogger(__name__)


class AIService:
    def __init__(self):
        self.model: Optional[nn.Module] = None

        # device từ settings (vd: "cuda" / "cpu")
        self.device = torch.device(settings.MODEL_DEVICE)

        # preprocess chuẩn ResNet
        self.transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),  # [0..1]
            transforms.Normalize(mean=[0.485, 0.456, 0.406],
                                 std=[0.229, 0.224, 0.225]),
        ])

        # tên lớp theo đúng mapping lúc train
        # khuyến nghị set trong .env / settings: CLASS_NAMES="healthy,wssv"
        self.class_names: List[str] = getattr(settings, "CLASS_NAMES", ["Healthy", "WSSV"])
        # normalize nhẹ để trả label đẹp
        # (bạn có thể để đúng như bạn muốn)
        self.class_names = [str(x) for x in self.class_names]

        self._load_model()

    def _load_model(self):
        try:
            if not settings.MODEL_PATH or not os.path.exists(settings.MODEL_PATH):
                logger.warning("Model file not found. Using mock predictions.")
                return

            if not settings.MODEL_PATH.endswith(".pth"):
                logger.warning(f"Unsupported model format: {settings.MODEL_PATH}. Expected .pth")
                return

            checkpoint = torch.load(settings.MODEL_PATH, map_location=self.device)

            # ---- lấy state_dict ----
            if isinstance(checkpoint, dict) and "state_dict" in checkpoint:
                state_dict = checkpoint["state_dict"]
            elif isinstance(checkpoint, dict):
                # đôi khi checkpoint chính là state_dict
                state_dict = checkpoint
            else:
                logger.error("Unknown checkpoint format (expected dict).")
                return

            # ---- strip 'module.' nếu train bằng DataParallel ----
            cleaned = {}
            for k, v in state_dict.items():
                cleaned[k.replace("module.", "")] = v
            state_dict = cleaned

            # ---- dựng model đúng số lớp ----
            # ƯU TIÊN: num_classes lấy từ settings.CLASS_NAMES
            num_classes = len(self.class_names)

            # Nếu checkpoint có num_classes thì dùng (nếu bạn có lưu)
            if isinstance(checkpoint, dict) and "num_classes" in checkpoint:
                try:
                    num_classes = int(checkpoint["num_classes"])
                except Exception:
                    pass

            model = ResNetCBAM(num_classes=num_classes, pretrained=False)
            model.load_state_dict(state_dict, strict=True)  # strict=True để chắc khớp kiến trúc
            model.to(self.device)
            model.eval()

            self.model = model
            logger.info(f"ResNetCBAM loaded from {settings.MODEL_PATH} on {self.device}")

        except Exception as e:
            logger.error(f"Failed to load model: {e}. Using mock predictions.", exc_info=True)
            self.model = None

    def preprocess_image(self, image_bytes: bytes) -> torch.Tensor:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        tensor = self.transform(image).unsqueeze(0)  # [1,3,224,224]
        return tensor.to(self.device)

    def predict(self, image_bytes: bytes) -> Tuple[str, float, float]:
        start_time = time.time()

        if self.model is None:
            label, confidence = self._mock_predict()
            return label, confidence, time.time() - start_time

        try:
            x = self.preprocess_image(image_bytes)

            with torch.inference_mode():
                logits = self.model(x)              # [1, C]
                probs = F.softmax(logits, dim=1)    # [1, C]
                conf, pred = torch.max(probs, dim=1)

            conf = float(conf.item())
            pred = int(pred.item())

            # map label theo class_names
            # ví dụ class_names=["Healthy","WSSV"] (index 0/1)
            label = self.class_names[pred]

        except Exception as e:
            logger.error(f"Prediction error: {e}", exc_info=True)
            label, confidence = self._mock_predict()

        processing_time = time.time() - start_time
        return label, conf if self.model is not None else confidence, processing_time

    def _mock_predict(self) -> Tuple[str, float]:
        # fallback
        return "Healthy", 0.85
