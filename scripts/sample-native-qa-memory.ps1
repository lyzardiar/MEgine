# Author: MiYu. Read memory counters for the QA editor and its current descendant processes.
param([Parameter(Mandatory=$true)][int]$EditorPid, [Parameter(Mandatory=$true)][string]$ExpectedExecutable)
$ErrorActionPreference='Stop'
function Get-NativeQaCreationTick([datetime]$Created) { $ticks=$Created.ToUniversalTime().Ticks; $ticks-($ticks%10) }
function Get-NativeQaProcessIdentities([object[]]$Inventory,[int]$RootId,[datetime]$RootCreated) {
    $records=@{}
    foreach ($entry in $Inventory) { if ($null -ne $entry.CreationDate) { $records[[int]$entry.ProcessId]=$entry } }
    $rootTick=Get-NativeQaCreationTick $RootCreated
    if (!$records.ContainsKey($RootId) -or (Get-NativeQaCreationTick $records[$RootId].CreationDate) -ne $rootTick) { throw 'Native QA editor process identity changed' }
    $ids=[System.Collections.Generic.Dictionary[int,long]]::new(); $ids.Add($RootId,$rootTick)
    do {
        $added=$false
        foreach ($entry in $records.Values) {
            $parent=[int]$entry.ParentProcessId; $child=[int]$entry.ProcessId
            if (!$ids.ContainsKey($parent) -or $ids.ContainsKey($child)) { continue }
            $created=Get-NativeQaCreationTick $entry.CreationDate
            if ($created -ge $ids[$parent]) { $ids.Add($child,$created); $added=$true }
        }
    } while ($added)
    return ,$ids
}
$editor=Get-Process -Id $EditorPid
if ([IO.Path]::GetFullPath($editor.Path) -ne [IO.Path]::GetFullPath($ExpectedExecutable)) { throw 'Native QA editor executable mismatch' }
$created=$editor.StartTime
$inventory=Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CreationDate
$ids=Get-NativeQaProcessIdentities $inventory $EditorPid $created
$rows=@(foreach ($processId in $ids.Keys) {
  $process=Get-Process -Id $processId -ErrorAction SilentlyContinue
  if ($null -eq $process) { continue }
  try { $currentTick=Get-NativeQaCreationTick $process.StartTime } catch { continue }
  if ($currentTick -ne $ids[$processId]) { continue }
  $row=[pscustomobject]@{pid=$process.Id;name=$process.ProcessName;createdUtc=$process.StartTime.ToUniversalTime().ToString('o');privateBytes=$process.PrivateMemorySize64;workingSetBytes=$process.WorkingSet64}
  $verified=Get-Process -Id $processId -ErrorAction SilentlyContinue
  try { if ($null -ne $verified -and (Get-NativeQaCreationTick $verified.StartTime) -eq $currentTick) { $row } } catch { continue }
})
$currentEditor=Get-Process -Id $EditorPid
if ((Get-NativeQaCreationTick $currentEditor.StartTime) -ne (Get-NativeQaCreationTick $created) -or !($rows|Where-Object pid -eq $EditorPid)) { throw 'Native QA editor process identity changed during sampling' }
[pscustomobject]@{samplingSchemaVersion=2;editorPid=$EditorPid;editorCreatedUtc=$created.ToUniversalTime().ToString('o');processes=$rows;privateBytes=($rows|Measure-Object privateBytes -Sum).Sum;summedProcessWorkingSetBytes=($rows|Measure-Object workingSetBytes -Sum).Sum;scope='Editor and live parent chains validated by creation time; orphaned processes excluded; working sets may count shared pages more than once'} | ConvertTo-Json -Depth 4 -Compress
