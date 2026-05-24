@echo off
chcp 65001 >nul
title Partani - Setup Vercel Environment Variables

cd /d "%~dp0"

REM Run the PowerShell script that handles everything
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-vercel-env.ps1"
