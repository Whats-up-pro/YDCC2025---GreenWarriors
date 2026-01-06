# Model Placeholder

Please place your trained YOLOv8 TensorFlow Lite model here:

📁 `yolov8n_shrimp.tflite`

## Requirements

- Format: TensorFlow Lite (.tflite)
- Input Size: 640x640 pixels
- Input Type: Float32, RGB channels
- Output: YOLOv8 detection format

## How to Convert Your Model

If you have a PyTorch YOLOv8 model:

```python
from ultralytics import YOLO

# Load your trained model
model = YOLO('path/to/your/weights.pt')

# Export to TFLite
model.export(format='tflite', imgsz=640)
```

This will generate a `.tflite` file that you can use with this app.

## Verify Your Model

After placing the model here:
1. Ensure the filename matches: `yolov8n_shrimp.tflite`
2. Or update `MODEL_PATH` in `lib/services/ai_service.dart`
3. Run the app and check the console for model loading messages

## Need Help?

- See `docs/AI_INTEGRATION.md` for detailed integration guide
- See `QUICKSTART.md` for quick setup instructions
- Check that `labels.txt` contains the correct class names
