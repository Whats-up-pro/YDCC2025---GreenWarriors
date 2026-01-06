# Visual Usage Guide

## 🎯 Complete Workflow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     SHRIMP DISEASE DETECTION                         │
│                         Workflow Overview                            │
└─────────────────────────────────────────────────────────────────────┘

Step 1: App Startup
───────────────────
    ┌─────────────┐
    │  App Start  │
    └──────┬──────┘
           │
           ▼
    ┌──────────────────┐
    │  Initialize AI   │  ← Load yolov8n_shrimp.tflite
    │     Service      │  ← Load labels.txt
    └──────┬───────────┘  ← Configure 4 CPU threads
           │
           ▼
    ┌──────────────────┐
    │  Ready to Use    │  ✅ Model loaded in memory
    └──────────────────┘


Step 2: Image Capture
──────────────────────
    ┌──────────────────┐
    │  User Action:    │
    │  📸 Take Photo   │  OR  🖼️  Select from Gallery
    └──────┬───────────┘
           │
           ▼
    ┌──────────────────────────┐
    │  Image Bytes             │  Uint8List (4000x3000 pixels)
    │  [0xFF, 0xD8, ...]       │  JPEG/PNG format
    └──────┬───────────────────┘
           │
           ▼


Step 3: AI Processing
──────────────────────
    ┌────────────────────────────────────────────┐
    │           detectObjects()                  │
    │  ┌──────────────────────────────────────┐ │
    │  │  1. Preprocess Image                  │ │
    │  │     4000x3000 → 640x640               │ │
    │  │     0-255 → 0.0-1.0                   │ │
    │  └───────────────┬──────────────────────┘ │
    │                  │                         │
    │  ┌───────────────▼──────────────────────┐ │
    │  │  2. Run Inference                     │ │
    │  │     YOLOv8 TFLite Model               │ │
    │  │     50-200ms                          │ │
    │  └───────────────┬──────────────────────┘ │
    │                  │                         │
    │  ┌───────────────▼──────────────────────┐ │
    │  │  3. Post-process Results              │ │
    │  │     Filter: confidence > 80%          │ │
    │  │     Scale: 640x640 → 4000x3000        │ │
    │  └───────────────┬──────────────────────┘ │
    └──────────────────┼────────────────────────┘
                       │
                       ▼


Step 4: Results
────────────────
    ┌─────────────────────────────────────────┐
    │  List<DetectionResult>                  │
    ├─────────────────────────────────────────┤
    │  [0] healthy         92% confidence     │
    │      Box: (120, 85, 200, 180)          │
    │                                         │
    │  [1] wssv_disease    85% confidence     │
    │      Box: (450, 220, 180, 160)         │
    └─────────────────┬───────────────────────┘
                      │
                      ▼


Step 5: Display
────────────────
    ┌─────────────────────────────────────────┐
    │        Display on Screen                │
    │                                         │
    │  ┌─────────────────────────────────┐   │
    │  │  [Original Image with Boxes]    │   │
    │  │                                 │   │
    │  │   ┌───────┐  ← Green (Healthy) │   │
    │  │   │       │                     │   │
    │  │   └───────┘                     │   │
    │  │                                 │   │
    │  │        ┌───────┐  ← Red (Disease)  │
    │  │        │       │                │   │
    │  │        └───────┘                │   │
    │  └─────────────────────────────────┘   │
    │                                         │
    │  ✅ Healthy: 92%                       │
    │  ⚠️  WSSV Disease: 85%                │
    └─────────────────────────────────────────┘
```

## 💻 Code Example Flow

### Initialization Phase

```dart
// ════════════════════════════════════════════════════
// PHASE 1: INITIALIZE (Once at app startup)
// ════════════════════════════════════════════════════

final AIService aiService = AIService();

await aiService.initialize();
// ↓
// Loads: yolov8n_shrimp.tflite (5-20 MB)
// Loads: labels.txt → ["healthy", "wssv_disease"]
// Creates: Interpreter with 4 CPU threads
// Time: 1-3 seconds
// ↓
// ✅ Ready to detect!
```

### Detection Phase

```dart
// ════════════════════════════════════════════════════
// PHASE 2: DETECT (Each time user takes/selects image)
// ════════════════════════════════════════════════════

// Get image
final Uint8List imageBytes = ... // from camera or file

// Get image dimensions
final int width = 4000;
final int height = 3000;

// Run detection
final List<DetectionResult> detections = 
    await aiService.detectObjects(imageBytes, width, height);
// ↓
// Step 1: Preprocess (100-300ms)
//   - Resize: 4000x3000 → 640x640
//   - Normalize: 0-255 → 0.0-1.0
// ↓
// Step 2: Inference (50-200ms)
//   - Run YOLOv8 model
// ↓
// Step 3: Postprocess (10-50ms)
//   - Filter confidence > 80%
//   - Scale back: 640x640 → 4000x3000
// ↓
// ✅ Returns: List of detections
```

### Results Processing

```dart
// ════════════════════════════════════════════════════
// PHASE 3: PROCESS RESULTS
// ════════════════════════════════════════════════════

