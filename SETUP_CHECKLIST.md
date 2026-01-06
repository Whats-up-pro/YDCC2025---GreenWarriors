# Setup Checklist ✅

Follow this checklist to set up and use the AI model integration in your shrimp disease detection app.

## 📋 Pre-requisites

- [ ] Flutter SDK installed (version 3.0.0 or higher)
- [ ] Android Studio or VS Code with Flutter extensions
- [ ] A trained YOLOv8 model for shrimp disease detection (.tflite format)
- [ ] Basic understanding of Flutter and Dart

## 🚀 Setup Steps

### 1. Project Setup
- [ ] Clone or download this repository
- [ ] Open terminal in project directory
- [ ] Run `flutter doctor` to verify Flutter installation
- [ ] Run `flutter pub get` to install dependencies

### 2. Model Preparation
- [ ] Locate your trained YOLOv8 model file (`.tflite` format)
- [ ] Copy the model file to `assets/models/yolov8n_shrimp.tflite`
- [ ] Verify the file size is reasonable (typically 5-20 MB)
- [ ] If your model has a different name, update `MODEL_PATH` in `lib/services/ai_service.dart`

### 3. Labels Configuration
- [ ] Open `assets/models/labels.txt`
- [ ] Verify it contains your disease classes (one per line):
  ```
  healthy
  wssv_disease
  ```
- [ ] Ensure the order matches your model's output classes
- [ ] Add or remove classes as needed for your specific model

### 4. Verify Asset Declaration
- [ ] Open `pubspec.yaml`
- [ ] Confirm assets are declared under `flutter:` section:
  ```yaml
  flutter:
    assets:
      - assets/models/
      - assets/models/labels.txt
  ```
- [ ] Run `flutter pub get` again if you made changes

### 5. Build and Test
- [ ] Connect a physical device or start an emulator
- [ ] Run `flutter clean` to clear any cached builds
- [ ] Run `flutter run` to build and launch the app
- [ ] Wait for app to load (first build may take 2-5 minutes)
- [ ] Check console for "AI Service initialized successfully"

### 6. Verify Model Loading
- [ ] App should show a green checkmark ✅
- [ ] Status message should say "AI Service initialized successfully"
- [ ] Check console logs for:
  ```
  Loading AI model...
  Loaded 2 labels: [healthy, wssv_disease]
  Model loaded successfully
  ```
- [ ] If there are errors, see Troubleshooting section below

## 🧪 Testing

### Basic Functionality Test
- [ ] App launches without crashes
- [ ] AI service initializes within 3 seconds
- [ ] No error messages in console
- [ ] UI shows initialization status

### Integration Test (Optional)
- [ ] Add camera integration (see `lib/examples/ai_service_examples.dart`)
- [ ] Test with sample shrimp images
- [ ] Verify detections appear with correct labels
- [ ] Check bounding boxes are properly positioned
- [ ] Confirm confidence scores are > 80%

## 📱 Device Testing

Test on multiple devices/configurations:

- [ ] Android device (physical)
- [ ] Android emulator
- [ ] iOS device (if available)
- [ ] iOS simulator (if available)
- [ ] Low-end device (to check performance)
- [ ] High-end device (to verify optimal performance)

## 🎯 Next Steps

After successful setup:

### Immediate
- [ ] Read `QUICKSTART.md` for usage examples
- [ ] Review `lib/examples/ai_service_examples.dart` for integration patterns
- [ ] Test with your own shrimp images

### Short-term
- [ ] Integrate camera functionality
- [ ] Add gallery image picker
- [ ] Implement UI for displaying results
- [ ] Add bounding box visualization

### Long-term
- [ ] Optimize performance for your target devices
- [ ] Add result history/database
- [ ] Implement sharing functionality
- [ ] Add multi-language support
- [ ] Create user onboarding

## 🐛 Troubleshooting

### Model Not Loading

**Symptoms**: App crashes on startup or shows "Failed to initialize"

**Solutions**:
- [ ] Verify model file exists: `assets/models/yolov8n_shrimp.tflite`
- [ ] Check file size is > 0 bytes
- [ ] Ensure file is valid TFLite format
- [ ] Run `flutter clean && flutter pub get`
- [ ] Rebuild app: `flutter run`

**Check**:
```bash
ls -lh assets/models/yolov8n_shrimp.tflite
```

### Dependencies Not Installing

**Symptoms**: Build fails with package errors

**Solutions**:
- [ ] Delete `pubspec.lock`
- [ ] Run `flutter clean`
- [ ] Run `flutter pub get`
- [ ] Check internet connection
- [ ] Verify Flutter version: `flutter --version`

### Labels Mismatch

**Symptoms**: Wrong disease names in results

**Solutions**:
- [ ] Open `assets/models/labels.txt`
- [ ] Verify class names match your model
- [ ] Ensure correct order (matches training)
- [ ] No empty lines or extra spaces
- [ ] Each class on separate line

### Performance Issues

**Symptoms**: App slow or laggy

**Solutions**:
- [ ] Run in release mode: `flutter run --release`
- [ ] Reduce CPU threads to 2 in `ai_service.dart`
- [ ] Test on different device
- [ ] Check device specifications

### No Detections Found

**Symptoms**: Always returns empty list

**Solutions**:
- [ ] Lower confidence threshold to 0.5
- [ ] Verify image quality (not blurry)
- [ ] Ensure image contains shrimp
- [ ] Check lighting conditions
- [ ] Test with different images

## 📞 Getting Help

If you're stuck:

1. **Check Documentation**
   - [ ] Read `README.md`
   - [ ] Review `docs/AI_INTEGRATION.md`
   - [ ] See `docs/VIETNAMESE_GUIDE.md` (if Vietnamese)
   - [ ] Check `docs/VISUAL_GUIDE.md` for workflow

2. **Review Examples**
   - [ ] Look at `lib/examples/ai_service_examples.dart`
   - [ ] Check code comments in `lib/services/ai_service.dart`

3. **Debug**
   - [ ] Check console output for error messages
   - [ ] Add debug prints to trace execution
   - [ ] Use Flutter DevTools for profiling

4. **Contact Support**
   - [ ] Create issue on GitHub
   - [ ] Contact Green Warriors team
   - [ ] Provide error logs and screenshots

## ✅ Verification Checklist

Before considering setup complete:

- [ ] App builds without errors
- [ ] AI service initializes successfully
- [ ] Model loads in < 3 seconds
- [ ] No console errors during initialization
- [ ] Can run detection on sample image
- [ ] Results contain expected labels
- [ ] Confidence scores are reasonable (> 80%)
- [ ] Bounding boxes are properly scaled
- [ ] Performance is acceptable (< 1 second per detection)
- [ ] App runs on target devices

## 🎉 Success Criteria

You're ready to proceed when:

✅ All setup steps completed
✅ All tests passing
✅ App runs on target device
✅ Model loads successfully
✅ Sample detections work correctly
✅ Documentation reviewed and understood

## 📚 Reference

- **Quick Start**: `QUICKSTART.md`
- **Technical Guide**: `docs/AI_INTEGRATION.md`
- **Architecture**: `docs/ARCHITECTURE.md`
- **Vietnamese**: `docs/VIETNAMESE_GUIDE.md`
- **Visual Guide**: `docs/VISUAL_GUIDE.md`
- **Examples**: `lib/examples/ai_service_examples.dart`

---

**Need Help?** Check the troubleshooting section above or review the documentation files.

**Ready to Code?** Start with `QUICKSTART.md` for usage examples!
