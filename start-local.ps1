# Partani - Local Dev Server (PowerShell)
# Usage: Right-click -> "Run with PowerShell", or in a terminal:  ./start-local.ps1

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "Partani - Local Dev Server"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Partani - Sivta Tzvia Elishiv Lod - Local Dev Server" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location -Path $PSScriptRoot

# Fix for SSL certificate issues on Windows networks
$env:NODE_OPTIONS = "--use-system-ca"

# Check Node.js
try {
    $nodeVersion = node -v
    $npmVersion = npm -v
    Write-Host "[INFO] Node version: $nodeVersion" -ForegroundColor Green
    Write-Host "[INFO] NPM  version: $npmVersion" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "[ERROR] Node.js is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Install dependencies if needed (check for vite specifically since npm install can crash mid-way)
if (-not (Test-Path -Path "node_modules\vite")) {
    Write-Host "[INFO] Dependencies not found. Running 'npm install'..." -ForegroundColor Yellow
    Write-Host "This may take a few minutes on the first run." -ForegroundColor Yellow
    Write-Host ""
    npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[ERROR] npm install failed. See errors above." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host ""
    Write-Host "[INFO] Dependencies installed successfully." -ForegroundColor Green
    Write-Host ""
}

# Warn if no .env.local
if (-not (Test-Path -Path ".env.local")) {
    Write-Host "[WARNING] .env.local not found." -ForegroundColor Yellow
    Write-Host "The app will not be able to connect to Firebase without it." -ForegroundColor Yellow
    Write-Host "Copy .env.example to .env.local and fill in your Firebase config." -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Starting the development server..." -ForegroundColor Cyan
Write-Host "  The app will open at: http://localhost:3000" -ForegroundColor Cyan
Write-Host "  Press Ctrl+C to stop the server." -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Open the browser after a small delay (in the background)
Start-Job -ScriptBlock {
    Start-Sleep -Seconds 4
    Start-Process "http://localhost:3000"
} | Out-Null

npm run dev
