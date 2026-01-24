# TOMI - Docker Run Script
# Script tự động build và chạy tất cả containers

$ErrorActionPreference = "Stop"
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootPath = $scriptPath

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TOMI - Docker Setup Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check Docker
Write-Host "[1/8] Checking Docker..." -ForegroundColor Yellow
try {
    docker ps | Out-Null
    Write-Host "✓ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "✗ Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}

# Step 2: Check .env file
Write-Host "[2/8] Checking .env file..." -ForegroundColor Yellow
$envFile = Join-Path $rootPath ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "✗ .env file not found at: $envFile" -ForegroundColor Red
    Write-Host "Please create .env file first." -ForegroundColor Red
    exit 1
}
Write-Host "✓ .env file found" -ForegroundColor Green

# Step 3: Build Backend Image
Write-Host "[3/8] Building backend image..." -ForegroundColor Yellow
$backendPath = Join-Path $rootPath "backend"
Set-Location $backendPath

# Skip image deletion - Docker will create new image with --no-cache
# Old images will become dangling and can be cleaned later

# Build with retry logic for network issues
$maxRetries = 3
$retryCount = 0
$buildSuccess = $false

while ($retryCount -lt $maxRetries -and -not $buildSuccess) {
    if ($retryCount -gt 0) {
        Write-Host "Retry attempt $retryCount of $maxRetries..." -ForegroundColor Yellow
        Start-Sleep -Seconds 5
    }
    
    # Check Docker daemon is running
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ Docker daemon is not running. Please start Docker Desktop." -ForegroundColor Red
        Set-Location $rootPath
        exit 1
    }
    
    Write-Host "Starting build (this may take 5-10 minutes for large packages)..." -ForegroundColor Gray
    $buildOutput = docker build --no-cache -t tomi-backend:latest . 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Backend image built successfully" -ForegroundColor Green
        $buildSuccess = $true
    } else {
        $retryCount++
        $errorMsg = $buildOutput | Select-String -Pattern "ERROR|error|failed|EOF|timeout" | Select-Object -First 3
        if ($errorMsg) {
            Write-Host "Build failed. Error detected:" -ForegroundColor Yellow
            Write-Host $errorMsg -ForegroundColor Red
        }
        
        if ($retryCount -lt $maxRetries) {
            Write-Host "Build failed. Will retry..." -ForegroundColor Yellow
        } else {
            Write-Host "✗ Failed to build backend image after $maxRetries attempts" -ForegroundColor Red
            Write-Host "Last build output (last 50 lines):" -ForegroundColor Yellow
            $buildOutput | Select-Object -Last 50 | ForEach-Object { Write-Host $_ -ForegroundColor Red }
            Set-Location $rootPath
            exit 1
        }
    }
}

# Step 4: Build Frontend Image
Write-Host "[4/8] Building frontend image..." -ForegroundColor Yellow
$frontendPath = Join-Path $rootPath "frontend"
Set-Location $frontendPath

# Skip image deletion - Docker will create new image with --no-cache
# Old images will become dangling and can be cleaned later

# Build with retry logic
$maxRetries = 3
$retryCount = 0
$buildSuccess = $false

while ($retryCount -lt $maxRetries -and -not $buildSuccess) {
    if ($retryCount -gt 0) {
        Write-Host "Retry attempt $retryCount of $maxRetries..." -ForegroundColor Yellow
        Start-Sleep -Seconds 5
    }
    
    # Check Docker daemon is running
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ Docker daemon is not running. Please start Docker Desktop." -ForegroundColor Red
        Set-Location $rootPath
        exit 1
    }
    
    Write-Host "Starting build..." -ForegroundColor Gray
    $buildOutput = docker build --no-cache -t tomi-frontend:latest . 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Frontend image built successfully" -ForegroundColor Green
        $buildSuccess = $true
    } else {
        $retryCount++
        $errorMsg = $buildOutput | Select-String -Pattern "ERROR|error|failed|EOF|timeout" | Select-Object -First 3
        if ($errorMsg) {
            Write-Host "Build failed. Error detected:" -ForegroundColor Yellow
            Write-Host $errorMsg -ForegroundColor Red
        }
        
        if ($retryCount -lt $maxRetries) {
            Write-Host "Build failed. Will retry..." -ForegroundColor Yellow
        } else {
            Write-Host "✗ Failed to build frontend image after $maxRetries attempts" -ForegroundColor Red
            Write-Host "Last build output (last 50 lines):" -ForegroundColor Yellow
            $buildOutput | Select-Object -Last 50 | ForEach-Object { Write-Host $_ -ForegroundColor Red }
            Set-Location $rootPath
            exit 1
        }
    }
}

