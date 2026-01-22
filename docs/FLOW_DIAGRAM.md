# 🔄 SƠ ĐỒ LUỒNG HOẠT ĐỘNG - TOMI AI DETECTION SYSTEM

**Cập nhật:** 2026-01-22  
**Phiên bản:** 2.0  
**Mục đích:** Làm rõ luồng hoạt động của toàn bộ hệ thống từ Frontend → Backend → AI Model → Database → n8n

---

## 📋 MỤC LỤC
1. [Tổng quan kiến trúc hệ thống](#1-tổng-quan-kiến-trúc-hệ-thống)
2. [Luồng phát hiện bệnh (Detection Flow)](#2-luồng-phát-hiện-bệnh-detection-flow)
3. [Luồng tư vấn AI (Chat Flow)](#3-luồng-tư-vấn-ai-chat-flow)
4. [Luồng đồng bộ dữ liệu (Sync Flow)](#4-luồng-đồng-bộ-dữ liệu-sync-flow)
5. [Luồng xử lý lỗi (Error Handling)](#5-luồng-xử-lý-lỗi-error-handling)
6. [Chi tiết kỹ thuật](#6-chi-tiết-kỹ-thuật)

---

## 1. TỔNG QUAN KIẾN TRÚC HẾ THỐNG

```
┌─────────────────────────────────────────────────────────────────────┐
│                         TOMI SYSTEM ARCHITECTURE                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐     │
│  │   Frontend   │      │   Backend    │      │  PostgreSQL  │     │
│  │              │      │              │      │              │     │
│  │  React PWA   │◄────►│   FastAPI    │◄────►│   Database   │     │
│  │  TypeScript  │      │   Python     │      │              │     │
│  │  Vite        │      │              │      │              │     │
│  └──────────────┘      └──────┬───────┘      └──────────────┘     │
│         │                      │                                    │
│         │              ┌───────▼───────┐                           │
│         │              │   AI Service   │                           │
│         │              │                │                           │
│         │              │ ResNet+CBAM    │                           │
│         │              │ PyTorch Model  │                           │
│         │              └───────┬────────┘                           │
│         │                      │                                    │
│         │              ┌───────▼────────┐                           │
│         └─────────────►│      n8n       │                           │
│                        │                │                           │
│                        │  Workflow      │                           │
│                        │  Automation    │                           │
│                        └────────────────┘                           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Các thành phần chính:

| Thành phần | Công nghệ | Vai trò |
|------------|-----------|---------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS | Giao diện người dùng (PWA), xử lý ảnh client-side |
| **Backend** | FastAPI, Python 3.10+, PyTorch | API Gateway, AI Inference, Authentication |
| **Database** | PostgreSQL | Lưu trữ logs, users, knowledge base |
| **AI Model** | ResNet101 + CBAM | Phát hiện bệnh tôm qua hình ảnh |
| **n8n** | n8n workflow | Automation, logging, notifications |

---

## 2. LUỒNG PHÁT HIỆN BỆNH (DETECTION FLOW)

### 2.1. Sơ đồ tổng quan

```
┌─────────┐      ┌─────────┐      ┌─────────┐      ┌─────────┐      ┌─────────┐
│ User    │      │Frontend │      │Backend  │      │AI Model │      │Database │
│         │      │         │      │         │      │         │      │         │
└────┬────┘      └────┬────┘      └────┬────┘      └────┬────┘      └────┬────┘
     │                │                │                │                │
     │ 1. Chụp ảnh   │                │                │                │
     │───────────────►│                │                │                │
     │                │                │                │                │
     │                │ 2. Nén & resize│                │                │
     │                │   (client-side)│                │                │
     │                │                │                │                │
     │                │ 3. POST /detect│                │                │
     │                │   + API Key    │                │                │
     │                │───────────────►│                │                │
     │                │                │                │                │
     │                │                │ 4. Validate    │                │
     │                │                │   - API Key    │                │
     │                │                │   - Rate limit │                │
     │                │                │   - File type  │                │
     │                │                │   - File size  │                │
     │                │                │   - Magic bytes│                │
     │                │                │                │                │
     │                │                │ 5. AI Inference│                │
     │                │                │───────────────►│                │
     │                │                │                │                │
     │                │                │                │ 6. Preprocess  │
     │                │                │                │   - Resize 224x224
     │                │                │                │   - Normalize  │
     │                │                │                │   - To tensor  │
     │                │                │                │                │
     │                │                │◄───────────────│ 7. Predict     │
     │                │                │  label + conf  │   - Forward pass
     │                │                │                │   - Softmax    │
     │                │                │                │   - Return max │
     │                │                │                │                │
     │                │                │ 8. Save to DB  │                │
     │                │                │───────────────────────────────►│
     │                │                │                │                │
     │                │ 9. Return JSON │                │                │
     │                │◄───────────────│                │                │
     │                │  {label, conf, │                │                │
     │                │   inference_ms}│                │                │
     │                │                │                │                │
     │ 10. Hiển thị   │                │                │                │
     │   kết quả      │                │                │                │
     │◄───────────────│                │                │                │
     │                │                │                │                │
     │                │                │ 11. Webhook n8n│                │
     │                │                │   (Background) │                │
     │                │                │──────────────► n8n              │
     │                │                │                │                │
```

### 2.2. Chi tiết từng bước

#### **Bước 1-2: Chụp ảnh & Xử lý client-side**
- User mở tab "Chụp ảnh" trong PWA
- Chọn camera hoặc upload file
- Frontend tự động:
  - Nén ảnh để giảm bandwidth
  - Resize về kích thước tối ưu
  - Kiểm tra định dạng (JPEG/PNG)
  - Hiển thị preview

**File:** [frontend/src/components/CameraScanner.tsx](frontend/src/components/CameraScanner.tsx)

#### **Bước 3: Gửi request lên Backend**
```http
POST /api/v1/detect
Headers:
  X-API-Key: <api_key>
  Content-Type: multipart/form-data
Body:
  file: <image_bytes>
```

**File:** [frontend/src/services/api.ts](frontend/src/services/api.ts)

#### **Bước 4: Validation 4 lớp**
Backend thực hiện validation theo thứ tự:

1. **API Key Authentication**
   - Kiểm tra header `X-API-Key`
   - So sánh với `API_KEY` trong `.env`
   - Trả về 401 nếu sai

2. **Rate Limiting**
   - Giới hạn: 10 requests/phút per IP
   - Sử dụng `slowapi` library
   - Trả về 429 nếu vượt quota

3. **File Type & Size Validation**
   - Content-Type: `image/jpeg` hoặc `image/png`
   - Extension: `.jpg`, `.jpeg`, `.png`
   - Max size: 10MB
   - Trả về 400 nếu không hợp lệ

4. **Magic Bytes Validation**
   - JPEG: `FF D8 FF`
   - PNG: `89 50 4E 47`
   - Kiểm tra 4 bytes đầu tiên của file
   - Chống file giả mạo extension

**File:** [backend/app/api/v1/detect.py](backend/app/api/v1/detect.py)

#### **Bước 5-7: AI Inference**
AI Service xử lý:

1. **Preprocess Image**
   ```python
   - Resize to 224x224 pixels
   - Convert to RGB tensor
   - Normalize: mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]
   - Move to device (CPU/GPU)
   ```

2. **Forward Pass**
   ```python
   with torch.inference_mode():
       logits = model(image_tensor)
       probs = F.softmax(logits, dim=1)
       confidence, predicted_class = torch.max(probs, dim=1)
   ```

3. **Return Result**
   - `label`: "Healthy" hoặc "WSSV" (White Spot Syndrome Virus)
   - `confidence`: 0.0 - 1.0 (độ tin cậy)
   - `inference_time_ms`: thời gian inference (ms)

**File:** [backend/app/services/ai_service.py](backend/app/services/ai_service.py)

**Model:** [backend/app/models/resnet_cbam.py](backend/app/models/resnet_cbam.py)

#### **Bước 8: Lưu vào Database**
Tạo record mới trong bảng `detection_logs`:

```sql
INSERT INTO detection_logs (
    user_id,
    image_path,
    label,
    confidence,
    inference_time_ms,
    created_at
) VALUES (?, ?, ?, ?, ?, NOW())
```

**File:** [backend/app/models/database.py](backend/app/models/database.py)

#### **Bước 9-10: Trả về Frontend**
Response JSON:
```json
{
  "success": true,
  "data": {
    "label": "WSSV",
    "confidence": 0.923,
    "inference_time_ms": 145.3,
    "detection_id": "uuid-xxxxx"
  }
}
```

Frontend hiển thị:
- Badge màu đỏ/xanh theo kết quả
- Phần trăm tin cậy
- Thời gian phân tích
- Khuyến nghị hành động

#### **Bước 11: Background Webhook (Cold Path)**
Backend gửi webhook tới n8n KHÔNG đồng bộ (không block response):

```python
# Chạy trong BackgroundTasks
await n8n_client.send_detection_webhook({
    "detection_id": detection_id,
    "label": label,
    "confidence": confidence,
    "timestamp": datetime.now().isoformat()
})
```

n8n workflow xử lý:
- Kiểm tra điều kiện cảnh báo (confidence > 0.8 && label == "WSSV")
- Gửi notification (SMS/Email) cho farmer
- Log vào hệ thống giám sát
- Tích hợp với hệ thống khác

**File:** [backend/app/services/n8n_client.py](backend/app/services/n8n_client.py)

---

## 3. LUỒNG TƯ VẤN AI (CHAT FLOW)

### 3.1. Sơ đồ tổng quan

```
┌─────────┐    ┌──────────┐    ┌──────────┐    ┌───────────┐    ┌──────────┐
│  User   │    │ Frontend │    │ Backend  │    │Google AI  │    │Knowledge │
│         │    │          │    │          │    │(Gemini)   │    │   Base   │
└────┬────┘    └────┬─────┘    └────┬─────┘    └─────┬─────┘    └────┬─────┘
     │              │               │                 │                │
     │ 1. Nhập câu │               │                 │                │
     │    hỏi      │               │                 │                │
     │─────────────►│               │                 │                │
     │              │               │                 │                │
     │              │ 2. POST /chat │                 │                │
     │              │──────────────►│                 │                │
     │              │               │                 │                │
     │              │               │ 3. Search KB    │                │
     │              │               │─────────────────────────────────►│
     │              │               │                 │                │
     │              │               │◄────────────────────────────────│
     │              │               │  Relevant docs  │                │
     │              │               │                 │                │
     │              │               │ 4. Call Gemini  │                │
     │              │               │    + context    │                │
     │              │               │────────────────►│                │
     │              │               │                 │                │
     │              │               │◄────────────────│ 5. AI Response │
     │              │               │   Generated answer               │
     │              │               │                 │                │
     │              │ 6. Return JSON│                 │                │
     │              │◄──────────────│                 │                │
     │              │               │                 │                │
     │ 7. Hiển thị  │               │                 │                │
     │    câu trả lời               │                 │                │
     │◄─────────────│               │                 │                │
     │              │               │                 │                │
```

### 3.2. Chi tiết từng bước

#### **Bước 1-2: User gửi câu hỏi**
```http
POST /api/v1/chat
Headers:
  X-API-Key: <api_key>
Body:
  {
    "message": "Tôm bị đốm trắng phải xử lý như thế nào?",
    "session_id": "uuid-xxxx"
  }
```

**Rate Limit:** 20 requests/phút per IP

#### **Bước 3: Tìm kiếm Knowledge Base**
Backend tìm kiếm trong bảng `knowledge_base`:

```sql
SELECT title, content, category
FROM knowledge_base
WHERE is_active = true
  AND (title ILIKE '%đốm trắng%' OR content ILIKE '%đốm trắng%')
ORDER BY created_at DESC
LIMIT 3
```

Kết quả:
- 3 bài viết liên quan nhất
- Cung cấp context cho AI

#### **Bước 4-5: Gọi Google AI (Gemini)**
Nếu có `GEMINI_API_KEY`:

```python
# Tạo prompt với context
system_prompt = """
Bạn là chuyên gia nuôi tôm, chuyên về bệnh đốm trắng (WSD).
Dựa vào kiến thức sau để trả lời:
{knowledge_base_context}
"""

# Gọi Gemini API
response = client.models.generate_content(
    model='gemini-2.0-flash-exp',
    contents=system_prompt + "\n\nCâu hỏi: " + user_message
)

answer = response.text
```

Nếu KHÔNG có API key → Fallback về generic response

**File:** [backend/app/api/v1/chat.py](backend/app/api/v1/chat.py)

#### **Bước 6-7: Trả về Frontend**
Response:
```json
{
  "success": true,
  "data": {
    "message": "Khi phát hiện tôm bị đốm trắng, bạn cần...",
    "sources": [
      {"title": "Xử lý bệnh đốm trắng", "category": "disease"},
      {"title": "Phòng bệnh cho tôm", "category": "prevention"}
    ],
    "timestamp": "2026-01-22T10:30:00Z"
  }
}
```

Frontend hiển thị:
- Message trong bubble chat
- Badge "AI-powered" hoặc "Knowledge Base"
- Links tới sources
- Copy button

**File:** [frontend/src/components/ChatUI.tsx](frontend/src/components/ChatUI.tsx)

---

## 4. LUỒNG ĐỒNG BỘ DỮ LIỆU (SYNC FLOW)

### 4.1. Offline-First Strategy

```
┌──────────────────────────────────────────────────────────────────┐
│                     OFFLINE-FIRST ARCHITECTURE                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  User Action  ─►  IndexedDB (Local)  ─►  Sync Service  ─►  API  │
│                        │                      │                   │
│                        │                      │                   │
│                   Immediate Save         Auto Sync (Online)       │
│                   (Offline-safe)         Every 30s                │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2. Sơ đồ Sync Process

```
┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│  Action  │      │ IndexedDB│      │  Sync    │      │ Backend  │
│          │      │          │      │ Service  │      │          │
└────┬─────┘      └────┬─────┘      └────┬─────┘      └────┬─────┘
     │                 │                  │                  │
     │ 1. Detect/Chat │                  │                  │
     │────────────────►│                  │                  │
     │                 │ Save immediately │                  │
     │                 │                  │                  │
     │◄────────────────│                  │                  │
     │   Local ID      │                  │                  │
     │                 │                  │                  │
     │                 │ 2. Auto Sync     │                  │
     │                 │   (every 30s)    │                  │
     │                 │─────────────────►│                  │
     │                 │                  │                  │
     │                 │                  │ 3. Get unsync   │
     │                 │                  │    records      │
     │                 │                  │◄─────────────   │
     │                 │                  │                  │
     │                 │                  │ 4. POST /sync   │
     │                 │                  │─────────────────►│
     │                 │                  │                  │
     │                 │                  │◄─────────────────│
     │                 │                  │  Server IDs      │
     │                 │                  │                  │
     │                 │ 5. Update local  │                  │
     │                 │◄─────────────────│                  │
     │                 │   Mark synced    │                  │
     │                 │                  │                  │
```

### 4.3. Chi tiết kỹ thuật

#### **Local Database Schema (IndexedDB)**
```typescript
// database.ts
export const db = new Dexie('tomi-db');

db.version(1).stores({
  detections: '++id, serverId, createdAt, synced',
  chats: '++id, serverId, sessionId, createdAt, synced',
  settings: 'key'
});
```

#### **Sync Logic**
```typescript
// syncService.ts
class SyncService {
  async syncDetections() {
    // 1. Lấy records chưa sync
    const unsynced = await db.detections
      .where('synced').equals(0)
      .toArray();
    
    if (unsynced.length === 0) return;
    
    // 2. Gửi lên server
    const response = await api.post('/sync', { detections: unsynced });
    
    // 3. Cập nhật local với server IDs
    for (const item of response.data) {
      await db.detections.update(item.localId, {
        serverId: item.serverId,
        synced: 1
      });
    }
  }
  
  // Auto sync every 30 seconds when online
  startAutoSync() {
    this.interval = setInterval(() => {
      if (navigator.onLine) {
        this.syncDetections();
        this.syncChats();
      }
    }, 30000);
  }
}
```

**Files:**
- [frontend/src/db/database.ts](frontend/src/db/database.ts)
- [frontend/src/services/syncService.ts](frontend/src/services/syncService.ts)

---

## 5. LUỒNG XỬ LÝ LỖI (ERROR HANDLING)

### 5.1. Error Boundary Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                      ERROR HANDLING LAYERS                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Layer 1: React Error Boundary (UI Crashes)                     │
│     └─► Catch render errors, show fallback UI                   │
│                                                                  │
│  Layer 2: API Error Handler (Network/Server Errors)             │
│     └─► Catch HTTP errors, retry logic, user-friendly messages  │
│                                                                  │
│  Layer 3: Service Worker (Offline Handling)                     │
│     └─► Cache-first strategy, offline fallback                  │
│                                                                  │
│  Layer 4: Backend Exception Handler (Server Errors)             │
│     └─► Catch Python exceptions, log, return structured errors  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2. Frontend Error Flow

```typescript
// ErrorBoundary.tsx
class ErrorBoundary extends React.Component {
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Caught error:', error, errorInfo);
    // Log to monitoring service
    // Show user-friendly error UI
  }
}

// API Error Handler
async function apiCall(endpoint: string) {
  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    // Network error
    if (error instanceof TypeError) {
      return { error: 'Không có kết nối mạng' };
    }
    // Server error
    if (error.message.includes('500')) {
      return { error: 'Lỗi server, vui lòng thử lại' };
    }
    // Unknown error
    return { error: 'Có lỗi xảy ra' };
  }
}
```

**File:** [frontend/src/components/ErrorBoundary.tsx](frontend/src/components/ErrorBoundary.tsx)

### 5.3. Backend Error Flow

```python
# FastAPI exception handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    logger.error(f"HTTP {exc.status_code}: {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": false,
            "error": {
                "code": exc.status_code,
                "message": exc.detail,
                "timestamp": datetime.now().isoformat()
            }
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "success": false,
            "error": {
                "code": 500,
                "message": "Internal server error",
                "timestamp": datetime.now().isoformat()
            }
        }
    )
```

**File:** [backend/main.py](backend/main.py)

---

## 6. CHI TIẾT KỸ THUẬT

### 6.1. Performance Optimization

#### **Hot Path (Critical Performance)**
- AI Inference: < 2 seconds
- Database queries: < 100ms
- API response: < 2.5 seconds total

**Techniques:**
- `torch.inference_mode()` thay vì `torch.no_grad()`
- Model loaded once at startup, reused
- Connection pooling cho database
- Image preprocessing on client-side

#### **Cold Path (Background Tasks)**
- n8n webhooks: Async, non-blocking
- Email/SMS notifications: Queue-based
- Log aggregation: Batch processing

**Techniques:**
- FastAPI `BackgroundTasks`
- Retry with exponential backoff
- Circuit breaker pattern

### 6.2. Security Layers

```
┌────────────────────────────────────────────────────────────┐
│                    SECURITY ARCHITECTURE                    │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  1. API Key Authentication (Header-based)                  │
│     └─► X-API-Key header validation                        │
│                                                             │
│  2. Rate Limiting (Per-IP)                                 │
│     └─► /detect: 10 req/min                                │
│     └─► /chat: 20 req/min                                  │
│                                                             │
│  3. File Validation (4 layers)                             │
│     └─► Content-Type, Extension, Size, Magic Bytes         │
│                                                             │
│  4. CORS Policy (Dynamic origin matching)                  │
│     └─► localhost + DevTunnels only                        │
│                                                             │
│  5. SQL Injection Protection                               │
│     └─► SQLAlchemy ORM (parameterized queries)             │
│                                                             │
│  6. Input Validation                                       │
│     └─► Pydantic schemas                                   │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

### 6.3. Deployment Architecture

```
Docker Compose Orchestration:

┌─────────────────────────────────────────────────────────┐
│                                                          │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐          │
│   │ Frontend │   │ Backend  │   │PostgreSQL│          │
│   │  :80     │   │  :8000   │   │  :5432   │          │
│   │  Nginx   │   │ FastAPI  │   │          │          │
│   └────┬─────┘   └────┬─────┘   └────┬─────┘          │
│        │              │              │                  │
│        │              │              │                  │
│        │              └──────────────┘                  │
│        │                   │                            │
│        │              ┌────┴─────┐                      │
│        │              │   n8n    │                      │
│        │              │  :5678   │                      │
│        │              └──────────┘                      │
│        │                                                │
│        └────────► Internet ◄────────────────           │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Commands:**
```bash
# Start all services
docker-compose -f deployments/docker-compose.yml up -d

# View logs
docker-compose -f deployments/docker-compose.yml logs -f backend

# Stop all
docker-compose -f deployments/docker-compose.yml down
```

### 6.4. Database Schema

```sql
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Detection logs table
CREATE TABLE detection_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    image_path VARCHAR(255),
    label VARCHAR(20) NOT NULL,  -- 'Healthy' or 'WSSV'
    confidence FLOAT NOT NULL,   -- 0.0 - 1.0
    inference_time_ms FLOAT,
    created_at TIMESTAMP DEFAULT NOW(),
    INDEX idx_user_created (user_id, created_at),
    INDEX idx_label (label)
);

-- Knowledge base table
CREATE TABLE knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    INDEX idx_category (category),
    FULLTEXT INDEX idx_search (title, content)
);

-- Market prices table
CREATE TABLE market_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location VARCHAR(100),
    price_per_kg DECIMAL(10, 2),
    shrimp_size VARCHAR(20),
    recorded_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    INDEX idx_location_date (location, recorded_at)
);
```

### 6.5. API Endpoints Summary

| Endpoint | Method | Auth | Rate Limit | Mô tả |
|----------|--------|------|------------|-------|
| `/api/v1/detect` | POST | API Key | 10/min | Phát hiện bệnh tôm |
| `/api/v1/chat` | POST | API Key | 20/min | AI chatbot tư vấn |
| `/api/v1/sync` | POST | API Key | 30/min | Đồng bộ dữ liệu offline |
| `/api/v1/push` | POST | API Key | 10/min | Push notifications |
| `/health` | GET | None | 30/min | Health check |
| `/health/db` | GET | None | 10/min | Database health |

### 6.6. Environment Variables

**Backend (.env)**
```bash
# App
APP_NAME=TOMI
APP_VERSION=2.0.0
DEBUG=false

# Database
DB_HOST=db
DB_PORT=5432
DB_NAME=shrimp_db
DB_USER=postgres
DB_PASSWORD=<secure_password>

# AI Model
MODEL_PATH=./ml_models/best_cbam_resnet101.pth
MODEL_DEVICE=cpu
CLASS_NAMES=Healthy,WSSV

# Security
API_KEY=<your_secure_api_key>

# AI Service
GEMINI_API_KEY=<your_gemini_key>

# n8n
N8N_WEBHOOK_URL=http://n8n:5678/webhook/detect
```

**Frontend (.env)**
```bash
VITE_API_BASE_URL=http://localhost:8000
VITE_API_KEY=<same_as_backend>
```

---

## 📚 TÀI LIỆU LIÊN QUAN

- [README.md](README.md) - Tổng quan dự án
- [ARCHITECTURE_UI_UX.md](docs/ARCHITECTURE_UI_UX.md) - Nguyên tắc UI/UX
- [SETUP_MODEL.md](docs/SETUP_MODEL.md) - Hướng dẫn setup AI model
- [SETUP_N8N.md](docs/SETUP_N8N.md) - Hướng dẫn setup n8n workflows
- [SETUP_PHASE2.md](docs/SETUP_PHASE2.md) - Setup phase 2 features

---

## 🔄 CẬP NHẬT

| Ngày | Phiên bản | Nội dung |
|------|-----------|----------|
| 2026-01-22 | 2.0 | Thêm chi tiết flow, sơ đồ ASCII art, bảng API endpoints |
| 2026-01-14 | 1.1 | Cập nhật Gemini AI integration |
| 2025-12-20 | 1.0 | Tạo tài liệu ban đầu |

---

**Liên hệ:** GreenWarriors Team  
**License:** Proprietary - YDCC 2025
