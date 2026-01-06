# AI Model Integration Guide

## Overview

This guide explains the AI model integration implementation for the Green Warriors shrimp disease detection application. The implementation uses TensorFlow Lite to run YOLOv8 object detection models directly on mobile devices.

## Architecture

### Components

1. **AIService** (`lib/services/ai_service.dart`)
   - Core service handling all AI operations
   - Singleton pattern for efficient resource management
   - Thread-safe model execution

2. **Data Models**
   - `BoundingBox` - Represents detection coordinates
   - `DetectionResult` - Complete detection information (box, label, confidence)

3. **Assets**
   - Model file: `assets/models/yolov8n_shrimp.tflite`
   - Labels file: `assets/models/labels.txt`

## Implementation Details

### 1. Model Loading

```dart
Future<void> initialize() async {
  // Load labels from text file
  _labels = await _loadLabels();
  
  // Create interpreter with optimized settings
  final options = InterpreterOptions()
    ..threads = 4;  // Multi-threading for performance
  
  _interpreter = await Interpreter.fromAsset(
    MODEL_PATH,
    options: options,
  );
}
```

**Key Features:**
- Asynchronous loading to prevent UI blocking
- Multi-threaded execution (4 CPU threads)
- Error handling with detailed logging
- Tensor shape validation

### 2. Image Preprocessing

The preprocessing pipeline transforms high-resolution images into the format required by the model:

```
Original Image (e.g., 4000x3000) 
    ↓
Decode Image
    ↓
Resize to 640x640 (Linear Interpolation)
    ↓
Normalize Pixels (0-255 → 0.0-1.0)
    ↓
Format as Float32List [1, 640, 640, 3]
```

**Implementation:**

```dart
Float32List preprocessImage(Uint8List imageBytes) {
  // 1. Decode
  img.Image? image = img.decodeImage(imageBytes);
  
  // 2. Resize
  img.Image resizedImage = img.copyResize(
    image,
    width: 640,
    height: 640,
    interpolation: img.Interpolation.linear,
  );
  
  // 3. Normalize and format
  final input = Float32List(640 * 640 * 3);
  int pixelIndex = 0;
  for (int y = 0; y < 640; y++) {
    for (int x = 0; x < 640; x++) {
      final pixel = resizedImage.getPixel(x, y);
      input[pixelIndex++] = pixel.r / 255.0;
      input[pixelIndex++] = pixel.g / 255.0;
      input[pixelIndex++] = pixel.b / 255.0;
    }
  }
  
  return input;
}
```

**Performance Considerations:**
- Linear interpolation balances speed and quality
- Single-pass normalization
- Efficient memory usage with Float32List

### 3. Inference Execution

```dart
List<List<dynamic>> runInference(Float32List input) {
  // Reshape to [1, 640, 640, 3]
  final inputTensor = input.reshape([1, 640, 640, 3]);
  
  // Create output buffer based on model output shape
  final outputShape = _interpreter.getOutputTensor(0).shape;
  final output = List.filled(
    outputShape[0],
    List.filled(
      outputShape[1],
      List<double>.filled(outputShape[2], 0.0),
    ),
  );
  
  // Run inference
  _interpreter.run(inputTensor, output);
  
  return output;
}
```

**Model Input/Output:**
- Input: `[1, 640, 640, 3]` - Batch of 1 image, 640x640 pixels, RGB channels
- Output: `[1, N, 7+]` - Batch, N detections, detection data
  - Detection data: `[x_center, y_center, width, height, confidence, class_scores...]`

### 4. Post-Processing

The post-processing step converts raw model outputs into meaningful detection results:

```dart
List<DetectionResult> postProcess(
  List<List<dynamic>> output,
  int originalWidth,
  int originalHeight,
) {
  final detections = <DetectionResult>[];
  
  for (var detection in output[0]) {
    // Extract coordinates (normalized 0-1)
    final xCenter = detection[0];
    final yCenter = detection[1];
    final width = detection[2];
    final height = detection[3];
    final confidence = detection[4];
    
    // Filter by confidence threshold
    if (confidence < 0.8) continue;
    
    // Find class with highest score
    int classIndex = 0;
    double maxScore = 0.0;
    for (int i = 5; i < detection.length; i++) {
      if (detection[i] > maxScore) {
        maxScore = detection[i];
        classIndex = i - 5;
      }
    }
    
    // Scale coordinates to original image size
    final scaleX = originalWidth / 640;
    final scaleY = originalHeight / 640;
    
    final x = (xCenter - width/2) * 640 * scaleX;
    final y = (yCenter - height/2) * 640 * scaleY;
    final boxWidth = width * 640 * scaleX;
    final boxHeight = height * 640 * scaleY;
    
    // Create detection result
    detections.add(DetectionResult(
      boundingBox: BoundingBox(x: x, y: y, width: boxWidth, height: boxHeight),
      label: _labels[classIndex],
      confidence: confidence,
    ));
  }
  
  return detections;
}
```

