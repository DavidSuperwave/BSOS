@echo off
echo ==========================================
echo   BLITZSCALE OS - Quick Start
echo ==========================================
echo.
echo Starting GTM Engine cron scheduler...
echo.
cd /d "%~dp0"
node cron-scheduler.js
pause
