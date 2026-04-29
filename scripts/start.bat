@echo off
setlocal
set PORT=%1
if "%PORT%"=="" set PORT=3001
echo Starting FitnessTrack on http://localhost:%PORT%
set PORT=%PORT%
node server/index.js
