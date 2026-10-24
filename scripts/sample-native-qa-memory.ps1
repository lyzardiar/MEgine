# Author: MiYu. Read memory counters for the QA editor and its current descendant processes.
param([Parameter(Mandatory=$true)][int]$EditorPid, [Parameter(Mandatory=$true)][string]$ExpectedExecutable)
$ErrorActionPreference='Stop'
$editor=Get-Process -Id $EditorPid
if ([IO.Path]::GetFullPath($editor.Path) -ne [IO.Path]::GetFullPath($ExpectedExecutable)) { throw 'Native QA editor executable mismatch' }
$inventory=Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId
$ids=[System.Collections.Generic.HashSet[int]]::new()
[void]$ids.Add($EditorPid)
do {
  $added=$false
  foreach ($entry in $inventory) { if ($ids.Contains([int]$entry.ParentProcessId) -and $ids.Add([int]$entry.ProcessId)) { $added=$true } }
} while ($added)
$rows=@(foreach ($processId in $ids) {
  $process=Get-Process -Id $processId -ErrorAction SilentlyContinue
  if ($null -ne $process) { [pscustomobject]@{pid=$process.Id;name=$process.ProcessName;privateBytes=$process.PrivateMemorySize64;workingSetBytes=$process.WorkingSet64} }
})
[pscustomobject]@{editorPid=$EditorPid;processes=$rows;privateBytes=($rows|Measure-Object privateBytes -Sum).Sum;summedProcessWorkingSetBytes=($rows|Measure-Object workingSetBytes -Sum).Sum;scope='Editor and current descendants; working sets may count shared pages more than once'} | ConvertTo-Json -Depth 4 -Compress
