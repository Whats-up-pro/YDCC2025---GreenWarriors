import 'package:flutter_test/flutter_test.dart';
import 'package:green_warriors/models/bounding_box.dart';
import 'package:green_warriors/models/detection_result.dart';

void main() {
  group('DetectionResult', () {
    test('creates detection result with correct values', () {
      final box = BoundingBox(x: 10.0, y: 20.0, width: 100.0, height: 150.0);
      final detection = DetectionResult(
        boundingBox: box,
        label: 'healthy',
        confidence: 0.95,
      );

      expect(detection.boundingBox, box);
      expect(detection.label, 'healthy');
      expect(detection.confidence, 0.95);
    });

    test('toString includes all information', () {
      final box = BoundingBox(x: 10.0, y: 20.0, width: 100.0, height: 150.0);
      final detection = DetectionResult(
        boundingBox: box,
        label: 'wssv_disease',
        confidence: 0.85,
      );

      final result = detection.toString();
      expect(result, contains('wssv_disease'));
      expect(result, contains('85.00%'));
      expect(result, contains('BoundingBox'));
    });

    test('toJson returns correct structure', () {
      final box = BoundingBox(x: 10.0, y: 20.0, width: 100.0, height: 150.0);
      final detection = DetectionResult(
        boundingBox: box,
        label: 'healthy',
        confidence: 0.92,
      );

      final json = detection.toJson();
      expect(json['label'], 'healthy');
      expect(json['confidence'], 0.92);
      expect(json['boundingBox'], isA<Map<String, dynamic>>());
      expect(json['boundingBox']['x'], 10.0);
      expect(json['boundingBox']['y'], 20.0);
    });

    test('handles high confidence values', () {
      final box = BoundingBox(x: 0.0, y: 0.0, width: 50.0, height: 50.0);
      final detection = DetectionResult(
        boundingBox: box,
        label: 'healthy',
        confidence: 0.99,
      );

      expect(detection.confidence, 0.99);
      expect(detection.toString(), contains('99.00%'));
    });

    test('handles threshold confidence (80%)', () {
      final box = BoundingBox(x: 0.0, y: 0.0, width: 50.0, height: 50.0);
      final detection = DetectionResult(
        boundingBox: box,
        label: 'wssv_disease',
        confidence: 0.80,
      );

      expect(detection.confidence, 0.80);
      expect(detection.toString(), contains('80.00%'));
    });

    test('handles different label types', () {
      final box = BoundingBox(x: 0.0, y: 0.0, width: 50.0, height: 50.0);

      final healthyDetection = DetectionResult(
        boundingBox: box,
        label: 'healthy',
        confidence: 0.90,
      );
      expect(healthyDetection.label, 'healthy');

      final diseaseDetection = DetectionResult(
        boundingBox: box,
        label: 'wssv_disease',
        confidence: 0.85,
      );
      expect(diseaseDetection.label, 'wssv_disease');
    });

    test('confidence is displayed with 2 decimal places', () {
      final box = BoundingBox(x: 0.0, y: 0.0, width: 50.0, height: 50.0);
      final detection = DetectionResult(
        boundingBox: box,
        label: 'healthy',
        confidence: 0.8567,
      );

      expect(detection.toString(), contains('85.67%'));
    });
  });
}
