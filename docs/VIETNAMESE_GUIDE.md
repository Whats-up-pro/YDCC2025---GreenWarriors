# Hướng dẫn Chi tiết - Tích hợp Mô hình AI

## Tổng quan

Tài liệu này giải thích chi tiết cách triển khai tích hợp mô hình AI TensorFlow Lite để phát hiện bệnh tôm.

## Các bước thực hiện

### Bước 1: Chuẩn bị Mô hình (Model Preparation)

**Mục tiêu**: Đưa file mô hình `.tflite` và file nhãn vào dự án

**Cách làm**:
1. Đặt file `yolov8n_shrimp.tflite` vào thư mục `assets/models/`
2. Kiểm tra file `labels.txt` chứa các lớp:
   ```
   healthy
   wssv_disease
   ```

**Khai báo trong pubspec.yaml**:
```yaml
flutter:
  assets:
    - assets/models/
    - assets/models/labels.txt
```

### Bước 2: Khởi tạo Mô hình (Model Initialization)

**File**: `lib/services/ai_service.dart`

**Chức năng chính**:
```dart
Future<void> initialize() async {
  // 1. Tải danh sách nhãn từ file
  _labels = await _loadLabels();
  
  // 2. Cấu hình interpreter với 4 luồng CPU
  final options = InterpreterOptions()
    ..threads = 4;  // Tối ưu hiệu năng
  
  // 3. Tải mô hình từ assets
  _interpreter = await Interpreter.fromAsset(
    MODEL_PATH,
    options: options,
  );
}
```

**Ý nghĩa**:
- `threads = 4`: Sử dụng 4 luồng CPU để chạy nhanh hơn
- Tải mô hình một lần khi app khởi động
- Xác thực kích thước tensor đầu vào/ra

### Bước 3: Tiền xử lý Ảnh (Image Pre-processing)

**Vấn đề**: Ảnh camera có độ phân giải cao (VD: 4000x3000px), nhưng mô hình chỉ nhận ảnh 640x640px

**Giải pháp - 3 bước xử lý**:

#### 3.1. Giải mã ảnh (Decode)
```dart
img.Image? image = img.decodeImage(imageBytes);
```
- Chuyển đổi bytes thành đối tượng ảnh có thể xử lý

#### 3.2. Resize về 640x640
```dart
img.Image resizedImage = img.copyResize(
  image,
  width: 640,
  height: 640,
  interpolation: img.Interpolation.linear,
);
```
- Thu nhỏ ảnh về đúng kích thước mô hình yêu cầu
- Dùng linear interpolation để cân bằng tốc độ và chất lượng

#### 3.3. Chuẩn hóa màu sắc (Normalization)
```dart
for (int y = 0; y < 640; y++) {
  for (int x = 0; x < 640; x++) {
    final pixel = resizedImage.getPixel(x, y);
    
    // Chuyển đổi từ 0-255 sang 0.0-1.0
    input[pixelIndex++] = pixel.r / 255.0;
    input[pixelIndex++] = pixel.g / 255.0;
    input[pixelIndex++] = pixel.b / 255.0;
  }
}
```
- Mô hình AI cần giá trị pixel trong khoảng 0.0-1.0
- Chia cho 255.0 để chuẩn hóa từ 0-255 → 0.0-1.0

**Kết quả**: Float32List với shape [1, 640, 640, 3]
- 1 = batch size (1 ảnh)
- 640x640 = kích thước ảnh
- 3 = RGB channels

### Bước 4: Chạy suy luận (Inference)

**Chức năng**:
```dart
List<List<dynamic>> runInference(Float32List input) {
  // 1. Reshape input thành tensor
  final inputTensor = input.reshape([1, 640, 640, 3]);
  
  // 2. Chuẩn bị buffer output
  final outputShape = _interpreter.getOutputTensor(0).shape;
  final output = List.filled(...);
  
  // 3. Chạy mô hình
  _interpreter.run(inputTensor, output);
  
  return output;
}
```

