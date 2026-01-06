import 'bounding_box.dart';

/// Represents a single detection result from the AI model
class DetectionResult {
  final BoundingBox boundingBox;
  final String label;
  final double confidence;

  DetectionResult({
    required this.boundingBox,
    required this.label,
    required this.confidence,
  });

  @override
  String toString() {
    return 'DetectionResult(label: $label, confidence: ${(confidence * 100).toStringAsFixed(2)}%, box: $boundingBox)';
  }

  Map<String, dynamic> toJson() {
    return {
      'boundingBox': boundingBox.toJson(),
      'label': label,
      'confidence': confidence,
    };
  }
}
