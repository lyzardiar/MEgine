# Author: MiYu. Verify the packaged Release files, then check Player startup for 30 seconds.
param([string]$RuntimePath = '')
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$packageDir = Join-Path $repo 'samples/frostbound-realms/Builds/windows-x64'
$evidence = Join-Path $repo 'docs/designs/frostbound-realms'
$manifest = Get-Content (Join-Path $packageDir 'mengine-build.json') -Raw | ConvertFrom-Json
foreach ($entry in $manifest.files) {
    $file = Join-Path $packageDir $entry.path
    if ((Get-Item -LiteralPath $file).Length -ne $entry.size -or (Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant() -ne $entry.sha256) { throw "Package mismatch: $($entry.path)" }
}
$executable = Join-Path $packageDir $manifest.executable
if (!$RuntimePath) { $RuntimePath = Join-Path $repo 'target/release/mengine-runtime.exe' }
if ((Get-FileHash -LiteralPath $executable).Hash -ne (Get-FileHash -LiteralPath $RuntimePath).Hash) { throw 'Runtime mismatch' }
$stdout = Join-Path $evidence 'player-stdout.txt'
$stderr = Join-Path $evidence 'player-stderr.txt'
$started = Get-Date
$player = Start-Process -FilePath $executable -WorkingDirectory $packageDir -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
try {
    Start-Sleep -Seconds 30
    $player.Refresh()
    $errors = @(Select-String -LiteralPath $stderr,$stdout -Pattern '\bERROR\b').Count
    $report = [ordered]@{contentHash=$manifest.contentHash;windowTitle=$player.MainWindowTitle;responding=$player.Responding;audioListening=$false;shutdown='Only this smoke-check process was stopped';elapsedSeconds=30;scope='Packaged Release startup and responsiveness; gameplay interaction is verified in separate native QA reports';alive=(!$player.HasExited);packageValidationPassed=$true;startedAt=$started.ToString('o');processId=$player.Id;packagedFiles=$manifest.files.Count;executable=$executable;checkedAt=(Get-Date).ToString('o');physicalInput=$false;loggedErrors=$errors}
    $report | ConvertTo-Json | Set-Content (Join-Path $evidence 'player-smoke.json') -Encoding utf8
    if ($player.HasExited -or !$player.Responding -or $player.MainWindowTitle -ne 'Frostbound Realms' -or $errors) { throw 'Player smoke failed' }
    $report | ConvertTo-Json
} finally { if (!$player.HasExited) { Stop-Process -Id $player.Id } }
