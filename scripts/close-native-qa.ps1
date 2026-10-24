# Author: MiYu. Close the unique main window of one verified background QA editor.
param([int]$EditorPid,[Parameter(Mandatory=$true)][string]$DiscoveryFile,[string]$ExpectedExecutable)
$ErrorActionPreference='Stop'
if(-not [IO.Path]::IsPathFullyQualified($DiscoveryFile)){throw 'DiscoveryFile must be absolute'}
$record=Get-Content -LiteralPath $DiscoveryFile -Raw | ConvertFrom-Json
if($record.pid -ne $EditorPid -or $record.background -ne $true -or $record.runtimeIdentifier -notlike 'com.mengine.editor.agent-*'){throw 'Editor ownership mismatch'}
if($ExpectedExecutable){
    if(-not [IO.Path]::IsPathFullyQualified($ExpectedExecutable)){throw 'ExpectedExecutable must be absolute'}
    if((Get-Process -Id $EditorPid).Path -ne [IO.Path]::GetFullPath($ExpectedExecutable)){throw 'Editor executable ownership mismatch'}
}elseif((Get-Process -Id $EditorPid).ProcessName -ne 'mengine-editor-tauri'){throw 'Editor PID was reused'}
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class NativeQaClose {
    public delegate bool Callback(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll")] public static extern bool EnumWindows(Callback callback, IntPtr parameter);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr wparam, IntPtr lparam);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr window, StringBuilder text, int capacity);
}
'@
$script:matches=[Collections.Generic.List[IntPtr]]::new()
[NativeQaClose]::EnumWindows({param($window,$parameter)
    [uint32]$owner=0
    [void][NativeQaClose]::GetWindowThreadProcessId($window,[ref]$owner)
    if($owner -eq $EditorPid){$title=[Text.StringBuilder]::new(512);[void][NativeQaClose]::GetWindowText($window,$title,512);if($title.ToString() -eq 'MEngine Editor'){$script:matches.Add($window)}}
    return $true
},[IntPtr]::Zero) | Out-Null
if($script:matches.Count -ne 1){throw 'Expected exactly one owned main window'}
if(-not [NativeQaClose]::PostMessage($script:matches[0],0x0010,[IntPtr]::Zero,[IntPtr]::Zero)){throw 'WM_CLOSE failed'}