# Step 4: Build Frontend Image
Write-Host "[4/8] Building frontend image..." -ForegroundColor Yellow
$frontendPath = Join-Path $rootPath "frontend"
Set-Location $frontendPath
try {
    docker build -t tomi-frontend:latest . 2>&1 | Out-Null
    Write-Host "✓ Frontend image built successfully" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to build frontend image" -ForegroundColor Red
    exit 1
}

# Step 5: Create Network
Write-Host "[5/8] Creating Docker network..." -ForegroundColor Yellow
$networkExists = docker network ls --filter name=tomi-network --format "{{.Name}}"
if ($networkExists -ne "tomi-network") {
    docker network create tomi-network | Out-Null
    Write-Host "✓ Network created" -ForegroundColor Green
} else {
    Write-Host "✓ Network already exists" -ForegroundColor Green
}

# Step 6: Stop and Remove Existing Containers (if any)
Write-Host "[6/8] Cleaning up existing containers..." -ForegroundColor Yellow
$containers = @("tomi-db", "tomi-backend", "tomi-frontend")
foreach ($container in $containers) {
    $exists = docker ps -a --filter "name=$container" --format "{{.Names}}"
    if ($exists -eq $container) {
        docker stop $container 2>&1 | Out-Null
        docker rm $container 2>&1 | Out-Null
        Write-Host "  Removed: $container" -ForegroundColor Gray
    }
}

# Step 7: Run Database
Write-Host "[7/8] Starting database container..." -ForegroundColor Yellow

# Check if port 5432 is in use
$portCheck = netstat -ano | findstr :5432
if ($portCheck) {
    Write-Host "⚠ Port 5432 is already in use" -ForegroundColor Yellow
    Write-Host "Checking if it's another PostgreSQL container..." -ForegroundColor Gray
    $existingDb = docker ps --filter "publish=5432" --format "{{.Names}}"
    if ($existingDb) {
        Write-Host "Found existing container using port 5432: $existingDb" -ForegroundColor Yellow
        Write-Host "Stopping conflicting container..." -ForegroundColor Gray
        docker stop $existingDb 2>&1 | Out-Null
        Start-Sleep -Seconds 2
        Write-Host "✓ Stopped: $existingDb" -ForegroundColor Green
    } else {
        Write-Host "⚠ Port 5432 is in use by a non-Docker process" -ForegroundColor Yellow
        Write-Host "Please stop the service using port 5432 manually" -ForegroundColor Yellow
        Set-Location $rootPath
        exit 1
    }
}

# Remove existing container if in Created/Exited state
$dbExists = docker ps -a --filter "name=tomi-db" --format "{{.Names}}"
if ($dbExists -eq "tomi-db") {
    $dbState = docker ps -a --filter "name=tomi-db" --format "{{.Status}}"
    if ($dbState -like "*Created*" -or $dbState -like "*Exited*") {
        Write-Host "  Removing existing container in Created/Exited state..." -ForegroundColor Gray
        docker rm tomi-db 2>&1 | Out-Null
    }
}

