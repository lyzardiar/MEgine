@echo off
setlocal
set "WAR3_EXE=%~dp0build\windows-x86\bin\Release\war3.exe"
set "WAR3_DATA=E:\Program Files (x86)\dzclient\Game\Warcraft III Frozen Throne"
set "WAR3_MAP=%~f1"

if not exist "%WAR3_EXE%" (
    echo War3 client not found: "%WAR3_EXE%"
    pause
    exit /b 1
)
if not exist "%WAR3_DATA%\War3.mpq" (
    echo Warcraft III data not found: "%WAR3_DATA%"
    pause
    exit /b 1
)
if not "%~1"=="" if not exist "%WAR3_MAP%" (
    echo Map not found: "%WAR3_MAP%"
    pause
    exit /b 1
)

pushd "%~dp0"
if "%~1"=="" (
    start "" /wait "%WAR3_EXE%" --data-root "%WAR3_DATA%"
) else (
    start "" /wait "%WAR3_EXE%" --data-root "%WAR3_DATA%" --map "%WAR3_MAP%" --play
)
set "WAR3_EXIT=%ERRORLEVEL%"
popd
if not "%WAR3_EXIT%"=="0" (
    echo War3 exited with code %WAR3_EXIT%. See "%LOCALAPPDATA%\MEgine\War3\Logs\client.log"
    pause
)
exit /b %WAR3_EXIT%
