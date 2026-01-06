# AI Model Integration - Architecture & Flow

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Flutter Application                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐      ┌──────────────────┐                │
│  │   Camera/Gallery │      │   Image Source   │                │
│  │     Widget       │──────│   (File/Bytes)   │                │
│  └──────────────────┘      └──────────────────┘                │
│           │                          │                          │
│           └──────────────┬───────────┘                          │
│                          │                                      │
│                          ▼                                      │
│              ┌───────────────────────┐                          │
│              │     AI Service        │                          │
│              │  (ai_service.dart)    │                          │
│              └───────────────────────┘                          │
│                          │                                      │
│        ┌─────────────────┼─────────────────┐                   │
│        │                 │                 │                   │
│        ▼                 ▼                 ▼                   │
│  ┌──────────┐    ┌──────────┐     ┌──────────┐               │
│  │Preprocess│    │Inference │     │Postproc. │               │
│  │  Image   │───▶│   Model  │────▶│ Results  │               │
│  └──────────┘    └──────────┘     └──────────┘               │
│                          │                                      │
│                          ▼                                      │
│              ┌───────────────────────┐                          │
│              │  Detection Results    │                          │
│              │  (List<DetectionResult>)                        │
│              └───────────────────────┘                          │
│                          │                                      │
│                          ▼                                      │
│              ┌───────────────────────┐                          │
│              │   UI Display          │                          │
│              │   (Bounding Boxes)    │                          │
│              └───────────────────────┘                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Processing Pipeline

```
                         AI Detection Pipeline
                                
Input Image                                            Output Results
(4000x3000)                                           (Detections)
    │                                                      │
    │                                                      │
    ▼                                                      │
┌────────────────┐                                        │
│  1. DECODE     │  img.decodeImage(bytes)               │
│   Image Bytes  │  ─────────────────────▶               │
└────────────────┘                                        │
    │                                                      │
    │  Image Object                                       │
    ▼                                                      │
┌────────────────┐                                        │
│  2. RESIZE     │  copyResize(640x640)                  │
│   640 x 640    │  ─────────────────────▶               │
└────────────────┘                                        │
    │                                                      │
    │  Resized Image                                      │
    ▼                                                      │
┌────────────────┐                                        │
│  3. NORMALIZE  │  pixels: 0-255 → 0.0-1.0             │
│   Float32List  │  ─────────────────────▶               │
└────────────────┘                                        │
    │                                                      │
    │  [1, 640, 640, 3]                                  │
    ▼                                                      │
┌────────────────┐                                        │
│  4. INFERENCE  │  interpreter.run()                    │
│   TFLite Model │  ─────────────────────▶               │
└────────────────┘                                        │
    │                                                      │
    │  Raw Output: [1, N, 7+]                            │
    ▼                                                      │
┌────────────────┐                                        │
│  5. PARSE      │  Extract boxes, scores                │
│   Detections   │  ─────────────────────▶               │
└────────────────┘                                        │
    │                                                      │
    │  Parsed Data                                        │
    ▼                                                      │
┌────────────────┐                                        │
│  6. FILTER     │  confidence > 0.8                     │
│   High Conf.   │  ─────────────────────▶               │
└────────────────┘                                        │
    │                                                      │
    │  Filtered Detections                               │
    ▼                                                      │
┌────────────────┐                                        │
│  7. SCALE      │  640x640 → original size              │
│   Coordinates  │  ─────────────────────▶               │
└────────────────┘                                        │
    │                                                      │
    │                                                      │
    └──────────────────────────────────────────────────────┘
                                                          │
                                                          ▼
                                              ┌────────────────────┐
                                              │ DetectionResult[]  │
                                              │  - BoundingBox     │
                                              │  - Label (healthy/ │
                                              │    wssv_disease)   │
                                              │  - Confidence      │
                                              └────────────────────┘
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Data Structures                          │
└─────────────────────────────────────────────────────────────────┘

    Uint8List                Float32List           List<List<dynamic>>
   (Image Bytes)            (Preprocessed)         (Model Output)
        │                         │                        │
        │                         │                        │
        ▼                         ▼                        ▼
   ┌─────────┐              ┌─────────┐            ┌──────────────┐
   │ 0xFF... │              │ 0.234...│            │[[0.5,0.3,... │
   │ 0xD8... │  ──────▶     │ 0.891...│  ──────▶   │  0.85, ...]] │
   │  ...    │  preprocess  │  ...    │  inference │              │
   └─────────┘              └─────────┘            └──────────────┘
                                                           │
                                                           │ postprocess
                                                           ▼
                                                  ┌─────────────────┐
                                                  │ DetectionResult │
                                                  ├─────────────────┤
                                                  │ boundingBox:    │
                                                  │  - x: 120.0     │
                                                  │  - y: 85.0      │
                                                  │  - w: 200.0     │
                                                  │  - h: 180.0     │
                                                  │ label: "healthy"│
                                                  │ confidence: 0.92│
                                                  └─────────────────┘
```

