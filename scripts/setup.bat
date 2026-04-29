@echo off
setlocal
echo === FitnessTrack setup ===

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js not found. Download it from https://nodejs.org and re-run this script.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do echo Node %%i

echo Installing dependencies...
call npm install
cd client
call npm install
cd ..

echo Building client...
call npm run build

echo Setting up database...
call npm run setup

echo.
echo Setup complete.
echo Run start.bat to launch FitnessTrack on port 3001.
pause
