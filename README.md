# Shrimp Disease Detection System

## Overview

The Shrimp Disease Detection System is an AI-powered application designed to help farmers in the Mekong Delta region detect White Spot Disease (WSD) in shrimp through image analysis. The system is built with an AI-centric architecture, focusing on inference performance and rapid deployment capabilities.

## Key Features

- **Image-based Disease Detection**: Users capture shrimp images, and the system analyzes and returns results (Healthy/White Spot Disease) with confidence scores
- **AI Chatbot Consultation**: AI chatbot provides advice on shrimp diseases and care methods
- **Progressive Web App (PWA)**: Web application that can be installed on mobile devices, functioning like a native app
- **Workflow Automation**: Integration with n8n for background tasks such as logging and notifications

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
  - `/api/v1/detect`: Endpoint that receives images, performs inference, and returns results
  - `/api/v1/chat`: Endpoint for AI chat processing

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
  - `config.py`: Settings management with Pydantic Settings
  - `security.py`: API key authentication

**Technical Features**:
- Hot Path optimization: AI inference returns results in < 2 seconds
- Cold Path: n8n webhooks called via BackgroundTasks (non-blocking)
- Model loading: Uses state_dict for safe model loading, no class definition required
- Error handling: Comprehensive error handling with logging

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
3. Upload image via API `/api/v1/detect` (multipart/form-data)
4. Backend receives image, validates file type and size
5. AI Service preprocesses image (resize 224x224, normalize)
6. PyTorch model inference
7. Backend returns results (label, confidence, processing_time)
8. Frontend displays results to user

Processing time: < 2 seconds

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
- **AI/ML**: PyTorch 2.1.0, TorchVision 0.16.0
- **Database ORM**: SQLAlchemy 2.0.23
- **Database**: PostgreSQL (via psycopg2-binary)
- **Validation**: Pydantic 2.5.0, Pydantic Settings 2.1.0
- **HTTP Client**: httpx 0.25.1 (async)
- **Image Processing**: Pillow 10.1.0
- **Server**: Uvicorn (ASGI server)

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
DATABASE_URL=postgresql://postgres:postgres@db:5432/shrimp_db
DB_NAME=shrimp_db
DB_USER=postgres
DB_PASSWORD=postgres

# AI Model
MODEL_PATH=ml_models/wsd_model_v1.pth
MODEL_DEVICE=cpu
MODEL_CONFIDENCE_THRESHOLD=0.7

# n8n
N8N_WEBHOOK_URL=http://n8n:5678/webhook
N8N_TIMEOUT=5
N8N_MAX_RETRIES=3
N8N_RETRY_DELAY=1.0

# Security
API_KEY=your_api_key_here

# Frontend
VITE_API_URL=http://localhost:8000
```

### 3. Add AI Model (Optional)

If you have an AI model, place the `.pth` file in `backend/ml_models/`. The model must be saved as state_dict or checkpoint with 'state_dict' key.

### 4. Run with Docker Compose

```bash
cd deployments
docker-compose up -d
```

Services will be started:
- Frontend: http://localhost
- Backend API: http://localhost:8000
- n8n UI: http://localhost:5678
- PostgreSQL: localhost:5432

### 5. View Logs

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

**Request**: multipart/form-data with image file

**Response**:
```json
{
  "label": "WSD" | "Healthy",
  "confidence": 0.0-1.0,
  "processing_time": 0.123
}
```

#### POST /api/v1/chat

Chat with AI chatbot.

**Request**:
```json
{
  "message": "User's question",
  "user_id": 1
}
```

**Response**:
```json
{
  "response": "AI response",
  "timestamp": "2024-01-01T00:00:00"
}
```

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

- **API Key**: Optional API key authentication
- **CORS**: Configurable CORS origins
- **File Validation**: Validate file type and size before processing

## License

[Add license information if applicable]

## Authors

[Add author/development team information]
