import 'package:flutter_test/flutter_test.dart';
import 'package:green_warriors/models/bounding_box.dart';

void main() {
  group('BoundingBox', () {
    test('creates bounding box with correct values', () {
      final box = BoundingBox(
        x: 10.0,
        y: 20.0,
        width: 100.0,
        height: 150.0,
      );

      expect(box.x, 10.0);
      expect(box.y, 20.0);
      expect(box.width, 100.0);
      expect(box.height, 150.0);
    });

    test('toString returns correct format', () {
      final box = BoundingBox(
        x: 10.0,
        y: 20.0,
        width: 100.0,
        height: 150.0,
      );

      final result = box.toString();
      expect(result, contains('10.0'));
      expect(result, contains('20.0'));
      expect(result, contains('100.0'));
      expect(result, contains('150.0'));
    });

    test('toJson returns correct map', () {
      final box = BoundingBox(
        x: 10.0,
        y: 20.0,
        width: 100.0,
        height: 150.0,
      );

      final json = box.toJson();
      expect(json['x'], 10.0);
      expect(json['y'], 20.0);
      expect(json['width'], 100.0);
      expect(json['height'], 150.0);
    });

    test('handles zero values', () {
      final box = BoundingBox(
        x: 0.0,
        y: 0.0,
        width: 0.0,
        height: 0.0,
      );

      expect(box.x, 0.0);
      expect(box.y, 0.0);
      expect(box.width, 0.0);
      expect(box.height, 0.0);
    });

    test('handles negative values', () {
      final box = BoundingBox(
        x: -10.0,
        y: -20.0,
        width: 100.0,
        height: 150.0,
      );

      expect(box.x, -10.0);
      expect(box.y, -20.0);
    });

    test('handles large values', () {
      final box = BoundingBox(
        x: 4000.0,
        y: 3000.0,
        width: 1000.0,
        height: 800.0,
      );

      expect(box.x, 4000.0);
      expect(box.y, 3000.0);
      expect(box.width, 1000.0);
      expect(box.height, 800.0);
    });
  });
}
