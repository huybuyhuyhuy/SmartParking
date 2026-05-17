@echo off
echo Stopping Smart Parking Hue terminals...
taskkill /FI "WINDOWTITLE eq SmartParking Backend (3002)" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq SmartParking User Map" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq SmartParking Digitalization Tool" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq SmartParking IOC Dashboard" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq SmartParking Booking" /T /F >nul 2>nul
echo Done.
pause
