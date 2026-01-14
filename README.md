# Shrimp Disease Detection System

## Overview

The Shrimp Disease Detection System is an AI-powered application designed to help farmers in the Mekong Delta region detect White Spot Disease (WSD) in shrimp through image analysis. The system is built with an AI-centric architecture, focusing on inference performance and rapid deployment capabilities.

## Key Features

- **Image-based Disease Detection**: Users capture shrimp images, and the system analyzes and returns results (Healthy/White Spot Disease) with confidence scores
- **AI Chatbot Consultation**: AI chatbot with OpenAI GPT-3.5-turbo integration and knowledge base fallback
- **Progressive Web App (PWA)**: Web application that can be installed on mobile devices, functioning like a native app
- **Workflow Automation**: Integration with n8n for background tasks such as logging and notifications
- **Database Logging**: All detections automatically saved to PostgreSQL with transaction safety
- **Advanced Security**: API key authentication, rate limiting, and multi-layer file validation
- **Knowledge Base Search**: Intelligent search through disease prevention and treatment knowledge

## System Architecture

The system is designed using a Layered Architecture model with 4 main layers:

### 1. Presentation Layer (Frontend)

**Technology**: React 18, TypeScript, Vite, Tailwind CSS

The frontend is built as a Progressive Web App (PWA), optimized for mobile devices. The user interface is fully localized in Vietnamese to serve local users.

**Main Components**:
- Camera Scanner: Component for capturing/uploading shrimp images
- Chat UI: Chat interface with AI chatbot
- API Client: Service layer for backend communication
- State Management: React Context API for state management

**Technical Features**:
- Edge processing: Image compression and resizing at client side to optimize bandwidth
- Offline support: Service Worker for offline capabilities
- Responsive design: Mobile-first approach with Tailwind CSS

### 2. Application Layer (Backend)

**Technology**: FastAPI (Python 3.10+), PyTorch, SQLAlchemy

The backend serves as an API Gateway and AI Inference Wrapper, handling requests from the frontend and performing AI model inference.

**Module Structure**:

- **API Endpoints** (`app/api/v1/`):
  - `/api/v1/detect`: Image detection with 4-layer validation and database logging
  - `/api/v1/chat`: AI chat with OpenAI integration and knowledge base search
  - `/api/v1/sync`: Data synchronization endpoint
  - `/api/v1/push`: Push notification endpoint

- **Core Services** (`app/services/`):
  - `ai_service.py`: AI inference service with PyTorch model
    - Model loading using state_dict (thread-safe)
    - Inference with `torch.inference_mode()` (performance optimized)
    - Image preprocessing: resize, normalize
  - `n8n_client.py`: Client for calling n8n webhooks
    - Retry logic with exponential backoff
    - Async HTTP client with httpx

- **Data Models** (`app/models/`):
  - `database.py`: SQLAlchemy ORM models (User, DetectionLog, MarketPrice, KnowledgeBase)
  - `schemas.py`: Pydantic schemas for request/response validation

- **Configuration** (`app/core/`):
  - `config.py`: Settings management with Pydantic Settings, specific CORS origins
  - `security.py`: API key authentication, client IP extraction, comprehensive logging

**Technical Features**:
- Hot Path optimization: AI inference returns results in < 2 seconds
- Cold Path: n8n webhooks called via BackgroundTasks (non-blocking)
- Model loading: Uses state_dict for safe model loading, no class definition required
- Error handling: Comprehensive error handling with logging and context
- Database Transactions: All database operations use transactions for data integrity
- Rate Limiting: 10 req/min for detection, 20 req/min for chat, per IP address
- File Validation: 4-layer validation (content-type, extension, size, magic bytes)
- OpenAI Integration: GPT-3.5-turbo with knowledge base context injection

### 3. Orchestration Layer (n8n)

**Technology**: n8n

n8n functions as a low-code backend for processing logic that doesn't require high performance:
- Saving detection logs to database
- Sending notifications when disease is detected
- Rule engine: Trigger alerts when confidence is high and label is WSD
- Integration with external services (SMS, Email, etc.)

**Workflow**:
- `detect_notification`: Receives webhook from backend, saves logs, triggers notifications

### 4. Data Layer (PostgreSQL)

**Technology**: PostgreSQL

Database stores the following information:
- Users: User information
- DetectionLogs: Disease detection history (images, results, confidence scores)
- MarketPrice: Shrimp market prices
- KnowledgeBase: Knowledge base about shrimp diseases

