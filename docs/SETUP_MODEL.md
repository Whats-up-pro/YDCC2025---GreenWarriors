# AI Model Setup Guide

This guide provides step-by-step instructions for adding and configuring AI models for the Shrimp Disease Detection System.

## Overview

The system uses PyTorch models for shrimp disease detection. Models should be saved in the `state_dict` format for safe, thread-safe loading without requiring the original model class definition.

## Model Requirements

### Format

- **File Format**: `.pth` (PyTorch model file)
- **Content Format**: State dictionary (state_dict) or checkpoint dictionary
- **Model Output**: 2 classes (Healthy, WSD)
- **Input Size**: 224x224 RGB images
- **Input Normalization**: ImageNet mean/std normalization

### Expected Structure

The model file can be saved in two formats:

**Option 1: State Dictionary Only**
```python
torch.save(model.state_dict(), 'model.pth')
```

**Option 2: Checkpoint Dictionary (Recommended)**
```python
torch.save({
    'state_dict': model.state_dict(),
    'num_classes': 2,
    'model_version': '1.0'
}, 'model.pth')
```

## Adding a Model

### Step 1: Prepare Model File

1. Ensure your model is trained and saved in the correct format
2. Verify the model outputs 2 classes (Healthy=0, WSD=1)
3. Test the model locally before deploying

### Step 2: Place Model File

1. Copy your model file (`.pth`) to `backend/ml_models/`
2. Example: `backend/ml_models/wsd_model_v1.pth`

**Note**: Model files are excluded from git by default (see `.gitignore`). For production, consider:
- Using a model storage service (S3, Azure Blob, etc.)
- Adding models via deployment scripts
- Storing models in a separate repository

### Step 3: Configure Environment Variables

Update your `.env` file:

```env
# AI Model Configuration
MODEL_PATH=ml_models/wsd_model_v1.pth
MODEL_DEVICE=cpu
MODEL_CONFIDENCE_THRESHOLD=0.7
```

**Configuration Options**:
- `MODEL_PATH`: Path to model file (relative to backend directory)
- `MODEL_DEVICE`: `cpu` or `cuda` (use `cuda` if GPU is available)
- `MODEL_CONFIDENCE_THRESHOLD`: Minimum confidence score (0.0-1.0) to trigger n8n workflows

### Step 4: Verify Model Loading

1. Start the backend service:
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   uvicorn main:app --reload
   ```

2. Check backend logs for model loading messages:
   - Success: `Model loaded from ml_models/wsd_model_v1.pth`
   - Error: `Failed to load model: ... Using mock predictions`

3. Test the detection endpoint:
   ```bash
   curl -X POST http://localhost:8000/api/v1/detect \
     -F "file=@test_image.jpg"
   ```

## Model Architecture Compatibility

### Current Implementation

The system includes a placeholder `SimpleClassifier` model architecture in `backend/app/services/ai_service.py`. If your model uses a different architecture, you have two options:

### Option 1: Update Model Architecture (Recommended)

1. Update the model class in `ai_service.py`:

```python
class YourModelClass(nn.Module):
    def __init__(self, num_classes=2):
        super().__init__()
        # Your model architecture here
        self.features = ...
        self.classifier = ...
    
    def forward(self, x):
        # Your forward pass
        return self.classifier(self.features(x))
```

2. Update the `_load_model` method to use your model class:

```python
def _load_model(self):
    # ... existing code ...
    model = YourModelClass(num_classes=num_classes)
    model.load_state_dict(state_dict, strict=False)
    # ... rest of code ...
```

### Option 2: Save Full Model (Not Recommended)

If you save the full model object:

```python
torch.save(model, 'model.pth')
```

You'll need to:
- Ensure the model class is available when loading
- Handle potential compatibility issues
- May not work across different Python/PyTorch versions

## Docker Deployment

### Using Docker Compose

1. Place model file in `backend/ml_models/`
2. The `docker-compose.yml` already mounts this directory:
   ```yaml
   backend:
     volumes:
       - ../backend/ml_models:/app/ml_models
   ```
3. Start services:
   ```bash
   cd deployments
   docker-compose up -d backend
   ```

### Building Docker Image with Model

If you want to include the model in the image (not recommended for large models):

1. Update `backend/Dockerfile`:
   ```dockerfile
   COPY ml_models/ ml_models/
   ```

2. Build and push:
   ```bash
   cd backend
   docker build -t your-registry/shrimp-backend:latest .
   docker push your-registry/shrimp-backend:latest
   ```

## Model Preprocessing

The system applies the following preprocessing to input images:

1. **Resize**: 224x224 pixels
2. **Normalization**: ImageNet statistics
   - Mean: [0.485, 0.456, 0.406]
   - Std: [0.229, 0.224, 0.225]

Ensure your model was trained with the same preprocessing pipeline.

## Testing Your Model

### Unit Test

Create a test script to verify model loading:

```python
# test_model.py
import torch
from app.services.ai_service import AIService
from PIL import Image
import io

