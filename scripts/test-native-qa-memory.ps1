# Author: MiYu. Reused parent PIDs must not attach older processes to a new native QA editor.
$ErrorActionPreference='Stop'
$tokens=$null; $parseErrors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'sample-native-qa-memory.ps1'),[ref]$tokens,[ref]$parseErrors)
if ($parseErrors.Count) { throw ($parseErrors|Out-String) }
foreach ($name in @('Get-NativeQaCreationTick','Get-NativeQaProcessIdentities')) {
    $definition=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true)
    if ($null -eq $definition) { throw "Missing function $name" }
    . ([scriptblock]::Create($definition.Extent.Text))
}
$birth=[datetime]'2026-10-24T12:00:00Z'
function record($id,$parent,$offset) { [pscustomobject]@{ProcessId=$id;ParentProcessId=$parent;CreationDate=if ($null -eq $offset) {$null} else {$birth.AddSeconds($offset)}} }
$inventory=@((record 1 0 0),(record 2 1 1),(record 3 2 2),(record 4 2 -100),(record 5 4 -99),(record 6 1 -100),(record 7 99 5),(record 8 1 0),(record 9 2 $null))
foreach ($records in @($inventory,@($inventory[8..0]))) {
    $ids=Get-NativeQaProcessIdentities $records 1 $birth
    if (($ids.Keys|Sort-Object) -join ',' -ne '1,2,3,8') { throw "PID ancestry mismatch: $($ids.Keys -join ',')" }
}
foreach ($records in @(@($inventory|Where-Object ProcessId -ne 1),@((record 1 0 1)))) {
    $rejected=$false
    try { Get-NativeQaProcessIdentities $records 1 $birth | Out-Null } catch { $rejected=$true }
    if (!$rejected) { throw 'Changed or missing editor identity must be rejected' }
}
if ((Get-NativeQaCreationTick $birth.AddTicks(9)) -ne (Get-NativeQaCreationTick $birth)) { throw 'CIM microsecond precision mismatch' }
Write-Output 'NATIVE_QA_MEMORY cases=5 passed=5 reusedParentPidExcluded=true reversedInventory=true missingOrChangedRootRejected=true microsecondPrecision=true'
