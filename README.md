# YDCC2025 - GreenWarriors: Shrimp Disease Detection App

A Flutter application for detecting shrimp diseases using AI-powered computer vision with TensorFlow Lite.

## Features

- **AI Model Integration**: Load and run YOLOv8 TensorFlow Lite models
- **Image Preprocessing**: Automatic resize and normalization (640x640, 0.0-1.0 pixel values)
- **Real-time Inference**: Optimized for mobile devices with multi-threading support
- **Post-processing**: Extract bounding boxes, labels, and confidence scores
- **High Confidence Filtering**: Only shows detections with >80% confidence

## Project Structure

```
YDCC2025---GreenWarriors/
├── lib/
│   ├── main.dart                    # Main application entry point
│   ├── services/
│   │   └── ai_service.dart         # AI service class for TFLite operations
│   └── models/
│       ├── bounding_box.dart       # Bounding box data model
│       └── detection_result.dart   # Detection result data model
├── assets/
│   └── models/
│       ├── yolov8n_shrimp.tflite  # TFLite model (add your model here)
│       └── labels.txt              # Class labels (healthy, wssv_disease)
└── pubspec.yaml                    # Dependencies and configuration
```

## Setup Instructions

### 1. Prerequisites

- Flutter SDK (3.0.0 or higher)
- Your trained YOLOv8 model in `.tflite` format

### 2. Install Dependencies

```bash
flutter pub get
```

### 3. Add Your Model

Place your trained model file in the `assets/models/` directory:

```bash
cp /path/to/your/yolov8n_shrimp.tflite assets/models/
```

Ensure the model filename matches the path in `AIService.MODEL_PATH` (default: `yolov8n_shrimp.tflite`)

### 4. Configure Labels

Edit `assets/models/labels.txt` to match your model's classes:

```
healthy
wssv_disease
```

Each line represents one class that your model can detect.

## Usage

### Basic Initialization

```dart
import 'package:green_warriors/services/ai_service.dart';

// Create AI service instance
final aiService = AIService();

// Initialize the service (loads model and labels)
await aiService.initialize();
```

### Detect Objects in an Image

```dart
import 'dart:typed_data';

// Load your image as bytes
Uint8List imageBytes = await loadImageBytes();

// Get original image dimensions
int originalWidth = 4000;  // Your image width
int originalHeight = 3000; // Your image height

// Run detection
List<DetectionResult> detections = await aiService.detectObjects(
  imageBytes,
  originalWidth,
  originalHeight,
);

// Process results
for (var detection in detections) {
  print('Found: ${detection.label}');
  print('Confidence: ${(detection.confidence * 100).toStringAsFixed(2)}%');
  print('Bounding Box: ${detection.boundingBox}');
}
```

### Step-by-Step Processing

For more control, you can use individual processing steps:

```dart
// 1. Preprocess image
Float32List input = aiService.preprocessImage(imageBytes);

// 2. Run inference
List<List<dynamic>> output = aiService.runInference(input);

// 3. Post-process results
List<DetectionResult> detections = aiService.postProcess(
  output,
  originalWidth,
  originalHeight,
);
```

### Clean Up

```dart
// Dispose of resources when done
aiService.dispose();
```

## AI Service Configuration

The `AIService` class provides several configuration options:

```dart
class AIService {
  static const String MODEL_PATH = 'assets/models/yolov8n_shrimp.tflite';
  static const String LABELS_PATH = 'assets/models/labels.txt';
  static const int INPUT_SIZE = 640;  // Model input size
  static const double CONFIDENCE_THRESHOLD = 0.8;  // 80% confidence
  // ...
}
```

To modify these settings, edit the constants in `lib/services/ai_service.dart`.

## How It Works

### 1. Model Loading (`initialize()`)

- Loads the TFLite model from assets into memory
- Configures interpreter with 4 CPU threads for optimal performance
- Loads class labels from `labels.txt`
- Validates model input/output tensor shapes

### 2. Image Preprocessing (`preprocessImage()`)

The model expects 640x640 images with normalized pixel values:

1. **Decode**: Converts image bytes to image object
2. **Resize**: Scales to 640x640 using linear interpolation
3. **Normalize**: Converts RGB values from 0-255 to 0.0-1.0
4. **Format**: Creates Float32List in shape [1, 640, 640, 3]

### 3. Inference (`runInference()`)

- Reshapes input data to match model expectations
- Runs the TensorFlow Lite interpreter
- Returns raw output tensor data

### 4. Post-processing (`postProcess()`)

Converts raw model output into meaningful results:

1. **Parse Output**: Extracts bounding box coordinates, confidence, and class scores
2. **Filter**: Only keeps detections with confidence > 80%
3. **Scale Coordinates**: Converts from model coordinates (640x640) to original image size
4. **Create Results**: Builds `DetectionResult` objects with labels and bounding boxes

## Model Output Format

The YOLOv8 model output is expected in this format:

```
[batch, num_detections, data]

where data = [x_center, y_center, width, height, confidence, class_scores...]
```

- `x_center, y_center`: Center point of bounding box (normalized 0-1)
- `width, height`: Box dimensions (normalized 0-1)
- `confidence`: Object detection confidence (0-1)
- `class_scores`: Probability for each class (0-1)

## Performance Optimization

- **Multi-threading**: Uses 4 CPU threads for inference
- **Efficient Preprocessing**: Linear interpolation for fast resizing
- **Confidence Filtering**: Reduces false positives by requiring >80% confidence
- **Resource Management**: Proper disposal of interpreter resources

## Troubleshooting

### Model Not Found

Ensure your model file is in `assets/models/` and referenced in `pubspec.yaml`:

```yaml
flutter:
  assets:
    - assets/models/
    - assets/models/labels.txt
```

### Out of Memory

If you encounter memory issues:
- Reduce the number of CPU threads
- Process images in batches
- Ensure proper disposal of resources

### Incorrect Detections

Check these common issues:
- Labels file matches model output classes
- Confidence threshold is appropriate
- Image preprocessing matches model training

## Contributing

This project is part of YDCC2025. For contributions and support, please contact the Green Warriors team.

## License

[Add your license information here]