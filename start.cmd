@echo off
cd /d "%~dp0"
echo Starting Jobseeker at http://localhost:4173
node server.mjs
pause
