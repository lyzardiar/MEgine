# Author: MiYu. Build the pinned PKWARE decoder with the installed Microsoft compiler.
param([string]$Output = '')
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$outputPath = if ($Output) { [IO.Path]::GetFullPath($Output) } else { Join-Path $repoRoot 'tmp/warcraft-compression/blast.exe' }
$outputFolder = Split-Path $outputPath -Parent
New-Item -ItemType Directory -Force -Path $outputFolder | Out-Null
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$installation) { throw 'Microsoft C++ build tools are required to build the PKWARE reader.' }
$environmentScript = Join-Path $installation 'Common7/Tools/VsDevCmd.bat'
$source = Join-Path $PSScriptRoot 'warcraft-compression/blast-cli.c'
$library = Join-Path $repoRoot 'third_party/blast'
foreach ($path in @($outputPath, $outputFolder, $environmentScript, $source, $library)) { if ($path -match '[%"&|<>^]') { throw 'Compiler paths contain unsupported shell characters.' } }
$command = 'call "' + $environmentScript + '" -arch=x64 -host_arch=x64 >nul && cl.exe /nologo /O2 /W4 /I"' + $library + '" "' + $source + '" "' + (Join-Path $library 'blast.c') + '" /Fe"' + $outputPath + '"'
Push-Location $outputFolder
try { & $env:COMSPEC /d /s /c $command } finally { Pop-Location }
if ($LASTEXITCODE) { throw "PKWARE reader build failed: $LASTEXITCODE" }
Write-Output "Built PKWARE reader: $outputPath"
