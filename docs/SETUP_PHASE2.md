# 🚀 Setup & Deployment Guide - Phase 2

## Prerequisites

- Docker & Docker Compose
- Node.js 18+
- Python 3.10+
- PostgreSQL (via Docker)

## 📦 Installation Steps

### 1. Database Setup (PostgreSQL on Docker)

```bash
# Start Docker containers
cd deployments
docker-compose up -d

# Verify PostgreSQL is running
docker ps
# Should see: postgres, backend, frontend, n8n containers

# Check PostgreSQL connection
docker exec -it deployments-db-1 psql -U postgres -d shrimp_db
```

### 2. Backend Setup

```bash
cd backend

# Activate virtual environment
.\myenv\Scripts\activate  # Windows
# source myenv/bin/activate  # Linux/Mac

# Install dependencies (if not already installed)
pip install -r requirements.txt

# Initialize database tables
python init_db.py

# You should see:
# ✅ Database tables created successfully!
# Tables: users, detection_logs, market_prices, knowledge_base

# Run backend server
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Test endpoints:
# http://localhost:8000/docs
# http://localhost:8000/health
# http://localhost:8000/health/db
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Copy env file
copy .env.example .env  # Windows
# cp .env.example .env  # Linux/Mac

# Edit .env và update VITE_API_URL nếu cần

# Run development server
npm run dev

# Frontend will be available at:
# http://localhost:3000
```

### 4. Generate VAPID Keys for Push Notifications

```bash
# Install web-push globally (one time)
npm install -g web-push

# Generate VAPID keys
npx web-push generate-vapid-keys

# Copy keys to .env files:
# - VITE_VAPID_PUBLIC_KEY -> frontend/.env
# - VAPID_PRIVATE_KEY -> backend/.env (root)
```

## 🧪 Testing

### 1. Test Database Connection

```bash
# From backend directory
python -c "from app.models.database import engine; from sqlalchemy import text; conn = engine.connect(); print('✅ DB Connected'); print(conn.execute(text('SELECT version()')).fetchone())"
```

### 2. Test IndexedDB (Frontend)

Open browser console (F12) and run:

```javascript
// Test IndexedDB
const request = indexedDB.open('ShrimpDiseaseDB', 2);
request.onsuccess = () => {
  console.log('✅ IndexedDB opened successfully');
  console.log('Stores:', request.result.objectStoreNames);
};

// Test database helpers
import { db, dbHelpers } from './src/db/database';
const state = await dbHelpers.getAppState();
console.log('App State:', state);
```

### 3. Test Sync Service

```javascript
import { syncService } from './src/services/syncService';

// Check sync status
const status = await syncService.getSyncStatus();
console.log('Sync Status:', status);

// Trigger manual sync
const result = await syncService.syncNow();
console.log('Sync Result:', result);
```

### 4. Test Backend Sync Endpoint

```bash
# Using curl
curl -X POST http://localhost:8000/api/v1/sync/health

# Expected response:
# {"status":"healthy","database":"connected","timestamp":"2026-01-14T..."}
```

## 📊 Verify Deployment

### Check running services:

```bash
# PostgreSQL
docker ps | grep postgres
# Should show container running on port 5432

# Backend
curl http://localhost:8000/health
# {"status":"healthy","version":"1.0.0"}

# Frontend
curl http://localhost:3000
# Should return HTML

# n8n
curl http://localhost:5678
# Should return n8n interface
```

### Database Tables:

```sql
-- Connect to PostgreSQL
psql -U postgres -d shrimp_db

-- List tables
\dt

-- Expected tables:
-- users
-- detection_logs
-- market_prices
-- knowledge_base

-- Check user table
SELECT * FROM users LIMIT 5;

-- Check detection logs
SELECT id, prediction_label, confidence, created_at FROM detection_logs LIMIT 5;
```

## 🔧 Troubleshooting

### Database connection error:

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Restart PostgreSQL container
docker restart deployments-db-1

# Check logs
docker logs deployments-db-1
```

### Frontend build error:

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Vite cache
rm -rf node_modules/.vite
```

### Sync not working:

1. Check browser console for errors
2. Verify API URL in `.env`: `VITE_API_URL=http://localhost:8000`
3. Check CORS settings in backend
4. Test sync endpoint: `curl -X POST http://localhost:8000/api/v1/sync/health`

## 📱 iOS Testing

### Test on real iPhone:

1. **Deploy to HTTPS** (required for PWA features)
   - Use ngrok: `ngrok http 3000`
   - Or deploy to production with SSL

2. **Install PWA**
   - Open Safari on iPhone
   - Navigate to your app URL
   - Tap Share → Add to Home Screen

3. **Test offline mode**
   - Enable Airplane Mode
   - Open PWA
   - Try detection (should work offline)
   - Disable Airplane Mode
   - Data should sync automatically

4. **Test Push Notifications** (iOS 16.4+)
   - Allow notifications when prompted
   - Trigger notification from backend
   - Should receive notification

## 🚀 Production Deployment

### Update environment variables:

```bash
# Backend .env
DATABASE_URL=postgresql://user:pass@production-db-host:5432/shrimp_db
N8N_WEBHOOK_URL=https://your-n8n-domain.com/webhook

# Frontend .env
VITE_API_URL=https://api.your-domain.com
VITE_VAPID_PUBLIC_KEY=<your-production-vapid-key>
```

### Build frontend:

```bash
cd frontend
npm run build

# dist/ folder will contain production build
```

### Deploy backend:

```bash
# Using Docker
docker build -t shrimp-backend ./backend
docker run -p 8000:8000 --env-file .env shrimp-backend
```

## 📋 Next Steps

1. ✅ Database setup with PostgreSQL
2. ✅ IndexedDB implementation
3. ✅ Sync service with iOS fallback
4. ✅ Backend sync endpoints
5. ⏭️ Push notification service (next)
6. ⏭️ UI components for sync status
7. ⏭️ TensorFlow.js integration
8. ⏭️ Testing on real devices

## 📚 Documentation

- [Phase 2 Detailed Plan](/.agent/artifacts/phase2_detailed_implementation.md)
- [Offline First Plan](/.agent/artifacts/offline_first_implementation_plan.md)
- [API Documentation](http://localhost:8000/docs)
