# 📱 Offline-First Architecture Implementation Plan

## Mục tiêu
Chuyển đổi app từ kiến trúc server-side AI inference sang **Offline-First** với:
- AI model chạy trực tiếp trên browser (TensorFlow.js)
- Hoạt động không cần kết nối mạng
- Đồng bộ dữ liệu khi online

---

## Kiến trúc mục tiêu

```
┌─────────────────────────────────────┐
│   PWA (Progressive Web App)         │
│   - Install to home screen          │
│   - Full screen mode                │
│   - Native-like experience          │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   OFFLINE FIRST ARCHITECTURE        │
├─────────────────────────────────────┤
│ Frontend (React + TensorFlow.js)    │
│  ├─ Camera API (native camera)      │
│  ├─ AI Model (local inference)      │
│  ├─ IndexedDB (local storage)       │
│  └─ Service Worker (offline cache)  │
└─────────────────────────────────────┘
              ↕ (sync when online)
┌─────────────────────────────────────┐
│   Backend (FastAPI + PostgreSQL)    │
│  ├─ Data aggregation                │
│  ├─ Model updates                   │
│  ├─ Analytics & Reports             │
│  └─ n8n (notifications, workflows)  │
└─────────────────────────────────────┘
```

---

## Phase 1: Chuẩn bị AI Model cho TensorFlow.js

### Task 1.1: Export PyTorch model sang ONNX/TensorFlow
- [ ] Train hoặc lấy model PyTorch đã có
- [ ] Export sang ONNX format: `torch.onnx.export()`
- [ ] Convert ONNX → TensorFlow SavedModel
- [ ] Convert SavedModel → TensorFlow.js (tfjs_graph_model)

**Commands:**
```bash
# Install conversion tools
pip install tf2onnx tensorflow tensorflowjs

# Convert ONNX to TensorFlow
python -m tf2onnx.convert --saved-model ./saved_model --output model.onnx

# Convert to TensorFlow.js
tensorflowjs_converter --input_format=tf_saved_model ./saved_model ./tfjs_model
```

### Task 1.2: Optimize model cho mobile
- [ ] Quantize model (reduce size từ ~100MB → ~5-10MB)
- [ ] Test performance trên mobile devices

---

## Phase 2: Tích hợp TensorFlow.js vào Frontend

### Task 2.1: Install dependencies
```bash
cd frontend
npm install @tensorflow/tfjs @tensorflow/tfjs-backend-webgl
```

### Task 2.2: Tạo AI inference service
**File: `frontend/src/services/aiService.ts`**

```typescript
import * as tf from '@tensorflow/tfjs';

class AIService {
  private model: tf.GraphModel | null = null;
  private isLoading = false;

  async loadModel(): Promise<void> {
    if (this.model || this.isLoading) return;
    
    this.isLoading = true;
    try {
      // Load model từ IndexedDB cache hoặc từ URL
      this.model = await tf.loadGraphModel('/models/shrimp_model/model.json');
      console.log('AI Model loaded successfully');
    } catch (error) {
      console.error('Failed to load model:', error);
    }
    this.isLoading = false;
  }

  async predict(imageElement: HTMLImageElement): Promise<{
    label: 'Healthy' | 'WSD';
    confidence: number;
  }> {
    if (!this.model) {
      await this.loadModel();
    }

    // Preprocess image
    const tensor = tf.browser.fromPixels(imageElement)
      .resizeBilinear([224, 224])
      .toFloat()
      .div(255.0)
      .expandDims(0);

    // Run inference
    const predictions = this.model!.predict(tensor) as tf.Tensor;
    const data = await predictions.data();
    
    // Cleanup
    tensor.dispose();
    predictions.dispose();

    // Interpret results
    const confidence = data[1]; // Assuming [healthy_prob, wsd_prob]
    return {
      label: confidence > 0.5 ? 'WSD' : 'Healthy',
      confidence: confidence > 0.5 ? confidence : 1 - confidence
    };
  }
}

export const aiService = new AIService();
```

### Task 2.3: Update Camera component để dùng local AI
**File: `frontend/src/components/CameraScanner.tsx`**

```typescript
import { aiService } from '../services/aiService';

// Thay vì gọi backend:
// const result = await api.detectDisease(imageFile);

// Gọi local AI:
const imageElement = new Image();
imageElement.src = URL.createObjectURL(imageFile);
await imageElement.decode();
const result = await aiService.predict(imageElement);
```

---

## Phase 3: Implement IndexedDB cho Local Storage

