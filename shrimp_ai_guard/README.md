# Shrimp AI Guard

AI-powered shrimp monitoring application built with Flutter.

## Features

- Camera integration for capturing images
- TensorFlow Lite for on-device AI inference
- Image processing capabilities
- Local database for offline storage
- Network connectivity detection
- Server synchronization

## Getting Started

### Prerequisites

- Flutter SDK (>=3.0.0)
- Visual Studio Code or Android Studio
- Android SDK / iOS development tools

### Installation

1. Install dependencies:
```bash
flutter pub get
```

2. Run the app:
```bash
flutter run
```

## Dependencies

- **camera**: Camera access for capturing shrimp images
- **tflite_flutter**: TensorFlow Lite for AI model inference
- **image**: Image processing (resize, crop) before AI analysis
- **sqflite**: Local SQLite database for offline data storage
- **path_provider**: File system path utilities
- **connectivity_plus**: Network connectivity status monitoring
- **dio**: HTTP client for server communication

## Project Structure

```
shrimp_ai_guard/
├── lib/
│   └── main.dart
├── test/
├── android/
├── ios/
├── web/
├── linux/
├── macos/
├── windows/
└── pubspec.yaml
```
