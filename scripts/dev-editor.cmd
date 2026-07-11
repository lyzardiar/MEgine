@echo off
cd /d "%~dp0..\packages\editor"
echo Starting MEngine Editor at http://localhost:5173/
:: http://192.168.2.118:5173/
npm.cmd exec -- vite