# Initialize service
service = AIService()

# Load test image
with open('test_image.jpg', 'rb') as f:
    image_bytes = f.read()

# Make prediction
label, confidence, time = service.predict(image_bytes)
print(f"Label: {label}, Confidence: {confidence:.2f}, Time: {time:.3f}s")
```

### Integration Test

Test the full API endpoint:

```python
# test_api.py
import requests

url = "http://localhost:8000/api/v1/detect"
files = {'file': open('test_image.jpg', 'rb')}
response = requests.post(url, files=files)
print(response.json())
```

## Model Versioning

### Best Practices

1. **Version Naming**: Use semantic versioning (e.g., `wsd_model_v1.0.0.pth`)
2. **Documentation**: Keep a `MODELS.md` file documenting:
   - Model version
   - Training date
   - Accuracy metrics
   - Dataset used
   - Changes from previous version
3. **A/B Testing**: Keep multiple versions for comparison
4. **Rollback**: Maintain previous versions for quick rollback

### Example Model Directory Structure

```
backend/ml_models/
├── wsd_model_v1.0.0.pth
├── wsd_model_v1.1.0.pth
├── wsd_model_v2.0.0.pth
└── MODELS.md
```

## Performance Optimization

### CPU Inference

- Default configuration uses CPU
- Suitable for development and small-scale deployment
- Response time: ~200-500ms per image

### GPU Inference

For better performance, use GPU:

1. Install CUDA-enabled PyTorch:
   ```bash
   pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
   ```

2. Update `.env`:
   ```env
   MODEL_DEVICE=cuda
   ```

3. Ensure GPU is available:
   ```python
   import torch
   print(torch.cuda.is_available())  # Should return True
   ```

### Model Optimization

Consider these optimizations:

1. **Quantization**: Reduce model size and speed up inference
   ```python
   model_quantized = torch.quantization.quantize_dynamic(
       model, {torch.nn.Linear}, dtype=torch.qint8
   )
   ```

2. **ONNX Export**: Convert to ONNX for faster inference
   ```python
   torch.onnx.export(model, dummy_input, "model.onnx")
   ```

3. **TensorRT**: For NVIDIA GPUs, use TensorRT for maximum performance

## Troubleshooting

### Model Not Loading

**Error**: `Failed to load model: ... Using mock predictions`

**Solutions**:
1. Check file path is correct
2. Verify file exists: `ls backend/ml_models/`
3. Check file format (must be `.pth`)
4. Verify state_dict structure
5. Check PyTorch version compatibility

### Architecture Mismatch

**Error**: `Missing key(s) in state_dict` or `Unexpected key(s) in state_dict`

**Solutions**:
1. Use `strict=False` when loading (already implemented)
2. Check model architecture matches saved state_dict
3. Verify number of classes matches

### Out of Memory

**Error**: `CUDA out of memory` or system slowdown

**Solutions**:
1. Use CPU instead of GPU: `MODEL_DEVICE=cpu`
2. Reduce batch size (currently 1)
3. Use model quantization
4. Upgrade hardware

### Slow Inference

**Solutions**:
1. Use GPU instead of CPU
2. Optimize model (quantization, pruning)
3. Use ONNX runtime
4. Consider model compression

## Security Considerations

1. **Model Files**: Keep model files secure, don't commit to public repos
2. **Model Validation**: Validate input images to prevent adversarial attacks
3. **Rate Limiting**: Implement rate limiting on detection endpoint
4. **Model Updates**: Plan for secure model updates in production

## Next Steps

After adding your model:

1. Test model loading and inference
2. Verify detection accuracy with test images
3. Monitor performance metrics
4. Set up model versioning strategy
5. Configure production deployment
6. Set up monitoring and alerts

## References

- [PyTorch Model Saving](https://pytorch.org/tutorials/beginner/saving_loading_models.html)
- [State Dict Documentation](https://pytorch.org/docs/stable/generated/torch.nn.Module.html#torch.nn.Module.state_dict)
- [Model Optimization](https://pytorch.org/tutorials/recipes/recipes/tuning_guide.html)
