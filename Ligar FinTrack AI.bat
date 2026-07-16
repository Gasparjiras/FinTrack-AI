@echo off
setlocal
cd /d "%~dp0"
title FinTrack AI
echo Iniciando FinTrack AI...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$project = '%~dp0'; $listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if (-not $listener) { Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory $project -WindowStyle Hidden; Start-Sleep -Seconds 2 }; Start-Process 'http://localhost:3000'"
exit /b