# Run database container
$dbOutput = docker run -d `
  --name tomi-db `
  --network tomi-network `
  -e POSTGRES_DB=shrimp_db `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_PASSWORD=postgres `
  -p 5432:5432 `
  -v tomi_postgres_data:/var/lib/postgresql/data `
  postgres:alpine 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to create database container" -ForegroundColor Red
    Write-Host "Error: $dbOutput" -ForegroundColor Red
    Set-Location $rootPath
    exit 1
}

# Wait a bit for container to start
Start-Sleep -Seconds 3

# Check container state
$dbState = docker ps -a --filter "name=tomi-db" --format "{{.State}}"
$dbRunning = docker ps --filter "name=tomi-db" --format "{{.Names}}"

if ($dbState -eq "created") {
    Write-Host "✗ Container created but not started. Attempting to start..." -ForegroundColor Yellow
    docker start tomi-db 2>&1 | Out-Null
    Start-Sleep -Seconds 3
    $dbRunning = docker ps --filter "name=tomi-db" --format "{{.Names}}"
}

if ($dbRunning -eq "tomi-db") {
    Write-Host "✓ Database container started" -ForegroundColor Green
} else {
    Write-Host "✗ Database container failed to start" -ForegroundColor Red
    Write-Host "Container state: $dbState" -ForegroundColor Yellow
    Write-Host "Checking logs..." -ForegroundColor Yellow
    docker logs tomi-db 2>&1
    Set-Location $rootPath
    exit 1
}

# Wait for database to be ready
Write-Host "  Waiting for database to be ready..." -ForegroundColor Gray
Start-Sleep -Seconds 5

# Step 8: Run Backend
Write-Host "[8/8] Starting backend container..." -ForegroundColor Yellow
$mlModelsPath = Join-Path $rootPath "backend\ml_models"
docker run -d `
  --name tomi-backend `
  --network tomi-network `
  -p 8000:8000 `
  -v "${mlModelsPath}:/app/ml_models" `
  --env-file $envFile `
  tomi-backend:latest 2>&1 | Out-Null

Start-Sleep -Seconds 3
$backendStatus = docker ps --filter "name=tomi-backend" --format "{{.Status}}"
if ($backendStatus) {
    Write-Host "✓ Backend container started" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to start backend" -ForegroundColor Red
    Write-Host "Check logs: docker logs tomi-backend" -ForegroundColor Yellow
}

# Step 9: Initialize Database
Write-Host ""
Write-Host "Initializing database..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
try {
    docker exec tomi-backend python init_db.py
    Write-Host "✓ Database initialized" -ForegroundColor Green
} catch {
    Write-Host "⚠ Database initialization may have failed. Check logs: docker logs tomi-backend" -ForegroundColor Yellow
}

# Step 10: Run Frontend
Write-Host "Starting frontend container..." -ForegroundColor Yellow

# Remove existing container if exists
docker rm -f tomi-frontend 2>&1 | Out-Null

$frontendOutput = docker run -d `
  --name tomi-frontend `
  --network tomi-network `
  -p 8080:80 `
  tomi-frontend:latest 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to create frontend container" -ForegroundColor Red
    Write-Host "Error: $frontendOutput" -ForegroundColor Red
} else {
    Start-Sleep -Seconds 3
    $frontendRunning = docker ps --filter "name=tomi-frontend" --format "{{.Names}}"
    if ($frontendRunning -eq "tomi-frontend") {
        Write-Host "✓ Frontend container started" -ForegroundColor Green
    } else {
        Write-Host "✗ Frontend container failed to start or exited immediately" -ForegroundColor Red
        Write-Host "Checking container logs..." -ForegroundColor Yellow
        docker logs tomi-frontend 2>&1
    }
}


# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Containers Status:" -ForegroundColor Yellow
docker ps --filter "name=tomi-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
Write-Host ""
Write-Host "Access URLs:" -ForegroundColor Yellow
Write-Host "  Frontend:  http://localhost:8080" -ForegroundColor White
Write-Host "  Backend:   http://localhost:8000" -ForegroundColor White
Write-Host "  API Docs:  http://localhost:8000/docs" -ForegroundColor White
Write-Host ""
Write-Host "Useful Commands:" -ForegroundColor Yellow
Write-Host "  View logs:     docker logs tomi-backend" -ForegroundColor Gray
Write-Host "  View DB logs:  docker logs tomi-db" -ForegroundColor Gray
Write-Host "  Stop all:      docker stop tomi-backend tomi-frontend tomi-db" -ForegroundColor Gray
Write-Host "  Start all:     docker start tomi-db tomi-backend tomi-frontend" -ForegroundColor Gray
Write-Host "  Remove all:    docker rm -f tomi-backend tomi-frontend tomi-db" -ForegroundColor Gray
Write-Host ""

Set-Location $rootPath