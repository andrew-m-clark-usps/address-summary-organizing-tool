@echo off
echo Applying humanized theme and landing page updates...
powershell -ExecutionPolicy Bypass -File "%~dp0update-theme.ps1"
echo.
echo Done! Open index.html in your browser to see the changes.
pause
