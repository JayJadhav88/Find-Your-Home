@echo off
rem Starts Find Your Home on this computer: database, website and phone app server.
rem Double-click this file. Keep the windows it opens running while you test.
rem Docker Desktop must be running first.

cd /d "%~dp0"

echo Checking Docker...
docker info >nul 2>&1
if errorlevel 1 (
  echo Docker Desktop is not running. Start it, wait until it says "Engine running", then run this file again.
  pause
  exit /b 1
)

echo Starting the database (can take a minute)...
call npx.cmd supabase start >nul
if errorlevel 1 (
  echo The database did not start. Run "npx.cmd supabase stop" then this file again.
  pause
  exit /b 1
)

if not exist "apps\web\.next\BUILD_ID" (
  echo Building the website the first time...
  node apps\web\node_modules\next\dist\bin\next build apps\web
)

start "Find Your Home - website" cmd /k node apps\web\node_modules\next\dist\bin\next start apps\web
start "Find Your Home - phone app" /d "%~dp0apps\mobile" cmd /k npx.cmd expo start
rem Sends notifications (including scheduled ones), emails and photo jobs every 30 seconds.
start "Find Your Home - background jobs" /min cmd /k node scripts\run-workers.mjs --watch

echo.
echo Website:   http://localhost:3000   (give it about 10 seconds)
echo Phone app: scan the QR code in the "phone app" window with Expo Go.
echo Background jobs (notifications, emails, photos) run in a third, minimised window.
echo Close the windows to stop.
timeout /t 8 >nul
start "" http://localhost:3000