**Đầu vào**: Ảnh đã xử lý (Float32List)
**Đầu ra**: Mảng các con số thô chứa thông tin phát hiện

**Format đầu ra**:
```
[batch, số_phát_hiện, dữ_liệu]

dữ_liệu = [x_center, y_center, width, height, confidence, điểm_lớp_1, điểm_lớp_2, ...]
```

### Bước 5: Hậu xử lý (Post-processing)

**Mục tiêu**: Chuyển đổi con số thô thành thông tin có ý nghĩa

**5.1. Trích xuất thông tin**:
```dart
for (var detection in output[0]) {
  // Tọa độ khung (normalized 0-1)
  final xCenter = detection[0];
  final yCenter = detection[1];
  final width = detection[2];
  final height = detection[3];
  
  // Độ tin cậy
  final confidence = detection[4];
  
  // Điểm số các lớp
  final classScores = detection[5...];
}
```

**5.2. Lọc theo độ tin cậy**:
```dart
// Chỉ nhận phát hiện có confidence > 80%
if (confidence < 0.8) continue;
```

**5.3. Xác định lớp**:
```dart
// Tìm lớp có điểm số cao nhất
int classIndex = 0;
double maxScore = 0.0;

for (int i = 5; i < detection.length; i++) {
  if (detection[i] > maxScore) {
    maxScore = detection[i];
    classIndex = i - 5;
  }
}

final label = _labels[classIndex]; // "healthy" hoặc "wssv_disease"
```

**5.4. Chuyển đổi tọa độ**:
```dart
// Từ không gian mô hình (640x640) → kích thước ảnh gốc
final scaleX = originalWidth / 640;
final scaleY = originalHeight / 640;

final x = (xCenter - width/2) * 640 * scaleX;
final y = (yCenter - height/2) * 640 * scaleY;
final boxWidth = width * 640 * scaleX;
final boxHeight = height * 640 * scaleY;
```

**Giải thích**:
- Mô hình trả về tọa độ center (x_center, y_center)
- Chuyển sang tọa độ góc trên bên trái (x, y)
- Scale từ 640x640 về kích thước ảnh gốc

**5.5. Tạo kết quả**:
```dart
final boundingBox = BoundingBox(
  x: x,
  y: y,
  width: boxWidth,
  height: boxHeight,
);

detections.add(DetectionResult(
  boundingBox: boundingBox,
  label: label,              // "healthy" hoặc "wssv_disease"
  confidence: confidence,    // 0.0-1.0 (VD: 0.85 = 85%)
));
```

## Ví dụ Sử dụng Hoàn chỉnh

### Ví dụ 1: Phát hiện từ ảnh camera

```dart
import 'package:camera/camera.dart';
import 'dart:io';

// 1. Khởi tạo AI Service
final aiService = AIService();
await aiService.initialize();

// 2. Chụp ảnh từ camera
final cameras = await availableCameras();
final controller = CameraController(cameras.first, ResolutionPreset.high);
await controller.initialize();

final XFile image = await controller.takePicture();
final imageBytes = await File(image.path).readAsBytes();

// 3. Chạy phát hiện
final detections = await aiService.detectObjects(
  imageBytes,
  4000,  // Chiều rộng ảnh gốc
  3000,  // Chiều cao ảnh gốc
);

// 4. Xử lý kết quả
for (var detection in detections) {
  if (detection.label == 'wssv_disease') {
    print('⚠️ Phát hiện bệnh WSSV!');
    print('Độ tin cậy: ${(detection.confidence * 100).toStringAsFixed(1)}%');
    print('Vị trí: (${detection.boundingBox.x}, ${detection.boundingBox.y})');
  }
}
```

### Ví dụ 2: Phát hiện từ file ảnh

