# Author: MiYu. Request a rendered frame from an opted-in native client.
param([Parameter(Mandatory=$true)][string]$AgentDir,[int]$TimeoutSeconds=30)
$ErrorActionPreference='Stop'
if($TimeoutSeconds -lt 1 -or $TimeoutSeconds -gt 120){throw 'TimeoutSeconds must be 1 through 120'}
$directory=(Resolve-Path -LiteralPath $AgentDir).ProviderPath
$id=[Guid]::NewGuid().ToString('N')
$request=Join-Path $directory 'capture.request'
$temp=Join-Path $directory ('request-'+$id+'.tmp')
$ready=Join-Path $directory ('frame-'+$id+'.ready')
$image=Join-Path $directory ('frame-'+$id+'.png')
[IO.File]::WriteAllText($temp,$id,[Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $temp -Destination $request -Force
$deadline=[DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
while([DateTime]::UtcNow -lt $deadline){
    if(Test-Path -LiteralPath $ready){$response=Get-Content -LiteralPath $ready -Raw | ConvertFrom-Json;if(!$response.ok){throw 'Client failed to capture the frame; inspect the client log'};if(!(Test-Path -LiteralPath $image)){throw 'Client reported a missing frame'};[pscustomobject]@{id=$response.id;path=$image;width=$response.width;height=$response.height;frame=$response.frame;scope=$response.scope;presented=$response.presented} | ConvertTo-Json -Compress;exit 0}
    Start-Sleep -Milliseconds 50
}
throw 'Timed out waiting for the game capture response'
