# Quick Start Guide - AI Model Integration

## 1. Add Your Model

Place your trained YOLOv8 TFLite model in the assets folder:

```bash
assets/models/yolov8n_shrimp.tflite
```

## 2. Basic Usage

```dart
import 'package:green_warriors/services/ai_service.dart';

// Initialize the AI service
final aiService = AIService();
await aiService.initialize();

// Detect objects in an image
final detections = await aiService.detectObjects(
  imageBytes,      // Uint8List - image data
  originalWidth,   // int - image width
  originalHeight,  // int - image height
);

// Process results
for (var detection in detections) {
  print('Disease: ${detection.label}');
  print('Confidence: ${(detection.confidence * 100).toStringAsFixed(1)}%');
  print('Location: (${detection.boundingBox.x}, ${detection.boundingBox.y})');
}

// Clean up when done
aiService.dispose();
```

## 3. Complete Example with Camera

```dart
import 'package:camera/camera.dart';
import 'dart:io';

// Initialize camera
final cameras = await availableCameras();
final controller = CameraController(cameras.first, ResolutionPreset.high);
await controller.initialize();

// Capture image
final XFile image = await controller.takePicture();
final imageBytes = await File(image.path).readAsBytes();

// Detect diseases
final detections = await aiService.detectObjects(
  imageBytes,
  controller.value.previewSize!.width.toInt(),
  controller.value.previewSize!.height.toInt(),
);

// Display results
if (detections.isNotEmpty) {
  for (var detection in detections) {
    if (detection.label == 'wssv_disease') {
      print('⚠️ WSSV Disease Detected!');
      print('Confidence: ${(detection.confidence * 100).toStringAsFixed(1)}%');
    } else if (detection.label == 'healthy') {
      print('✅ Healthy Shrimp');
    }
  }
} else {
  print('No shrimp detected');
}
```

## 4. Key Features

### Automatic Image Preprocessing
- ✅ Resizes any image to 640x640
- ✅ Normalizes pixel values (0-255 → 0.0-1.0)
- ✅ Handles various image formats (JPEG, PNG, etc.)

### Optimized Performance
- ✅ Multi-threaded execution (4 CPU threads)
- ✅ Efficient memory usage
- ✅ Fast inference (~200-550ms per image)

### Smart Detection
- ✅ Only returns detections with >80% confidence
- ✅ Scales bounding boxes to original image size
- ✅ Supports multiple detections per image

## 5. Configuration

Modify settings in `lib/services/ai_service.dart`:

```dart
class AIService {
  // Change model file name
  static const String MODEL_PATH = 'assets/models/yolov8n_shrimp.tflite';
  
  // Change labels file
  static const String LABELS_PATH = 'assets/models/labels.txt';
  
  // Adjust input size (must match your model)
  static const int INPUT_SIZE = 640;
  
  // Change confidence threshold (0.0-1.0)
  static const double CONFIDENCE_THRESHOLD = 0.8;
}
```

## 6. Troubleshooting

### Model Not Loading?
1. Check file exists: `assets/models/yolov8n_shrimp.tflite`
2. Verify pubspec.yaml includes asset
3. Run `flutter pub get`
4. Clean build: `flutter clean && flutter pub get`

### No Detections Found?
1. Lower confidence threshold (e.g., 0.5)
2. Check if image contains shrimp
3. Verify labels.txt matches model output
4. Check image quality (not too blurry)

### Slow Performance?
1. Reduce CPU threads to 2
2. Use smaller input size (e.g., 320)
3. Ensure debug mode is off (run in release mode)

## 7. File Structure

```
your_project/
├── assets/
│   └── models/
│       ├── yolov8n_shrimp.tflite  ← Your model here
│       └── labels.txt              ← Class names
├── lib/
│   ├── services/
│   │   └── ai_service.dart         ← Main AI service
│   ├── models/
│   │   ├── bounding_box.dart       ← Data models
│   │   └── detection_result.dart
│   └── main.dart                   ← Your app
└── pubspec.yaml                    ← Dependencies
```

## 8. Next Steps

1. **Add Your Model**: Copy your `.tflite` model to `assets/models/`
2. **Update Labels**: Edit `assets/models/labels.txt` with your classes
3. **Test**: Run the app and verify model loads successfully
4. **Integrate**: Use the AI service in your camera/gallery features
5. **Optimize**: Adjust settings based on your device performance

For detailed documentation, see:
- `docs/AI_INTEGRATION.md` - Complete technical guide
- `lib/examples/ai_service_examples.dart` - Advanced examples
- `README.md` - Project overview
