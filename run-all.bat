@echo off
setlocal
cd /d "%~dp0"

echo [1/6] Starting Smart Parking Hue...
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Please install Node.js LTS first.
  pause
  exit /b 1
)

if not exist "backend\node_modules" (
  echo Installing backend dependencies...
  pushd "backend"
  call npm install
  popd
)

if not exist "frontend\user-map\node_modules" (
  echo Installing user-map dependencies...
  pushd "frontend\user-map"
  call npm install
  popd
)

if not exist "frontend\digitalization-tool\node_modules" (
  echo Installing digitalization-tool dependencies...
  pushd "frontend\digitalization-tool"
  call npm install
  popd
)

if not exist "frontend\ioc-dashboard\node_modules" (
  echo Installing ioc-dashboard dependencies...
  pushd "frontend\ioc-dashboard"
  call npm install
  popd
)

if not exist "frontend\booking\node_modules" (
  echo Installing booking dependencies...
  pushd "frontend\booking"
  call npm install
  popd
)

echo [2/6] Opening backend terminal on port 3002...
start "SmartParking Backend (3002)" cmd /k "cd /d %~dp0backend && set PORT=3002 && npm run dev"

echo [3/6] Opening user-map terminal...
start "SmartParking User Map" cmd /k "cd /d %~dp0frontend\user-map && npm run dev"

echo [4/6] Opening digitalization-tool terminal...
start "SmartParking Digitalization Tool" cmd /k "cd /d %~dp0frontend\digitalization-tool && npm run dev"

echo [5/6] Opening ioc-dashboard terminal...
start "SmartParking IOC Dashboard" cmd /k "cd /d %~dp0frontend\ioc-dashboard && npm run dev"

echo [6/6] Opening booking terminal...
start "SmartParking Booking" cmd /k "cd /d %~dp0frontend\booking && npm run dev"

echo.
echo ============================================
echo Smart Parking Hue started.
echo Backend health: http://localhost:3002/health
echo User Map:          http://localhost:5173/user-map/
echo Digitalization:    http://localhost:5174/digitalization-tool/
echo IOC Dashboard:     http://localhost:5175/ioc-dashboard/
echo Booking:           http://localhost:5176/booking/
echo ============================================
echo.
echo Tip: use stop-all.bat to stop all windows.
echo     Hoac don gian hon: truoc khi chay lai, mo Task Manager -^> tim va kill cac process node.exe con sot.
pause