for (var detection in detections) {
  print('Found: ${detection.label}');
  print('Confidence: ${(detection.confidence * 100).toInt()}%');
  print('Location: (${detection.boundingBox.x.toInt()}, '
        '${detection.boundingBox.y.toInt()})');
  
  // Display on UI
  if (detection.label == 'wssv_disease') {
    showWarning('⚠️ WSSV Disease Detected!');
  } else if (detection.label == 'healthy') {
    showSuccess('✅ Healthy Shrimp');
  }
}
```

## 📱 User Interface Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    User Interface Flow                        │
└──────────────────────────────────────────────────────────────┘

    Main Screen                Camera Screen              Results Screen
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│              │          │   📸 Camera   │          │   Results    │
│  [Camera]    │  ──────▶ │   Preview     │  ──────▶ │              │
│              │          │              │          │  ✅ Healthy  │
│  [Gallery]   │          │              │          │     92%      │
│              │          │  [Capture]   │          │              │
│  [Settings]  │          │              │          │  ⚠️  Disease │
│              │          │  [Cancel]    │          │     85%      │
└──────────────┘          └──────────────┘          │              │
                                                     │  [Details]   │
                                                     │  [Share]     │
                                                     └──────────────┘
```

## 🔄 Data Transformation

```
┌──────────────────────────────────────────────────────────────┐
│                   Data Transformation                         │
└──────────────────────────────────────────────────────────────┘

Original Image
╔═══════════════════════════════════════════╗
║  4000 x 3000 pixels                       ║
║  JPEG/PNG Format                          ║
║  File Size: ~2-5 MB                       ║
╚═══════════════════════════════════════════╝
              │
              │ decodeImage()
              ▼
Image Object
╔═══════════════════════════════════════════╗
║  Width: 4000, Height: 3000                ║
║  Pixels: RGB values (0-255)               ║
╚═══════════════════════════════════════════╝
              │
              │ copyResize(640, 640)
              ▼
Resized Image
╔═══════════════════════════════════════════╗
║  640 x 640 pixels                         ║
║  Pixels: RGB values (0-255)               ║
╚═══════════════════════════════════════════╝
              │
              │ normalize (÷ 255.0)
              ▼
Normalized Tensor
╔═══════════════════════════════════════════╗
║  Shape: [1, 640, 640, 3]                  ║
║  Values: Float32 (0.0 - 1.0)              ║
║  Size: ~4.7 MB in memory                  ║
╚═══════════════════════════════════════════╝
              │
              │ interpreter.run()
              ▼
Raw Output
╔═══════════════════════════════════════════╗
║  Shape: [1, N, 7+]                        ║
║  N detections, each with:                 ║
║    [x, y, w, h, conf, score1, score2]     ║
╚═══════════════════════════════════════════╝
              │
              │ postProcess()
              ▼
DetectionResult[]
╔═══════════════════════════════════════════╗
║  Detection 1:                             ║
║    Label: "healthy"                       ║
║    Confidence: 0.92 (92%)                 ║
║    Box: (120, 85, 200, 180)              ║
║                                           ║
║  Detection 2:                             ║
║    Label: "wssv_disease"                  ║
║    Confidence: 0.85 (85%)                 ║
║    Box: (450, 220, 180, 160)             ║
╚═══════════════════════════════════════════╝
```

## ⚡ Performance Timeline

```
Time        Event                  Memory Usage
─────────────────────────────────────────────────────────
0 ms        App Start              ~10 MB
│
▼
1000 ms     Initialize AI          ~30 MB (model loaded)
│           - Load model           
│           - Load labels
│           - Setup interpreter
│
▼
────────    Ready State            ~30 MB (idle)
│
│
▼           User captures image
│
0 ms        Start Detection        ~35 MB (image in memory)
│
▼
100 ms      Preprocessing done     ~40 MB (tensors created)
│           - Decode
│           - Resize
│           - Normalize
│
▼
250 ms      Inference done         ~40 MB
│           - Model execution
│
▼
270 ms      Postprocess done       ~35 MB (results created)
│           - Parse output
│           - Filter confidence
│           - Scale coordinates
│
▼
270 ms      Results Ready          ~30 MB (image released)
│
▼
────────    Display Results        ~30 MB (idle)
```

## 📊 Confidence Visualization

```
Confidence Threshold: 80%
─────────────────────────────────────────────

  100% ┤                                        
       │  ██                                   
   95% ┤  ██                                   ← Healthy (92%)
       │  ██                                   
   90% ┤  ██  ██                               
       │  ██  ██                               ← WSSV Disease (85%)
   85% ┤  ██  ██                               
       │  ██  ██                               
   80% ┼──██──██───────────────────────────    ← Threshold
       │  ██  ██                               
   75% ┤  ██  ██  ▒▒                          
       │  ██  ██  ▒▒                          ← Rejected (78%)
   70% ┤  ██  ██  ▒▒  ▒▒                      
       │  ██  ██  ▒▒  ▒▒                      ← Rejected (65%)
   65% ┤  ██  ██  ▒▒  ▒▒                      
       │                                        
     0% └────────────────────────────────────  
       
       Legend:
       ██ = Accepted (confidence ≥ 80%)
       ▒▒ = Rejected (confidence < 80%)
```

## 🎨 Bounding Box Visualization

```
Original Image (4000 x 3000)
┌────────────────────────────────────────────────┐
│                                                │
│    ┌──────────────┐  ← Healthy (Green Box)    │
│    │              │    92% confidence          │
│    │    Shrimp 1  │    Position: (120, 85)     │
│    │              │    Size: 200 x 180         │
│    └──────────────┘                            │
│                                                │
│                          ┌──────────────┐      │
│                          │              │ ←    │
│         WSSV Disease     │    Shrimp 2  │      │
│         (Red Box)        │              │      │
│         85% confidence   └──────────────┘      │
│         Position: (450, 220)                   │
│         Size: 180 x 160                        │
│                                                │
└────────────────────────────────────────────────┘
```

---

**💡 Tip**: For best results, ensure:
- Good lighting conditions
- Clear image of shrimp
- Shrimp occupies significant portion of image
- Camera is stable (not blurry)
