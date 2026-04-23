@echo off
echo Starting Stock App with public tunnel...
echo.

REM Start backend
start "Backend" cmd /k "cd /d C:\Users\Asus\stock-app\backend && venv\Scripts\activate && uvicorn main:app --host 0.0.0.0 --port 8000"

REM Wait for backend to boot
timeout /t 4 /nobreak >nul

REM Start frontend (no NEXT_PUBLIC_API_URL = uses proxy rewrites)
start "Frontend" cmd /k "cd /d C:\Users\Asus\stock-app\frontend && set NEXT_PUBLIC_API_URL= && npm run dev"

REM Wait for frontend to boot
timeout /t 8 /nobreak >nul

REM Start Cloudflare tunnel - gives you a public URL anyone can visit
echo.
echo ============================================================
echo  Cloudflare tunnel starting...
echo  Look for a line like:  https://xxxx.trycloudflare.com
echo  That is your public link - share it for the presentation!
echo ============================================================
echo.
C:\Users\Asus\stock-app\cloudflared.exe tunnel --url http://localhost:3000
