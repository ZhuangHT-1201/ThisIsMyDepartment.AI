@echo off
chcp 65001 > nul
echo ==========================================
echo    ThisIsMyDepartment: Fast Start
echo ==========================================

echo [1/3] Starting Python STT backend...
start "STT Python Backend" cmd /k "python scripts/stt_server.py"

echo [2/3] Starting Node.js game server...
start "Node Game Server" cmd /k "npm run server:start"

echo [3/3] Starting Frontend dev server...
start "Frontend Dev Server" cmd /k "npm run compile && set NODE_OPTIONS=--openssl-legacy-provider && npm start"

echo.
echo All services launched. Please wait for "Compiled successfully" in the frontend window.
pause