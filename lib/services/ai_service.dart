import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/services.dart';
import 'package:tflite_flutter/tflite_flutter.dart';
import 'package:image/image.dart' as img;
import '../models/detection_result.dart';
import '../models/bounding_box.dart';

/// AI Service class for handling TensorFlow Lite model operations
/// 
/// This service provides:
/// - Model loading and initialization
/// - Image preprocessing (resize and normalization)
/// - Inference execution
/// - Post-processing (bounding box extraction and filtering)
class AIService {
  // Model configuration
  static const String MODEL_PATH = 'assets/models/yolov8n_shrimp.tflite';
  static const String LABELS_PATH = 'assets/models/labels.txt';
  static const int INPUT_SIZE = 640;
  static const double CONFIDENCE_THRESHOLD = 0.8; // 80% confidence threshold
  
  // Model components
  Interpreter? _interpreter;
  List<String>? _labels;
  bool _isInitialized = false;

  /// Get initialization status
  bool get isInitialized => _isInitialized;

  /// Initialize the AI model
  /// 
  /// Loads the TensorFlow Lite model and label file into memory.
  /// Configures the interpreter with optimized settings.
  /// 
  /// Throws [Exception] if model loading fails
  Future<void> initialize() async {
    try {
      print('Loading AI model...');
      
      // Load labels
      _labels = await _loadLabels();
      print('Loaded ${_labels!.length} labels: $_labels');
      
      // Load model
      _interpreter = await _loadModel();
      print('Model loaded successfully');
      
      _isInitialized = true;
      print('AI Service initialized successfully');
    } catch (e) {
      print('Error initializing AI Service: $e');
      throw Exception('Failed to initialize AI Service: $e');
    }
  }

  /// Load the TensorFlow Lite model
  Future<Interpreter> _loadModel() async {
    try {
      // Create interpreter options with optimized settings
      final options = InterpreterOptions()
        ..threads = 4; // Use 4 CPU threads for better performance
      
      // Load model from assets
      final interpreter = await Interpreter.fromAsset(
        MODEL_PATH,
        options: options,
      );
      
      // Print input/output tensor information for debugging
      print('Input tensor shape: ${interpreter.getInputTensor(0).shape}');
      print('Input tensor type: ${interpreter.getInputTensor(0).type}');
      print('Output tensor count: ${interpreter.getOutputTensors().length}');
      
      for (int i = 0; i < interpreter.getOutputTensors().length; i++) {
        print('Output tensor $i shape: ${interpreter.getOutputTensor(i).shape}');
        print('Output tensor $i type: ${interpreter.getOutputTensor(i).type}');
      }
      
      return interpreter;
    } catch (e) {
      print('Error loading model: $e');
      rethrow;
    }
  }

  /// Load labels from the labels file
  Future<List<String>> _loadLabels() async {
    try {
      final labelsData = await rootBundle.loadString(LABELS_PATH);
      return labelsData
          .split('\n')
          .where((label) => label.trim().isNotEmpty)
          .map((label) => label.trim())
          .toList();
    } catch (e) {
      print('Error loading labels: $e');
      rethrow;
    }
  }

  /// Preprocess image for model input
  /// 
  /// Steps:
  /// 1. Resize image to INPUT_SIZE x INPUT_SIZE (640x640)
  /// 2. Normalize pixel values from 0-255 to 0.0-1.0
  /// 3. Convert to the format expected by the model
  /// 
  /// [imageBytes] - Raw image data
  /// Returns preprocessed data ready for inference
  Float32List preprocessImage(Uint8List imageBytes) {
    try {
      print('Preprocessing image...');
      
      // Decode image
      img.Image? image = img.decodeImage(imageBytes);
      if (image == null) {
        throw Exception('Failed to decode image');
      }
      
      print('Original image size: ${image.width}x${image.height}');
      
      // Resize image to model input size (640x640)
      img.Image resizedImage = img.copyResize(
        image,
        width: INPUT_SIZE,
        height: INPUT_SIZE,
        interpolation: img.Interpolation.linear,
      );
      
      print('Resized image to: ${resizedImage.width}x${resizedImage.height}');
      
      // Convert to Float32List and normalize
      // YOLOv8 expects input in shape [1, 640, 640, 3] with values 0.0-1.0
      final inputSize = INPUT_SIZE * INPUT_SIZE * 3;
      final input = Float32List(inputSize);
      
      int pixelIndex = 0;
      for (int y = 0; y < INPUT_SIZE; y++) {
        for (int x = 0; x < INPUT_SIZE; x++) {
          final pixel = resizedImage.getPixel(x, y);
          
          // Normalize RGB values from 0-255 to 0.0-1.0
          input[pixelIndex++] = pixel.r / 255.0;
          input[pixelIndex++] = pixel.g / 255.0;
          input[pixelIndex++] = pixel.b / 255.0;
        }
      }
      
      print('Image preprocessing complete');
      return input;
    } catch (e) {
      print('Error preprocessing image: $e');
      rethrow;
    }
  }