## Data Processing Flow

### Hot Path (Real-time)

1. User captures image via PWA
2. Frontend compresses/resizes image
3. Upload image via API `/api/v1/detect` (multipart/form-data) with API key
4. Backend validates request:
   - API key authentication
   - Rate limit check (10/minute per IP)
   - Content-Type validation
   - File extension check (.jpg, .jpeg, .png)
   - File size validation (max 10MB)
   - Magic bytes verification (actual MIME type)
5. AI Service preprocesses image (resize 224x224, normalize)
6. PyTorch model inference
7. **Database Transaction**: Save DetectionLog to PostgreSQL
8. Backend returns results (label, confidence, processing_time)
9. Frontend displays results to user

Processing time: < 2 seconds (including database save)

### Cold Path (Background)

1. After inference, if confidence >= threshold
2. Backend adds task to BackgroundTasks to call n8n webhook
3. Response is returned immediately (doesn't wait for n8n)
4. n8n receives webhook, processes:
   - Save detection log to PostgreSQL
   - If confidence is high and label is WSD → Trigger notification
   - Execute other workflows

Processing time: Background, doesn't affect response time

## Technology Stack

### Backend

- **Framework**: FastAPI 0.104.1
- **Language**: Python 3.10+
- **AI/ML**: PyTorch 2.9.1, TorchVision 0.21.0+
- **Database ORM**: SQLAlchemy 2.0.23
- **Database Driver**: psycopg 3.1.0+ (binary)
- **Validation**: Pydantic 2.12.5, Pydantic Settings 2.12.0
- **HTTP Client**: httpx 0.28.1 (async)
- **Image Processing**: Pillow 11.3.0
- **Server**: Uvicorn 0.24.0 (ASGI server)
- **Security**: slowapi 0.1.9 (rate limiting)
- **File Validation**: python-magic 0.4.27
- **AI Chat**: OpenAI 2.8.1 (GPT-3.5-turbo)

### Frontend

- **Framework**: React 18.2.0
- **Language**: TypeScript 5.3.3
- **Build Tool**: Vite 5.0.8
- **Styling**: Tailwind CSS 3.3.6
- **HTTP Client**: Axios 1.6.2
- **State Management**: Zustand 4.4.7 (optional, currently using Context API)
- **PWA**: vite-plugin-pwa 0.17.4

### Infrastructure

- **Containerization**: Docker, Docker Compose
- **Web Server**: Nginx (for frontend)
- **Workflow Automation**: n8n
- **Database**: PostgreSQL (alpine image)

## Directory Structure

```
code/
├── backend/                 # FastAPI Backend
│   ├── app/
│   │   ├── api/v1/         # API endpoints
│   │   ├── core/           # Config, security
│   │   ├── models/         # Database models, schemas
│   │   └── services/       # Business logic (AI, n8n)
│   ├── db/                 # Database migrations (future)
│   ├── ml_models/          # AI model weights (.pth files)
│   ├── tests/              # Unit tests
│   ├── main.py             # Application entry point
│   ├── Dockerfile          # Backend container
│   └── requirements.txt    # Python dependencies
│
├── frontend/               # React PWA
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── services/       # API client
│   │   ├── store/          # State management
│   │   └── App.tsx         # Main app component
│   ├── public/             # Static assets, manifest
│   ├── Dockerfile          # Frontend container
│   └── package.json        # Node dependencies
│
├── n8n/                    # n8n workflows
│   ├── workflows/          # Workflow JSON files
│   └── n8n_data/           # n8n internal data
│
├── deployments/            # Deployment configs
│   ├── docker-compose.yml  # Multi-container setup
│   └── nginx.conf          # Nginx configuration
│
├── shared/                 # Shared resources
└── .env                    # Environment variables
```

## System Requirements

- **Docker**: 20.10+
- **Docker Compose**: 2.0+
- **Python**: 3.10+ (if running backend directly)
- **Node.js**: 18+ (if building frontend directly)

## Installation and Running

### 1. Clone Repository

```bash
git clone <repository-url>
cd code
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/shrimp_db
DB_POOL_SIZE=10
DB_MAX_OVERFLOW=20

# AI Model
MODEL_PATH=ml_models/wsd_model_v1.pth
MODEL_DEVICE=cpu
MODEL_CONFIDENCE_THRESHOLD=0.7

# n8n Integration
N8N_WEBHOOK_URL=http://localhost:5678/webhook/detect
N8N_TIMEOUT=5
N8N_MAX_RETRIES=3
N8N_RETRY_DELAY=1.0

# Security
API_KEY=your_secure_api_key_here
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173

# File Upload
MAX_UPLOAD_SIZE=10485760  # 10MB in bytes
ALLOWED_EXTENSIONS=.jpg,.jpeg,.png

# OpenAI (Optional - for advanced chat features)
OPENAI_API_KEY=sk-your-openai-api-key-here

# App Settings
APP_NAME=Shrimp Disease Detection API
APP_VERSION=1.0.0
DEBUG=False
```

### 3. Initialize Database

Run the database initialization script to create tables and insert sample data:

```bash
cd backend
python init_db.py
```

This script will:
- Test database connection
- Create all required tables (users, detection_logs, market_prices, knowledge_base)
- Verify table structure
- Insert sample knowledge base entries
- Generate initialization log (init_db.log)

### 4. Add AI Model (Optional)

If you have an AI model, place the `.pth` file in `backend/ml_models/`. The model must be saved as state_dict or checkpoint with 'state_dict' key.

### 5. Run with Docker Compose

```bash
cd deployments
docker-compose up -d
```

Services will be started:
- Frontend: http://localhost
- Backend API: http://localhost:8000
- n8n UI: http://localhost:5678
- PostgreSQL: localhost:5432

### 6. View Logs

```bash
cd deployments
docker-compose logs -f
```

## Development

### Backend Development

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Development

```bash
cd frontend
npm install
npm run dev
```

Frontend dev server: http://localhost:3000

## API Documentation

When the backend is running, access:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### Main Endpoints

#### POST /api/v1/detect

Detect disease from shrimp image.

**Headers**:
- `X-API-Key`: Your API key (if configured)

**Request**: multipart/form-data with image file

**Response**:
```json
{
  "label": "WSD" | "Healthy",
  "confidence": 0.0-1.0,
  "processing_time": 0.123
}
```

**Rate Limit**: 10 requests/minute per IP

**Validation**:
- Content-Type must be image/*
- File extension: .jpg, .jpeg, .png only
- Max file size: 10MB
- Magic bytes validation

#### POST /api/v1/chat

Chat with AI chatbot (OpenAI GPT-3.5-turbo + Knowledge Base).

**Headers**:
- `X-API-Key`: Your API key (if configured)

**Request**:
```json
{
  "message": "User's question (max 1000 chars)"
}
```

**Response**:
```json
{
  "response": "AI response based on knowledge base and OpenAI",
  "timestamp": "2024-01-01T00:00:00"
}
```

**Rate Limit**: 20 requests/minute per IP

**Features**:
- Searches knowledge base for relevant context
- Injects context into OpenAI GPT-3.5-turbo prompt
- Falls back to knowledge base only if OpenAI unavailable
- Validates input length and emptiness

## Optimization and Best Practices

### Performance

- **Hot Path**: Response time < 2 seconds thanks to optimized AI inference
- **Cold Path**: Non-blocking with BackgroundTasks, doesn't affect response time
- **Model Loading**: Uses state_dict, thread-safe, supports multi-threading
- **Inference**: `torch.inference_mode()` instead of `torch.no_grad()` for better performance

### Reliability

- **Retry Logic**: n8n client has retry with exponential backoff (3 attempts)
- **Error Handling**: Comprehensive error handling with logging
- **Validation**: Pydantic schemas for request/response validation

### Security

- **API Key Authentication**: X-API-Key header validation on all endpoints
- **Rate Limiting**: Per-IP rate limits (10/min detect, 20/min chat, 30-60/min health)
- **CORS**: Specific origins only (localhost:3000, localhost:5173, 127.0.0.1)
- **File Validation**: 4-layer validation system
  1. Content-Type header check (must be image/*)
  2. File extension whitelist (.jpg, .jpeg, .png only)
  3. File size limit (max 10MB)
  4. Magic bytes verification (python-magic for actual MIME type)
- **Database Transactions**: All operations wrapped in transactions
- **Input Validation**: Pydantic schemas + custom validators
- **Error Logging**: Comprehensive logging with context and stack traces
- **No Trust Client**: Server-side validation of all inputs

## License

[Add license information if applicable]

## Authors

[Add author/development team information]