```dart
import 'dart:io';
import 'package:image/image.dart' as img;

// Đọc file ảnh
final imageFile = File('/path/to/image.jpg');
final imageBytes = await imageFile.readAsBytes();

// Lấy kích thước ảnh
final decodedImage = img.decodeImage(imageBytes);

// Chạy phát hiện
final detections = await aiService.detectObjects(
  imageBytes,
  decodedImage.width,
  decodedImage.height,
);

// In kết quả
print('Tìm thấy ${detections.length} phát hiện');
for (var i = 0; i < detections.length; i++) {
  final d = detections[i];
  print('Phát hiện ${i+1}:');
  print('  - Loại: ${d.label}');
  print('  - Độ tin cậy: ${(d.confidence * 100).toStringAsFixed(1)}%');
  print('  - Khung: (${d.boundingBox.x.toInt()}, ${d.boundingBox.y.toInt()})');
}
```

## Điều chỉnh và Tối ưu

### Thay đổi độ tin cậy tối thiểu

Trong `lib/services/ai_service.dart`:
```dart
static const double CONFIDENCE_THRESHOLD = 0.8;  // Mặc định 80%
```

Có thể điều chỉnh:
- `0.5` (50%) - Nhiều phát hiện hơn, có thể sai
- `0.9` (90%) - Ít phát hiện hơn, chính xác hơn

### Thay đổi số luồng CPU

```dart
final options = InterpreterOptions()
  ..threads = 2;  // Giảm xuống 2 nếu thiết bị yếu
```

### Thay đổi kích thước input

```dart
static const int INPUT_SIZE = 640;  // Có thể thử 320 hoặc 512
```

**Lưu ý**: Phải khớp với kích thước mô hình được train!

## Xử lý Lỗi

### Lỗi: Model không load được

**Nguyên nhân**:
- File không tồn tại trong `assets/models/`
- Chưa khai báo trong `pubspec.yaml`
- Format file không đúng

**Giải pháp**:
1. Kiểm tra file tồn tại
2. Chạy `flutter pub get`
3. Chạy `flutter clean`
4. Build lại app

### Lỗi: Không phát hiện được gì

**Nguyên nhân**:
- Ảnh không chứa tôm
- Độ tin cậy threshold quá cao
- Labels không khớp với model

**Giải pháp**:
1. Giảm CONFIDENCE_THRESHOLD xuống 0.5
2. Kiểm tra labels.txt
3. Kiểm tra ảnh đầu vào

### Lỗi: Out of Memory

**Nguyên nhân**:
- Xử lý nhiều ảnh cùng lúc
- Không dispose đúng cách

**Giải pháp**:
```dart
// Luôn dispose khi xong
@override
void dispose() {
  aiService.dispose();
  super.dispose();
}
```

## Hiệu năng

### Thời gian xử lý trên thiết bị di động:

- **Load model**: 1-3 giây (chỉ 1 lần khi khởi động)
- **Tiền xử lý**: 100-300ms
- **Inference**: 50-200ms
- **Hậu xử lý**: 10-50ms

**Tổng**: ~200-550ms mỗi ảnh

### Tips tối ưu:

1. **Chạy release mode**: `flutter run --release`
2. **Giảm kích thước ảnh** trước khi xử lý
3. **Xử lý background thread** để không block UI
4. **Cache kết quả** nếu ảnh không thay đổi

## Tài liệu Tham khảo

- **TensorFlow Lite**: https://www.tensorflow.org/lite
- **YOLOv8**: https://github.com/ultralytics/ultralytics
- **tflite_flutter**: https://pub.dev/packages/tflite_flutter
- **Flutter Image**: https://pub.dev/packages/image

## Liên hệ và Hỗ trợ

Nếu gặp vấn đề, vui lòng:
1. Kiểm tra các file trong `docs/`
2. Xem ví dụ trong `lib/examples/`
3. Đọc `QUICKSTART.md`
4. Liên hệ team Green Warriors
