@echo off
cd /d "%~dp0"
title FinTrack AI - Servidor local
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale o Node.js ou rode em uma maquina com Node instalado.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias...
  npm install
)
start "" "http://127.0.0.1:3000"
echo FinTrack AI aberto em http://127.0.0.1:3000
node server.js
pause
