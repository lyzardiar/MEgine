@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0.."
set "REPO_ROOT=%CD%"
set "INSTALLER_DIR=%REPO_ROOT%\target\release\bundle\nsis"

echo [MEngine] Checking the editor build environment...

where node.exe >nul 2>&1
if errorlevel 1 goto :missing_environment

for /f %%V in ('node.exe -p "Number(process.versions.node.split('.')[0])"') do set "NODE_MAJOR=%%V"
if not defined NODE_MAJOR goto :missing_environment
if !NODE_MAJOR! LSS 20 (
    echo ERROR: MEngine requires Node.js 20 or newer. Current major version: !NODE_MAJOR!.
    exit /b 1
)

where pnpm.cmd >nul 2>&1
if errorlevel 1 goto :missing_environment

where cargo.exe >nul 2>&1
if errorlevel 1 goto :missing_environment

if not exist "%REPO_ROOT%\node_modules\.pnpm" goto :missing_environment

set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
set "VS_VCTOOLS="
if exist "%VSWHERE%" (
    for /f "usebackq delims=" %%I in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VS_VCTOOLS=%%I"
)
if not defined VS_VCTOOLS goto :missing_environment

echo [MEngine] Building the Windows release executable and NSIS installer...
call npm.cmd --prefix packages\editor run tauri:build -- --bundles nsis
if errorlevel 1 (
    echo ERROR: Editor packaging failed.
    exit /b 1
)

set "EDITOR_INSTALLER="
if exist "%INSTALLER_DIR%" (
    for /f "delims=" %%F in ('dir /b /a:-d /o:-d "%INSTALLER_DIR%\*.exe" 2^>nul') do if not defined EDITOR_INSTALLER set "EDITOR_INSTALLER=%INSTALLER_DIR%\%%F"
)

if not defined EDITOR_INSTALLER (
    echo ERROR: Tauri completed, but no NSIS installer was found under:
    echo        %INSTALLER_DIR%
    exit /b 1
)

echo.
echo [MEngine] Editor EXE packaging completed:
echo !EDITOR_INSTALLER!
exit /b 0

:missing_environment
echo ERROR: The editor build environment is incomplete.
echo Run scripts\install-editor-build-env.cmd first, then open a new terminal if requested.
exit /b 1
