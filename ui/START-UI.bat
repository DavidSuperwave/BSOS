@echo off
cls
echo ============================================
echo    BLITZSCALE OS - UI Launcher
echo ============================================
echo.

REM Check if Node.js is installed
node --version > nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed!
    echo Please install Node.js 18+ from https://nodejs.org
    pause
    exit /b 1
)

echo ✅ Node.js found
echo.

REM Check if dependencies are installed
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ❌ Installation failed!
        pause
        exit /b 1
    )
    echo ✅ Dependencies installed
) else (
    echo ✅ Dependencies already installed
)

echo.
echo 🚀 Starting Blitzscale OS UI...
echo 📱 Dashboard will open at http://localhost:3000
echo.

npm run dev

pause
