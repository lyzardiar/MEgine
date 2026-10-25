@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
set "mengineSetupExit=%ERRORLEVEL%"
pause
exit /b %mengineSetupExit%
