@echo off
cd /d "%~dp0"
title EduFin TGI - Servidor local
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
start "" "http://localhost:3000"
echo EduFin aberto em http://localhost:3000
node server.js
pause
