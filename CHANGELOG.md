# Changelog

All notable changes to the Shrimp Disease Detection System will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-15

### Added - PHASE 0: Backend Critical Fixes

#### Database & Persistence
- **Database Initialization Script** (`backend/init_db.py`)
  - Comprehensive database setup with connection testing
  - Automatic table creation from SQLAlchemy models
  - Sample data insertion for knowledge base
  - Detailed logging to both console and file (init_db.log)
  - Transaction-safe operations with rollback support

- **Database Logging in Detection Endpoint**
  - All disease detections automatically saved to PostgreSQL
  - Transaction-wrapped database operations for data integrity
  - Detection ID returned in response for tracking
  - Atomic save before n8n webhook trigger

#### Security Enhancements

- **API Key Authentication**
  - X-API-Key header validation on all endpoints
  - Configurable via API_KEY environment variable
  - Dev mode support (skips validation if not configured)
  - Comprehensive logging of authentication attempts
  - Module: `backend/app/core/security.py`

- **Rate Limiting (slowapi)**
  - Per-IP address rate limiting using slowapi
  - Endpoint-specific limits:
    - `/api/v1/detect`: 10 requests/minute
    - `/api/v1/chat`: 20 requests/minute
    - `/health`: 60 requests/minute
    - `/health/db`: 30 requests/minute
    - `/`: 30 requests/minute
  - Automatic HTTP 429 responses when limits exceeded

- **CORS Security**
  - Removed wildcard `allow_origins=["*"]`
  - Specific origins only: localhost:3000, localhost:5173, 127.0.0.1
  - Configurable via CORS_ORIGINS environment variable
  - Supports comma-separated list of allowed origins

- **4-Layer File Upload Validation**
  1. **Content-Type Header**: Must be `image/*`
  2. **File Extension Whitelist**: Only `.jpg`, `.jpeg`, `.png` allowed
  3. **File Size Limit**: Maximum 10MB (configurable)
  4. **Magic Bytes Verification**: Uses python-magic to verify actual MIME type
  - Prevents malicious file uploads and server exploitation

#### AI & Chat Features

- **OpenAI Integration** (`backend/app/api/v1/chat.py`)
  - GPT-3.5-turbo integration for advanced chat responses
  - Knowledge base search with context injection
  - Fallback strategy: Knowledge base only if OpenAI unavailable
  - Configurable via OPENAI_API_KEY environment variable
  - Input validation: max 1000 characters, non-empty check

- **Knowledge Base Search**
  - ILIKE pattern matching for Vietnamese text search
  - Search across title and content fields
  - Returns top 3 relevant results
  - Category-based organization (disease, prevention, treatment)

#### Code Quality & Reliability

- **Transaction Safety**
  - All database operations wrapped in transactions
  - Automatic rollback on errors
  - SQLAlchemy session management with proper cleanup

- **Comprehensive Error Handling**
  - All exceptions logged with full context (`exc_info=True`)
  - Specific error messages for different failure modes
  - HTTP status codes aligned with error types
  - No sensitive information leaked in error responses

- **Input Validation at Multiple Layers**
  - Pydantic schemas for request/response validation
  - Custom validators in API endpoints
  - Database model constraints
  - Never trust client-side validation

- **Logging Best Practices**
  - Structured logging with timestamps
  - Different log levels (INFO, WARNING, ERROR, DEBUG)
  - Request context in logs (API key prefix, client IP)
  - File and console output for init_db.py

### Changed

#### Dependencies Updated
- `pydantic`: 2.5.0 → 2.12.5
- `pydantic-settings`: 2.1.0 → 2.12.0
- `httpx`: 0.25.1 → 0.28.1
- `torch`: 2.6.0 → 2.9.1
- `pillow`: 10.1.0 → 11.3.0
- `python-dotenv`: 1.0.0 → 1.0.1
- `openai`: Added 2.8.1

#### New Dependencies Added
- `slowapi==0.1.9`: Rate limiting middleware
- `python-magic==0.4.27`: File type validation via magic bytes
- `openai==2.8.1`: OpenAI GPT integration
- `limits==5.6.0`: Dependency of slowapi
- `deprecated==1.3.1`: Dependency of limits

#### Configuration
- **Settings** (`backend/app/core/config.py`)
  - Added `DB_POOL_SIZE` and `DB_MAX_OVERFLOW` for connection pooling
  - Added `cors_origins_list` property to parse comma-separated origins
  - CORS_ORIGINS now string type (comma-separated) instead of list

- **Environment Variables**
  - New: `DB_POOL_SIZE` (default: 10)
  - New: `DB_MAX_OVERFLOW` (default: 20)
  - New: `OPENAI_API_KEY` (optional)
  - New: `CORS_ORIGINS` (comma-separated string)
  - Updated: `MAX_UPLOAD_SIZE` clarified as bytes
  - Updated: `ALLOWED_EXTENSIONS` documented

#### API Endpoints