  /// Run inference on preprocessed image data
  /// 
  /// [input] - Preprocessed image data
  /// Returns raw output from the model
  List<List<dynamic>> runInference(Float32List input) {
    if (!_isInitialized || _interpreter == null) {
      throw Exception('AI Service not initialized. Call initialize() first.');
    }
    
    try {
      print('Running inference...');
      
      // Reshape input to match model expectations [1, 640, 640, 3]
      final inputTensor = input.reshape([1, INPUT_SIZE, INPUT_SIZE, 3]);
      
      // Prepare output buffer
      // YOLOv8 output shape is typically [1, num_detections, 85] 
      // where 85 = 4 (bbox) + 1 (confidence) + 80 (class scores for COCO)
      // For our case with 2 classes, it might be [1, num_detections, 7] = 4 + 1 + 2
      // We'll create a flexible output buffer based on actual model output
      final outputTensors = _interpreter!.getOutputTensors();
      final outputShape = outputTensors[0].shape;
      print('Output shape: $outputShape');
      
      // Create output buffer
      final output = List.filled(
        outputShape[0],
        List.filled(
          outputShape[1],
          List<double>.filled(outputShape[2], 0.0),
        ),
      );
      
      // Run inference
      _interpreter!.run(inputTensor, output);
      
      print('Inference complete');
      return output;
    } catch (e) {
      print('Error running inference: $e');
      rethrow;
    }
  }

  /// Post-process raw model output into detection results
  /// 
  /// Extracts bounding boxes, class labels, and confidence scores
  /// Filters results based on confidence threshold (>80%)
  /// 
  /// [output] - Raw output from model inference
  /// [originalWidth] - Original image width for coordinate scaling
  /// [originalHeight] - Original image height for coordinate scaling
  /// Returns list of filtered detection results
  List<DetectionResult> postProcess(
    List<List<dynamic>> output,
    int originalWidth,
    int originalHeight,
  ) {
    try {
      print('Post-processing detections...');
      
      final detections = <DetectionResult>[];
      
      // Parse output based on YOLOv8 format
      // Output format: [batch, num_detections, data]
      // data format: [x_center, y_center, width, height, confidence, class_scores...]
      
      for (var detection in output[0]) {
        // Extract bounding box coordinates (normalized to 0-1)
        final xCenter = detection[0] as double;
        final yCenter = detection[1] as double;
        final width = detection[2] as double;
        final height = detection[3] as double;
        
        // Extract confidence score
        final confidence = detection[4] as double;
        
        // Only process detections with confidence > 80%
        if (confidence < CONFIDENCE_THRESHOLD) {
          continue;
        }
        
        // Find the class with highest score
        int classIndex = 0;
        double maxClassScore = 0.0;
        
        for (int i = 5; i < detection.length; i++) {
          final score = detection[i] as double;
          if (score > maxClassScore) {
            maxClassScore = score;
            classIndex = i - 5;
          }
        }
        
        // Get class label
        final label = (classIndex < _labels!.length)
            ? _labels![classIndex]
            : 'unknown';
        
        // Convert normalized coordinates to pixel coordinates
        // Scale from model size (640x640) to original image size
        final scaleX = originalWidth / INPUT_SIZE;
        final scaleY = originalHeight / INPUT_SIZE;
        
        final x = (xCenter - width / 2) * INPUT_SIZE * scaleX;
        final y = (yCenter - height / 2) * INPUT_SIZE * scaleY;
        final boxWidth = width * INPUT_SIZE * scaleX;
        final boxHeight = height * INPUT_SIZE * scaleY;
        
        // Create detection result
        final boundingBox = BoundingBox(
          x: x.clamp(0, originalWidth.toDouble()),
          y: y.clamp(0, originalHeight.toDouble()),
          width: boxWidth.clamp(0, originalWidth.toDouble()),
          height: boxHeight.clamp(0, originalHeight.toDouble()),
        );
        
        detections.add(DetectionResult(
          boundingBox: boundingBox,
          label: label,
          confidence: confidence,
        ));
      }
      
      print('Found ${detections.length} detections with confidence > ${CONFIDENCE_THRESHOLD * 100}%');
      return detections;
    } catch (e) {
      print('Error post-processing detections: $e');
      rethrow;
    }
  }

  /// Detect objects in an image (end-to-end pipeline)
  /// 
  /// Combines preprocessing, inference, and post-processing
  /// 
  /// [imageBytes] - Raw image data
  /// [originalWidth] - Original image width
  /// [originalHeight] - Original image height
  /// Returns list of detection results
  Future<List<DetectionResult>> detectObjects(
    Uint8List imageBytes,
    int originalWidth,
    int originalHeight,
  ) async {
    if (!_isInitialized) {
      throw Exception('AI Service not initialized. Call initialize() first.');
    }
    
    try {
      // Step 1: Preprocess image
      final input = preprocessImage(imageBytes);
      
      // Step 2: Run inference
      final output = runInference(input);
      
      // Step 3: Post-process results
      final detections = postProcess(output, originalWidth, originalHeight);
      
      return detections;
    } catch (e) {
      print('Error detecting objects: $e');
      rethrow;
    }
  }

  /// Dispose of resources
  void dispose() {
    _interpreter?.close();
    _interpreter = null;
    _isInitialized = false;
    print('AI Service disposed');
  }
}