**Key Features:**
- Confidence filtering (>80% threshold)
- Class score comparison for multi-class detection
- Coordinate scaling from model space to image space
- Boundary clamping to prevent out-of-bounds boxes

## Configuration

### Model Requirements

The YOLOv8 model should be:
- Format: TensorFlow Lite (.tflite)
- Input: 640x640 RGB images
- Output: Detection format with bounding boxes and class scores
- Quantization: Float32 (recommended for accuracy)

### Labels Configuration

The `labels.txt` file should contain one class name per line:

```
healthy
wssv_disease
```

The order must match the model's class output order.

### Performance Tuning

Adjust these constants in `AIService`:

```dart
static const int INPUT_SIZE = 640;              // Model input size
static const double CONFIDENCE_THRESHOLD = 0.8; // Detection threshold
static const int NUM_THREADS = 4;               // CPU threads
```

## Usage Patterns

### Simple Detection

```dart
final aiService = AIService();
await aiService.initialize();

final detections = await aiService.detectObjects(
  imageBytes,
  imageWidth,
  imageHeight,
);
```

### Camera Integration

```dart
// Capture from camera
final XFile image = await cameraController.takePicture();
final imageBytes = await File(image.path).readAsBytes();

// Detect
final detections = await aiService.detectObjects(
  imageBytes,
  cameraImage.width,
  cameraImage.height,
);
```

### Batch Processing

```dart
for (var imagePath in imagePaths) {
  final imageBytes = await File(imagePath).readAsBytes();
  final image = img.decodeImage(imageBytes);
  
  final detections = await aiService.detectObjects(
    imageBytes,
    image.width,
    image.height,
  );
  
  // Process detections
}
```

## Error Handling

The implementation includes comprehensive error handling:

1. **Initialization Errors**
   - Model file not found
   - Invalid model format
   - Labels file missing

2. **Processing Errors**
   - Image decode failures
   - Invalid image formats
   - Out of memory

3. **Inference Errors**
   - Tensor shape mismatches
   - Invalid input data

All errors are logged and propagated with meaningful messages.

## Performance Metrics

Expected performance on mobile devices:

- **Model Load Time**: 1-3 seconds (one-time cost)
- **Preprocessing**: 100-300ms (depends on image size)
- **Inference**: 50-200ms (depends on device CPU)
- **Post-processing**: 10-50ms

Total detection time: ~200-550ms per image

## Memory Management

The implementation follows Flutter best practices:

```dart
@override
void dispose() {
  aiService.dispose();  // Release model resources
  super.dispose();
}
```

Always call `dispose()` when done to:
- Free interpreter memory
- Release model resources
- Prevent memory leaks

## Testing Recommendations

1. **Unit Tests**
   - Test preprocessing with various image sizes
   - Verify coordinate scaling calculations
   - Test confidence filtering

2. **Integration Tests**
   - Test full detection pipeline
   - Verify model loading
   - Test with sample images

3. **Performance Tests**
   - Measure inference time
   - Monitor memory usage
   - Test on target devices

## Troubleshooting

### Model Won't Load

Check:
- File exists in `assets/models/`
- Path matches `MODEL_PATH` constant
- File is valid TFLite format
- Asset is declared in `pubspec.yaml`

### Poor Detection Results

Check:
- Image preprocessing matches training
- Confidence threshold is appropriate
- Labels file matches model output
- Input size matches model expectations

### Performance Issues

Try:
- Reduce CPU threads (may help on low-end devices)
- Use smaller model variant
- Reduce input image size before preprocessing
- Enable GPU delegate (if available)

## Future Enhancements

Potential improvements:

1. **GPU Acceleration**
   - Use GPU delegate for faster inference
   - Requires device support

2. **Model Optimization**
   - Quantization (INT8) for smaller size
   - Model pruning for faster inference

3. **Advanced Post-processing**
   - Non-maximum suppression (NMS)
   - Multi-scale detection
   - Tracking across frames

4. **Caching**
   - Cache preprocessed images
   - Batch processing optimization

## References

- TensorFlow Lite: https://www.tensorflow.org/lite
- YOLOv8: https://github.com/ultralytics/ultralytics
- tflite_flutter package: https://pub.dev/packages/tflite_flutter
- Flutter Image package: https://pub.dev/packages/image
