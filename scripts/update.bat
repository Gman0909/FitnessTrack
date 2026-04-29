@echo off
echo === FitnessTrack update ===

echo Pulling latest changes...
git pull
if errorlevel 1 ( echo git pull failed & exit /b 1 )

echo Installing dependencies...
npm install
if errorlevel 1 ( echo npm install failed & exit /b 1 )

cd client
npm install
if errorlevel 1 ( echo client npm install failed & exit /b 1 )
cd ..

echo Building client...
npm run build
if errorlevel 1 ( echo Build failed & exit /b 1 )

echo.
echo Update complete.
echo Restart the server (npm start) to apply the update.
echo If running as a Windows service: nssm restart FitnessTrack
