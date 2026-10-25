# Author: MiYu. Configure the current user's Warcraft resource directory for map imports.
param([string]$GameDirectory, [switch]$SessionOnly)
$ErrorActionPreference = 'Stop'
$variableName = 'MENGINE_WARCRAFT_ROOT'
$archives = @('War3Patch.mpq', 'War3xLocal.mpq', 'War3x.mpq', 'war3.mpq')
$interactive = [string]::IsNullOrWhiteSpace($GameDirectory)

function Resolve-WarcraftDirectory([string]$Value) {
    $expanded = [Environment]::ExpandEnvironmentVariables($Value.Trim().Trim('"'))
    $directory = Get-Item -LiteralPath $expanded -ErrorAction Stop
    if (!$directory.PSIsContainer) { throw '请选择直接包含 MPQ 文件的文件夹。' }
    $missing = @($archives | Where-Object { !(Test-Path -LiteralPath (Join-Path $directory.FullName $_) -PathType Leaf) })
    if ($missing.Count) { throw ('该目录缺少：' + ($missing -join ', ')) }
    return $directory.FullName
}

if ($interactive) {
    Write-Host '配置 Warcraft III 公共资源目录'
    Write-Host ('请选择直接包含以下文件的目录：' + ($archives -join ', '))
    $current = [Environment]::GetEnvironmentVariable($variableName, 'User')
    if (!$current) { $current = [Environment]::GetEnvironmentVariable($variableName, 'Process') }
    if ($current) { Write-Host ('当前目录：' + $current) }
    Write-Host '输入目录路径；直接回车保留当前配置，没有当前配置时退出。'
}

while ($true) {
    if ($interactive) {
        $GameDirectory = Read-Host '魔兽公共资源目录'
        if ([string]::IsNullOrWhiteSpace($GameDirectory)) {
            if (!$current) { Write-Host '未设置公共资源目录。'; return }
            $GameDirectory = $current
        }
    }
    try { $resolved = Resolve-WarcraftDirectory $GameDirectory; break }
    catch { if (!$interactive) { throw }; Write-Warning $_.Exception.Message }
}

if (!$SessionOnly) { [Environment]::SetEnvironmentVariable($variableName, $resolved, 'User') }
[Environment]::SetEnvironmentVariable($variableName, $resolved, 'Process')
Write-Host ($variableName + '=' + $resolved)
if ($SessionOnly) { Write-Host '已设置当前 PowerShell 进程的环境变量。' }
else { Write-Host '已保存到当前 Windows 用户环境变量，无需管理员权限。' }
Write-Host '现在可以打开 sample 导入地图。已运行的编辑器若持有旧的同名环境变量，请完全退出后重新启动。'
