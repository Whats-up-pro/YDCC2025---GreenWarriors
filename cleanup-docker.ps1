# TOMI - Fast Cleanup Script (Force Remove)

Write-Host "Fast cleanup TOMI Docker resources..." -ForegroundColor Yellow
Write-Host ""

# Force stop and remove containers in parallel (fast)
Write-Host "Force removing containers..." -ForegroundColor Yellow
docker rm -f tomi-backend tomi-frontend tomi-db 2>&1 | Out-Null
Write-Host "✓ Containers removed" -ForegroundColor Green

# Force remove images (fast, ignores if in use or missing)
Write-Host "Force removing images (this may take 10-30 seconds for large images)..." -ForegroundColor Yellow
docker rmi -f tomi-backend:latest tomi-frontend:latest 2>&1 | Out-Null
Write-Host "✓ Images removed" -ForegroundColor Green

# Remove network
Write-Host "Removing network..." -ForegroundColor Yellow
docker network rm tomi-network 2>&1 | Out-Null
Write-Host "✓ Network removed" -ForegroundColor Green

# Optional: Clean dangling images and build cache
Write-Host ""
$cleanCache = Read-Host "Clean dangling images and build cache? (y/N)"
if ($cleanCache -eq "y" -or $cleanCache -eq "Y") {
    Write-Host "Cleaning dangling images..." -ForegroundColor Yellow
    docker image prune -f 2>&1 | Out-Null
    Write-Host "Cleaning build cache..." -ForegroundColor Yellow
    docker builder prune -f 2>&1 | Out-Null
    Write-Host "✓ Cache cleaned" -ForegroundColor Green
}

Write-Host ""
Write-Host "Fast cleanup complete!" -ForegroundColor Green
