@echo off
setlocal
cd /d "%~dp0"
title Redefinir senha - FinTrack AI
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado.
  pause
  exit /b 1
)
node reset-password.js
pause
