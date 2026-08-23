$projectDir = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectDir ".dev-server.pid"
$stopped = $false

if (Test-Path -LiteralPath $pidFile) {
    $savedPid = Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue
    if ($savedPid -match "^\d+$") {
        Stop-Process -Id ([int]$savedPid) -Force -ErrorAction SilentlyContinue
        $stopped = $true
    }
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    $listener | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
        $stopped = $true
    }
}

if ($stopped) {
    Write-Host "Đã dừng CHỦ NHIỆM SỐ." -ForegroundColor Green
} else {
    Write-Host "Ứng dụng hiện không chạy." -ForegroundColor Yellow
}