### Task 3.1: Install Dexie.js (IndexedDB wrapper)
```bash
npm install dexie
```

### Task 3.2: Tạo database schema
**File: `frontend/src/db/database.ts`**

```typescript
import Dexie, { Table } from 'dexie';

export interface DetectionRecord {
  id?: number;
  timestamp: Date;
  imageBlob: Blob;
  label: 'Healthy' | 'WSD';
  confidence: number;
  synced: boolean;
}

export class ShrimpDatabase extends Dexie {
  detections!: Table<DetectionRecord>;

  constructor() {
    super('ShrimpDiseaseDB');
    this.version(1).stores({
      detections: '++id, timestamp, synced'
    });
  }
}

export const db = new ShrimpDatabase();
```

### Task 3.3: Implement data sync service
**File: `frontend/src/services/syncService.ts`**

```typescript
import { db, DetectionRecord } from '../db/database';

export async function syncPendingRecords(): Promise<void> {
  if (!navigator.onLine) return;

  const pendingRecords = await db.detections
    .where('synced')
    .equals(false)
    .toArray();

  for (const record of pendingRecords) {
    try {
      const formData = new FormData();
      formData.append('image', record.imageBlob);
      formData.append('label', record.label);
      formData.append('confidence', record.confidence.toString());
      formData.append('timestamp', record.timestamp.toISOString());

      await fetch('/api/v1/sync', {
        method: 'POST',
        body: formData
      });

      await db.detections.update(record.id!, { synced: true });
    } catch (error) {
      console.error('Sync failed for record:', record.id);
    }
  }
}

// Auto-sync khi có mạng
window.addEventListener('online', syncPendingRecords);
```

---

## Phase 4: Enhance Service Worker for Offline Cache

### Task 4.1: Update vite.config.ts để cache AI model
```typescript
VitePWA({
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
    runtimeCaching: [
      {
        urlPattern: /\/models\/.*\.json$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'ai-model-cache',
          expiration: {
            maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
          }
        }
      },
      {
        urlPattern: /\/models\/.*\.bin$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'ai-model-weights-cache',
          expiration: {
            maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
          }
        }
      }
    ]
  }
})
```

---

## Phase 5: Backend API Updates

### Task 5.1: Add sync endpoint
**File: `backend/app/api/v1/sync.py`**

```python
from fastapi import APIRouter, UploadFile, Form
from datetime import datetime

router = APIRouter()

@router.post("/sync")
async def sync_detection(
    image: UploadFile,
    label: str = Form(...),
    confidence: float = Form(...),
    timestamp: datetime = Form(...)
):
    # Save to database
    # Aggregate analytics
    # Trigger n8n notifications if needed
    return {"status": "synced"}
```

### Task 5.2: Add model update endpoint
```python
@router.get("/model/version")
async def get_model_version():
    return {"version": "1.0.0", "url": "/models/shrimp_model.zip"}
```

---

## Timeline ước tính

| Phase | Thời gian | Mô tả |
|-------|-----------|-------|
| Phase 1 | 2-3 ngày | Chuẩn bị và convert AI model |
| Phase 2 | 2-3 ngày | Tích hợp TensorFlow.js |
| Phase 3 | 1-2 ngày | IndexedDB local storage |
| Phase 4 | 1 ngày | Service Worker updates |
| Phase 5 | 1-2 ngày | Backend sync API |
| Testing | 2-3 ngày | Testing trên các devices |

**Tổng: ~10-14 ngày**

---

## Các file cần tạo/sửa

### Frontend (Tạo mới)
- [ ] `src/services/aiService.ts` - TensorFlow.js inference
- [ ] `src/db/database.ts` - IndexedDB schema
- [ ] `src/services/syncService.ts` - Data sync logic
- [ ] `public/models/` - TensorFlow.js model files

### Frontend (Sửa)
- [ ] `src/components/CameraScanner.tsx` - Use local AI
- [ ] `vite.config.ts` - Cache AI model files
- [ ] `package.json` - Add TensorFlow.js dependencies

### Backend (Tạo mới)
- [ ] `app/api/v1/sync.py` - Sync endpoint
- [ ] `app/api/v1/model.py` - Model versioning

---

## Notes

1. **Model size**: TensorFlow.js model sau khi quantize thường ~5-20MB, có thể cache trong Service Worker
2. **First load**: Lần đầu cần mạng để tải model, sau đó hoạt động offline
3. **Fallback**: Nếu có mạng và model local fail, fallback về server-side inference
4. **Battery**: WebGL inference có thể tốn pin, cần optimize
