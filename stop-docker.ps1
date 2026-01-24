# TOMI - Stop All Containers Script

Write-Host "Stopping TOMI containers..." -ForegroundColor Yellow

$containers = @("tomi-backend", "tomi-frontend", "tomi-db")

foreach ($container in $containers) {
    $exists = docker ps -a --filter "name=$container" --format "{{.Names}}"
    if ($exists -eq $container) {
        Write-Host "Stopping $container..." -ForegroundColor Gray
        docker stop $container 2>&1 | Out-Null
        Write-Host "✓ Stopped: $container" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "All containers stopped!" -ForegroundColor Green
Write-Host ""
Write-Host "To remove containers: docker rm tomi-backend tomi-frontend tomi-db" -ForegroundColor Gray
Write-Host "To remove network: docker network rm tomi-network" -ForegroundColor Gray