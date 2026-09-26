param([switch]$Lan, [ValidateRange(1,65535)][int]$Port = 7777)
$bindAddress = if ($Lan) { '0.0.0.0' } else { '127.0.0.1' }
& node (Join-Path $PSScriptRoot 'server.mjs') --host $bindAddress --port $Port
exit $LASTEXITCODE
