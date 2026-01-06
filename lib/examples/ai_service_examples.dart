import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'package:image/image.dart' as img;
import '../services/ai_service.dart';
import '../models/detection_result.dart';

/// Example usage of AIService with camera integration
/// 
/// This example demonstrates how to:
/// 1. Initialize the AI service
/// 2. Capture images from camera
/// 3. Run detection on captured images
/// 4. Display results with bounding boxes
class CameraDetectionExample extends StatefulWidget {
  const CameraDetectionExample({super.key});

  @override
  State<CameraDetectionExample> createState() => _CameraDetectionExampleState();
}

class _CameraDetectionExampleState extends State<CameraDetectionExample> {
  final AIService _aiService = AIService();
  CameraController? _cameraController;
  List<DetectionResult> _detections = [];
  bool _isProcessing = false;
  bool _isInitialized = false;

  @override
  void initState() {
    super.initState();
    _initializeServices();
  }

  Future<void> _initializeServices() async {
    try {
      // Initialize AI Service
      await _aiService.initialize();
      
      // Initialize Camera
      final cameras = await availableCameras();
      if (cameras.isNotEmpty) {
        _cameraController = CameraController(
          cameras.first,
          ResolutionPreset.high,
        );
        await _cameraController!.initialize();
      }
      
      setState(() {
        _isInitialized = true;
      });
    } catch (e) {
      print('Error initializing services: $e');
    }
  }

  Future<void> _captureAndDetect() async {
    if (_cameraController == null || !_cameraController!.value.isInitialized) {
      return;
    }

    setState(() {
      _isProcessing = true;
    });

    try {
      // Capture image
      final XFile image = await _cameraController!.takePicture();
      
      // Read image bytes
      final Uint8List imageBytes = await File(image.path).readAsBytes();
      
      // Decode image to get dimensions
      final decodedImage = img.decodeImage(imageBytes);
      if (decodedImage == null) {
        throw Exception('Failed to decode image');
      }
      
      // Run detection
      final detections = await _aiService.detectObjects(
        imageBytes,
        decodedImage.width,
        decodedImage.height,
      );
      
      setState(() {
        _detections = detections;
      });
      
      // Log results
      print('Detected ${detections.length} objects:');
      for (var detection in detections) {
        print(detection);
      }
    } catch (e) {
      print('Error during detection: $e');
    } finally {
      setState(() {
        _isProcessing = false;
      });
    }
  }

  @override
  void dispose() {
    _cameraController?.dispose();
    _aiService.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_isInitialized) {
      return const Scaffold(
        body: Center(
          child: CircularProgressIndicator(),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Camera Detection'),
      ),
      body: Column(
        children: [
          // Camera preview
          if (_cameraController != null &&
              _cameraController!.value.isInitialized)
            Expanded(
              child: CameraPreview(_cameraController!),
            ),
          
          // Detection results
          Container(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                Text(
                  'Detections: ${_detections.length}',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 10),
                ..._detections.map((detection) => Card(
                  child: ListTile(
                    leading: Icon(
                      detection.label == 'healthy'
                          ? Icons.check_circle
                          : Icons.warning,
                      color: detection.label == 'healthy'
                          ? Colors.green
                          : Colors.red,
                    ),
                    title: Text(detection.label.toUpperCase()),
                    subtitle: Text(
                      'Confidence: ${(detection.confidence * 100).toStringAsFixed(2)}%',
                    ),
                  ),
                )),
              ],
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _isProcessing ? null : _captureAndDetect,
        child: _isProcessing
            ? const CircularProgressIndicator(color: Colors.white)
            : const Icon(Icons.camera),
      ),
    );
  }
}

/// Example usage with a static image file
class ImageDetectionExample {
  final AIService _aiService = AIService();

  Future<void> detectFromFile(String imagePath) async {
    try {
      // Initialize AI service if not already done
      if (!_aiService.isInitialized) {
        await _aiService.initialize();
      }

      // Read image file
      final File imageFile = File(imagePath);
      final Uint8List imageBytes = await imageFile.readAsBytes();

      // Decode image to get dimensions
      final decodedImage = img.decodeImage(imageBytes);
      if (decodedImage == null) {
        throw Exception('Failed to decode image');
      }

      print('Image size: ${decodedImage.width}x${decodedImage.height}');

      // Run detection
      final detections = await _aiService.detectObjects(
        imageBytes,
        decodedImage.width,
        decodedImage.height,
      );

      // Process results
      print('Found ${detections.length} detections:');
      for (var detection in detections) {
        print('---');
        print('Label: ${detection.label}');
        print('Confidence: ${(detection.confidence * 100).toStringAsFixed(2)}%');
        print('Bounding Box:');
        print('  X: ${detection.boundingBox.x.toStringAsFixed(2)}');
        print('  Y: ${detection.boundingBox.y.toStringAsFixed(2)}');
        print('  Width: ${detection.boundingBox.width.toStringAsFixed(2)}');
        print('  Height: ${detection.boundingBox.height.toStringAsFixed(2)}');
      }

      return;
    } catch (e) {
      print('Error in detection: $e');
      rethrow;
    }
  }

  void dispose() {
    _aiService.dispose();
  }
}

/// Example usage with batch processing
class BatchDetectionExample {
  final AIService _aiService = AIService();

  Future<Map<String, List<DetectionResult>>> detectBatch(
    List<String> imagePaths,
  ) async {
    try {
      // Initialize AI service
      if (!_aiService.isInitialized) {
        await _aiService.initialize();
      }

      final results = <String, List<DetectionResult>>{};

      // Process each image
      for (var imagePath in imagePaths) {
        print('Processing: $imagePath');

        final imageBytes = await File(imagePath).readAsBytes();
        final decodedImage = img.decodeImage(imageBytes);

        if (decodedImage != null) {
          final detections = await _aiService.detectObjects(
            imageBytes,
            decodedImage.width,
            decodedImage.height,
          );

          results[imagePath] = detections;
          print('  Found ${detections.length} detections');
        }
      }

      return results;
    } catch (e) {
      print('Error in batch detection: $e');
      rethrow;
    }
  }

  void dispose() {
    _aiService.dispose();
  }
}

/// Example of custom post-processing with additional filters
class CustomPostProcessingExample {
  final AIService _aiService = AIService();

  Future<List<DetectionResult>> detectWithCustomFilters(
    Uint8List imageBytes,
    int width,
    int height, {
    double minConfidence = 0.9, // Custom confidence threshold
    String? filterLabel, // Optional: only return specific label
  }) async {
    try {
      if (!_aiService.isInitialized) {
        await _aiService.initialize();
      }

      // Get all detections
      final allDetections = await _aiService.detectObjects(
        imageBytes,
        width,
        height,
      );

      // Apply custom filters
      final filtered = allDetections.where((detection) {
        // Filter by confidence
        if (detection.confidence < minConfidence) {
          return false;
        }

        // Filter by label if specified
        if (filterLabel != null && detection.label != filterLabel) {
          return false;
        }

        return true;
      }).toList();

      print('Filtered ${filtered.length} from ${allDetections.length} detections');
      return filtered;
    } catch (e) {
      print('Error in custom detection: $e');
      rethrow;
    }
  }

  void dispose() {
    _aiService.dispose();
  }
}
