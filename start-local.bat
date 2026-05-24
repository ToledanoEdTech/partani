@echo off
chcp 65001 >nul
title Partani - Local Dev Server

echo ============================================================
echo   Partani - Sivta Tzvia Elishiv Lod - Local Dev Server
echo ============================================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [INFO] Node version:
node -v
echo [INFO] NPM version:
call npm -v
echo.

REM Fix for SSL certificate issues on Windows networks
set "NODE_OPTIONS=--use-system-ca"

if not exist "node_modules\vite" (
    echo [INFO] Dependencies not found. Running 'npm install'...
    echo This may take a few minutes on the first run.
    echo.
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed. See errors above.
        pause
        exit /b 1
    )
    echo.
    echo [INFO] Dependencies installed successfully.
    echo.
)

if not exist ".env.local" (
    echo [WARNING] .env.local not found.
    echo The app will not be able to connect to Firebase without it.
    echo Copy .env.example to .env.local and fill in your Firebase config.
    echo.
)

echo ============================================================
echo   Starting the development server...
echo   The app will open at: http://localhost:3000
echo   Press Ctrl+C to stop the server.
echo ============================================================
echo.

start "" "http://localhost:3000"

call npm run dev

echo.
echo [INFO] Server stopped.
pause
