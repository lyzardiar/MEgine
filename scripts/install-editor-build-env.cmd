@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0.."
set "REPO_ROOT=%CD%"

echo [MEngine] Installing the Windows editor build environment...

set "WINGET_EXE="
where winget.exe >nul 2>&1
if not errorlevel 1 (
    set "WINGET_EXE=winget.exe"
) else if exist "%LOCALAPPDATA%\Microsoft\WindowsApps\winget.exe" (
    set "WINGET_EXE=%LOCALAPPDATA%\Microsoft\WindowsApps\winget.exe"
)

if not defined WINGET_EXE (
    echo ERROR: winget was not found. Install Microsoft App Installer, then run this command again.
    echo        https://apps.microsoft.com/detail/9NBLGGH4NNS1
    exit /b 1
)

call :node_is_supported
if errorlevel 1 (
    call :install_package OpenJS.NodeJS.LTS "Node.js LTS"
    if errorlevel 1 exit /b 1
) else (
    echo [MEngine] Node.js 20 or newer is already available; skipping installation.
)

where rustup.exe >nul 2>&1
if errorlevel 1 (
    call :install_package Rustlang.Rustup "Rustup"
    if errorlevel 1 exit /b 1
) else (
    echo [MEngine] Rustup is already available; skipping installation.
)

call :package_is_installed Microsoft.EdgeWebView2Runtime
if errorlevel 1 (
    call :install_package Microsoft.EdgeWebView2Runtime "Microsoft Edge WebView2 Runtime"
    if errorlevel 1 exit /b 1
) else (
    echo [MEngine] Microsoft Edge WebView2 Runtime is already installed; skipping installation.
)

call :ensure_msvc
if errorlevel 1 exit /b 1

rem Refresh the tools installed by winget for this command window.
set "PATH=%ProgramFiles%\nodejs;%LOCALAPPDATA%\Programs\nodejs;%USERPROFILE%\.cargo\bin;%APPDATA%\npm;%PATH%"

where node.exe >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js was installed but is not available on PATH. Open a new terminal and run this command again.
    exit /b 1
)

for /f %%V in ('node.exe -p "Number(process.versions.node.split('.')[0])"') do set "NODE_MAJOR=%%V"
if not defined NODE_MAJOR (
    echo ERROR: Unable to read the Node.js version.
    exit /b 1
)
if !NODE_MAJOR! LSS 20 (
    echo ERROR: MEngine requires Node.js 20 or newer. Current major version: !NODE_MAJOR!.
    exit /b 1
)

where rustup.exe >nul 2>&1
if errorlevel 1 (
    echo ERROR: Rustup was installed but is not available on PATH. Open a new terminal and run this command again.
    exit /b 1
)

echo [MEngine] Selecting the stable MSVC Rust toolchain...
call rustup.exe default stable-msvc
if errorlevel 1 exit /b 1

call :pnpm_is_supported
if errorlevel 1 (
    echo [MEngine] Installing pnpm 11...
    call npm.cmd install --global pnpm@11
    if errorlevel 1 exit /b 1
) else (
    echo [MEngine] pnpm 10 or newer is already available; skipping installation.
)

echo [MEngine] Installing JavaScript dependencies from pnpm-lock.yaml...
call pnpm.cmd install --frozen-lockfile
if errorlevel 1 exit /b 1

echo [MEngine] Downloading Rust dependencies from Cargo.lock...
call cargo.exe fetch --locked
if errorlevel 1 exit /b 1

echo.
echo [MEngine] Environment installation completed.
echo [MEngine] Build the editor with: scripts\build-editor-exe.cmd
exit /b 0

:install_package
echo [MEngine] Ensuring %~2 is installed...
"%WINGET_EXE%" install --id %~1 --exact --source winget --accept-source-agreements --accept-package-agreements --silent
if not errorlevel 1 exit /b 0

rem "Already installed" can use a non-zero winget result on some versions.
call :package_is_installed %~1
if not errorlevel 1 exit /b 0

echo ERROR: Failed to install %~2 ^(%~1^).
exit /b 1

:package_is_installed
"%WINGET_EXE%" list --id %~1 --exact --source winget --accept-source-agreements >nul 2>&1
exit /b %ERRORLEVEL%

:node_is_supported
set "LOCAL_NODE_MAJOR="
where node.exe >nul 2>&1
if errorlevel 1 exit /b 1
for /f %%V in ('node.exe -p "Number(process.versions.node.split('.')[0])"') do set "LOCAL_NODE_MAJOR=%%V"
if not defined LOCAL_NODE_MAJOR exit /b 1
if !LOCAL_NODE_MAJOR! LSS 20 exit /b 1
exit /b 0

:pnpm_is_supported
set "LOCAL_PNPM_MAJOR="
where pnpm.cmd >nul 2>&1
if errorlevel 1 exit /b 1
for /f "tokens=1 delims=." %%V in ('pnpm.cmd --version') do set "LOCAL_PNPM_MAJOR=%%V"
if not defined LOCAL_PNPM_MAJOR exit /b 1
if !LOCAL_PNPM_MAJOR! LSS 10 exit /b 1
exit /b 0

:ensure_msvc
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
call :find_vctools
if defined VS_VCTOOLS exit /b 0

echo [MEngine] Installing Visual Studio 2022 C++ Build Tools and the Windows SDK...
"%WINGET_EXE%" install --id Microsoft.VisualStudio.2022.BuildTools --exact --source winget --accept-source-agreements --accept-package-agreements --silent --override "--wait --passive --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"

call :find_vctools
if defined VS_VCTOOLS exit /b 0

rem A pre-existing Visual Studio installation may need its C++ workload added.
set "VS_INSTALL="
if exist "%VSWHERE%" (
    for /f "usebackq delims=" %%I in (`"%VSWHERE%" -latest -products * -property installationPath`) do set "VS_INSTALL=%%I"
)
if defined VS_INSTALL if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\setup.exe" (
    echo [MEngine] Adding the C++ workload to !VS_INSTALL!...
    "%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\setup.exe" modify --installPath "!VS_INSTALL!" --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive --norestart
)

call :find_vctools
if defined VS_VCTOOLS exit /b 0

echo ERROR: Visual Studio C++ Build Tools are unavailable. Re-run this command as Administrator.
exit /b 1

:find_vctools
set "VS_VCTOOLS="
if exist "%VSWHERE%" (
    for /f "usebackq delims=" %%I in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VS_VCTOOLS=%%I"
)
exit /b 0
