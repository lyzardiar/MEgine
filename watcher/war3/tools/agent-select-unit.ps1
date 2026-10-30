# Author: MiYu. Select a visible unit in an opted-in running client.
param([Parameter(Mandatory=$true)][string]$AgentDir,[Parameter(Mandatory=$true)][string]$UnitType,[int]$TimeoutSeconds=30)
$ErrorActionPreference='Stop'
if($TimeoutSeconds -lt 1 -or $TimeoutSeconds -gt 120){throw 'TimeoutSeconds must be 1 through 120'}
if($UnitType -notmatch '^[!-~]{4}$'){throw 'UnitType must be four printable ASCII characters'}
$directory=(Resolve-Path -LiteralPath $AgentDir).ProviderPath
$id=[Guid]::NewGuid().ToString('N')
$encoded=-join ([Text.Encoding]::ASCII.GetBytes($UnitType) | ForEach-Object { $_.ToString('x2') })
$request=Join-Path $directory 'select.request'
$temp=Join-Path $directory ('selection-request-'+$id+'.tmp')
$ready=Join-Path $directory ('selection-'+$id+'.ready')
[IO.File]::WriteAllText($temp,($id+':'+$encoded),[Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $temp -Destination $request -Force
$deadline=[DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
while([DateTime]::UtcNow -lt $deadline){
    if(Test-Path -LiteralPath $ready){$response=[IO.File]::ReadAllText($ready,[Text.Encoding]::UTF8) | ConvertFrom-Json;if(!$response.ready){throw 'Client is not in a game'};if(!$response.ok){throw 'Unit not visible or selection unavailable'};[pscustomobject]@{id=$response.id;type=$UnitType;handle=$response.handle;frame=$response.frame} | ConvertTo-Json -Compress;exit 0}
    Start-Sleep -Milliseconds 50
}
throw 'Timed out waiting for the game selection response'