## Component Interaction

```
┌──────────────────────────────────────────────────────────────────┐
│                      Component Relationships                      │
└──────────────────────────────────────────────────────────────────┘

  AIService
      │
      ├──▶ Interpreter (TFLite)
      │        │
      │        ├──▶ Model File (.tflite)
      │        └──▶ InterpreterOptions (threads: 4)
      │
      ├──▶ Labels (List<String>)
      │        │
      │        └──▶ Labels File (labels.txt)
      │
      └──▶ Processing Methods
               │
               ├──▶ preprocessImage()
               │        └──▶ Returns: Float32List
               │
               ├──▶ runInference()
               │        └──▶ Returns: List<List<dynamic>>
               │
               └──▶ postProcess()
                        └──▶ Returns: List<DetectionResult>


  DetectionResult
      │
      ├──▶ BoundingBox
      │        ├──▶ x: double
      │        ├──▶ y: double
      │        ├──▶ width: double
      │        └──▶ height: double
      │
      ├──▶ label: String ("healthy" | "wssv_disease")
      └──▶ confidence: double (0.0 - 1.0)
```

## File Structure

```
green_warriors/
│
├── assets/
│   └── models/
│       ├── yolov8n_shrimp.tflite  ◄── AI Model (user adds)
│       ├── labels.txt              ◄── Class labels
│       └── README.md               ◄── Instructions
│
├── lib/
│   ├── main.dart                   ◄── App entry point
│   │
│   ├── services/
│   │   └── ai_service.dart         ◄── Core AI logic
│   │       │
│   │       ├── initialize()        ◄── Load model
│   │       ├── preprocessImage()   ◄── Resize & normalize
│   │       ├── runInference()      ◄── Run model
│   │       ├── postProcess()       ◄── Parse results
│   │       └── detectObjects()     ◄── End-to-end pipeline
│   │
│   ├── models/
│   │   ├── bounding_box.dart       ◄── Box coordinates
│   │   └── detection_result.dart   ◄── Detection data
│   │
│   └── examples/
│       └── ai_service_examples.dart ◄── Usage examples
│
├── test/
│   ├── bounding_box_test.dart      ◄── Unit tests
│   └── detection_result_test.dart
│
├── docs/
│   ├── AI_INTEGRATION.md           ◄── Technical guide
│   └── VIETNAMESE_GUIDE.md         ◄── Vietnamese guide
│
├── pubspec.yaml                    ◄── Dependencies
├── QUICKSTART.md                   ◄── Quick start
└── README.md                       ◄── Main documentation
```

## Execution Timeline

```
Time (ms)    Event                    Description
─────────────────────────────────────────────────────────────
0            App Start                Application launches
│
▼
1000-3000    initialize()             Load model & labels
│            ├─ Load labels.txt      Parse class names
│            ├─ Create interpreter   Configure threads
│            └─ Load .tflite model   Load into memory
│
▼
─────────    Ready                    AI Service initialized
│
│
▼            User Action              Capture/select image
│
▼
0-50         Read Image               Load image bytes
│
▼
100-300      preprocessImage()        Resize & normalize
│            ├─ Decode image         Parse image format
│            ├─ Resize 640x640       Scale down
│            └─ Normalize 0-1        Convert pixels
│
▼
50-200       runInference()           Run TFLite model
│            └─ interpreter.run()    Neural network inference
│
▼
10-50        postProcess()            Parse & filter results
│            ├─ Parse output         Extract detections
│            ├─ Filter confidence    Keep > 80%
│            ├─ Find best class      Determine label
│            └─ Scale coordinates    To original size
│
▼
0            Return Results           List<DetectionResult>
│
▼
─────────    Display                  Show on UI
```

## Memory Layout

```
┌────────────────────────────────────────────────────────────┐
│                       Memory Usage                          │
└────────────────────────────────────────────────────────────┘

Model File (.tflite)      ~5-20 MB    (depends on model size)
Interpreter Instance      ~10-30 MB   (runtime overhead)
Input Tensor             ~4.7 MB      (640*640*3*4 bytes)
Output Tensor            ~varies      (depends on detections)
Image Processing         ~varies      (temporary buffers)

Total Estimated:         ~20-60 MB    (typical usage)
```

## Performance Considerations

```
┌─────────────────────────────────────────────────────────────┐
│                   Optimization Strategies                    │
└─────────────────────────────────────────────────────────────┘

1. Multi-threading
   ├─ Use 4 CPU threads
   └─ Parallel processing for better performance

2. Efficient Preprocessing
   ├─ Linear interpolation (fast)
   └─ Single-pass normalization

3. Confidence Filtering
   ├─ Filter early (confidence > 0.8)
   └─ Reduce unnecessary processing

4. Memory Management
   ├─ Reuse interpreter instance
   ├─ Dispose when done
   └─ Avoid memory leaks

5. Batch Processing
   ├─ Process multiple images efficiently
   └─ Reuse same interpreter
```
