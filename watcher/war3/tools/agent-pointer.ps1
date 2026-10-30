# Author: MiYu. Send pointer input to an opted-in background game client.
param([Parameter(Mandatory=$true)][string]$AgentDir,[Parameter(Mandatory=$true)][ValidateSet('click','right','drag')][string]$Action,[Parameter(Mandatory=$true)][int]$X,[Parameter(Mandatory=$true)][int]$Y,[int]$ToX=-1,[int]$ToY=-1,[int]$TimeoutSeconds=30)
$ErrorActionPreference='Stop'
if($TimeoutSeconds -lt 1 -or $TimeoutSeconds -gt 120){throw 'TimeoutSeconds must be 1 through 120'}
if($Action -ne 'drag'){$ToX=$X;$ToY=$Y}
if($X -lt 0 -or $X -gt 799 -or $ToX -lt 0 -or $ToX -gt 799 -or $Y -lt 0 -or $Y -gt 599 -or $ToY -lt 0 -or $ToY -gt 599){throw 'Coordinates must be within 0..799, 0..599'}
$directory=(Resolve-Path -LiteralPath $AgentDir).ProviderPath
$id=[Guid]::NewGuid().ToString('N')
$request=Join-Path $directory 'pointer.request'
$temp=Join-Path $directory ('pointer-request-'+$id+'.tmp')
$ready=Join-Path $directory ('pointer-'+$id+'.ready')
[IO.File]::WriteAllText($temp,($id+':'+$Action+':'+$X+':'+$Y+':'+$ToX+':'+$ToY),[Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $temp -Destination $request -Force
$deadline=[DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
while([DateTime]::UtcNow -lt $deadline){
    if(Test-Path -LiteralPath $ready){$response=[IO.File]::ReadAllText($ready,[Text.Encoding]::UTF8) | ConvertFrom-Json;if(!$response.ok){throw 'Pointer input unavailable: client must be in an interactive single-player game and not in the foreground'};$response | ConvertTo-Json -Compress;exit 0}
    Start-Sleep -Milliseconds 50
}
throw 'Timed out waiting for the game pointer response'
