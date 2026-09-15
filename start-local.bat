@echo off
setlocal EnableExtensions
title Partani - Local Dev Server
cd /d "%~dp0"

echo ============================================================
echo   Partani - Local Dev Server
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Download it from https://nodejs.org/ and restart this file.
    echo.
    pause
    exit /b 1
)

echo [INFO] Node version:
node -v
echo [INFO] NPM version:
call npm -v
echo.

REM Only set this flag when the installed Node actually supports it.
node --use-system-ca -e "process.exit(0)" >nul 2>nul
if not errorlevel 1 (
    set "NODE_OPTIONS=--use-system-ca"
)

if not exist ".env.local" (
    echo [ERROR] Missing .env.local in this folder.
    echo The app needs Firebase config to sign in.
    echo Copy .env.example to .env.local and fill in VITE_FIREBASE_* values.
    echo.
    pause
    exit /b 1
)

findstr /b "VITE_FIREBASE_API_KEY=" ".env.local" >nul
if errorlevel 1 (
    echo [ERROR] .env.local is missing VITE_FIREBASE_API_KEY.
    echo Open .env.local and fill in the VITE_FIREBASE_* values from .env.example.
    echo.
    pause
    exit /b 1
)
echo [INFO] .env.local found.

REM Free port 3000 if a previous run is still listening.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Write-Host ('[INFO] Stopping previous server on port 3000 (PID ' + $_.OwningProcess + ')...'); Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

if not exist "node_modules\vite" (
    echo [INFO] Installing dependencies. This can take a few minutes the first time.
    echo.
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed. See the errors above.
        echo.
        pause
        exit /b 1
    )
    echo.
    echo [INFO] Dependencies installed.
    echo.
)

echo ============================================================
echo   Starting http://localhost:3000
echo   Press Ctrl+C to stop the server.
echo ============================================================
echo.

REM Open the browser after the server has a moment to boot.
start "" cmd /c "timeout /t 5 /nobreak >nul & start http://localhost:3000"

call npm run dev
set "DEV_EXIT=%ERRORLEVEL%"

echo.
if not "%DEV_EXIT%"=="0" (
    echo [ERROR] The dev server exited with code %DEV_EXIT%.
)
echo [INFO] Server stopped.
pause
exit /b %DEV_EXIT%