- **POST /api/v1/detect**
  - Now requires X-API-Key header (if configured)
  - Rate limited to 10 requests/minute per IP
  - 4-layer file validation before processing
  - Saves DetectionLog to database in transaction
  - Returns detection result immediately
  - Triggers n8n webhook in background (non-blocking)

- **POST /api/v1/chat**
  - Now requires X-API-Key header (if configured)
  - Rate limited to 20 requests/minute per IP
  - OpenAI GPT-3.5-turbo integration
  - Knowledge base search and context injection
  - Input validation (max 1000 chars, non-empty)
  - Fallback to knowledge base if OpenAI fails

### Fixed

- **Database Logging**: Detections now properly saved before response
- **Error Handling**: All endpoints have comprehensive try-catch blocks
- **CORS Security**: No longer accepts requests from any origin
- **File Upload Security**: Multiple validation layers prevent malicious uploads
- **Rate Limiting**: Prevents API abuse and ensures fair usage
- **Transaction Safety**: Database rollback on errors prevents partial writes

### Security

#### Critical Security Improvements
- ✅ API Key authentication on all endpoints
- ✅ Per-IP rate limiting prevents DoS attacks
- ✅ CORS restricted to specific origins only
- ✅ 4-layer file validation prevents malicious uploads
- ✅ Input validation at API and service layers
- ✅ Database transactions prevent data corruption
- ✅ Comprehensive error logging for security audits
- ✅ No sensitive data in error responses

#### Security Principles Applied
1. **Defense in Depth**: Multiple validation layers
2. **Fail Securely**: Rollback transactions on error
3. **Never Trust Input**: Validate at every layer
4. **Least Privilege**: API key required for operations
5. **Audit Trail**: All operations logged with context

### Technical Debt Addressed

- ✅ Database operations now use transactions
- ✅ Error handling with proper logging context
- ✅ Input validation at multiple layers
- ✅ No reliance on client-side validation
- ✅ Rate limiting implemented
- ✅ File validation with magic bytes
- ✅ CORS properly configured

### Documentation

- Updated README.md with:
  - New security features section
  - Database initialization instructions
  - Environment variables documentation
  - API endpoint rate limits
  - File validation details
  - Updated technology stack versions
  - OpenAI integration guide

- Updated requirements.txt with:
  - Organized sections (Core, Data, Database, Security, etc.)
  - Updated version numbers
  - New dependencies with version pinning

- Created CHANGELOG.md:
  - Comprehensive list of all changes
  - Security improvements documented
  - Breaking changes highlighted
  - Migration guide for existing deployments

### Breaking Changes

⚠️ **Important for existing deployments:**

1. **API Key Authentication**: Endpoints now require X-API-Key header if API_KEY is set in environment variables. Set `API_KEY=` empty for dev mode.

2. **CORS Origins**: Must explicitly set allowed origins in CORS_ORIGINS environment variable. Wildcard `*` is no longer accepted.

3. **Rate Limiting**: All endpoints are now rate-limited. High-traffic applications may need to adjust limits in code.

4. **File Validation**: Stricter file upload validation may reject files that were previously accepted. Only .jpg, .jpeg, .png under 10MB allowed.

5. **Database Schema**: New tables created by init_db.py. Existing databases need migration.

6. **Dependencies**: New packages required (slowapi, python-magic, openai). Run `pip install -r requirements.txt` to update.

### Migration Guide

For existing deployments upgrading to v1.0.0:

1. **Update Dependencies**:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. **Update Environment Variables**:
   ```bash
   # Add to .env
   OPENAI_API_KEY=sk-your-key  # Optional
   CORS_ORIGINS=http://localhost:3000,http://localhost:5173
   API_KEY=your_secure_key  # Or leave empty for dev
   DB_POOL_SIZE=10
   DB_MAX_OVERFLOW=20
   ```

3. **Initialize Database**:
   ```bash
   cd backend
   python init_db.py
   ```

4. **Update Frontend API Calls**:
   - Add X-API-Key header to all requests
   - Handle HTTP 429 (rate limit) responses
   - Handle HTTP 401/403 (auth) responses

5. **Test Rate Limits**:
   - Verify 10 req/min limit on /detect
   - Verify 20 req/min limit on /chat
   - Adjust limits in code if needed

6. **Verify File Uploads**:
   - Test with various image formats
   - Verify 10MB size limit
   - Test with invalid files to confirm rejection

### Known Issues

- Unicode characters (✓, ✗) in init_db.py logs may not display correctly on Windows terminals. Logs are still written correctly to init_db.log file.

### Roadmap

Next planned features (PHASE 1):
- [ ] IndexedDB for offline storage (frontend)
- [ ] Service Worker for offline capability
- [ ] Background Sync API for queue management
- [ ] Push Notifications for disease alerts
- [ ] Progressive Web App manifest updates

---

## [0.1.0] - 2024-01-01

### Initial Release

- Basic disease detection with PyTorch model
- FastAPI backend with simple endpoints
- React frontend with camera interface
- n8n integration for logging
- PostgreSQL database
- Docker deployment
