# ==============================================================================
# MicroproTeams - Windows PowerShell Local Stack Launcher
# ==============================================================================

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " 🚀 Launching MicroproTeams Application Stack (PowerShell)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Directory: $ProjectDir"

# Start Backend in a new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& '$ProjectDir\run-backend.bat'"

Start-Sleep -Seconds 3

# Start Frontend in a new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& '$ProjectDir\run-frontend.bat'"

Write-Host "✓ Services launched in separate windows." -ForegroundColor Green
Write-Host "  Backend API:  http://localhost:8000"
Write-Host "  Frontend App: http://localhost:3000"

