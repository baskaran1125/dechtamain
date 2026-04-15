@echo off
echo.
echo ======================================================================
echo   STARTING ALL DECHTA SERVICES
echo ======================================================================
echo.

REM Terminal 1: Vendor Backend (port 5000)
echo Starting Vendor Backend (port 5000)...
start cmd /k "cd C:\Users\LOKI\OneDrive\Desktop\Dechta-main\Dechta-main\DechtaService-main\backend && npm start"

REM Wait for terminal to open
timeout /t 2 /nobreak

REM Terminal 2: Client Backend (port 5001)
echo Starting Client Backend (port 5001)...
start cmd /k "cd C:\Users\LOKI\OneDrive\Desktop\Dechta-main\Dechta-main\dechta-client\backend && npm start"

REM Wait for terminal to open
timeout /t 2 /nobreak

echo.
echo ======================================================================
echo Both backends started! Check the terminals for status.
echo ======================================================================
echo.
pause
