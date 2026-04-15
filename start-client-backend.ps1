# Start Client Backend Service

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  STARTING CLIENT BACKEND (PORT 5001)" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

$clientBackendPath = "C:\Users\LOKI\OneDrive\Desktop\Dechta-main\Dechta-main\dechta-client\backend"

if (Test-Path $clientBackendPath) {
    Write-Host "✅ Client backend directory found" -ForegroundColor Green
    Write-Host ""
    
    Set-Location $clientBackendPath
    
    Write-Host "Starting npm start..." -ForegroundColor Yellow
    npm start
} else {
    Write-Host "❌ Client backend directory not found at:" -ForegroundColor Red
    Write-Host "   $clientBackendPath" -ForegroundColor Red
}
