$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDir

function Test-WebReady {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3000/dang-nhap" -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Máy chưa có Node.js. Vui lòng liên hệ người hỗ trợ." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path -LiteralPath "$projectDir\package.json")) {
    Write-Host "Không tìm thấy package.json trong thư mục ứng dụng." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path -LiteralPath "$projectDir\.env")) {
    if (Test-Path -LiteralPath "$projectDir\.env.example") {
        Copy-Item -LiteralPath "$projectDir\.env.example" -Destination "$projectDir\.env"
        Write-Host "Đã tạo file cấu hình .env." -ForegroundColor Yellow
    } else {
        Write-Host "Không tìm thấy file cấu hình môi trường." -ForegroundColor Red
        exit 1
    }
}

if (-not (Test-Path -LiteralPath "$projectDir\node_modules")) {
    Write-Host "Đang cài các thư viện lần đầu. Vui lòng chờ..." -ForegroundColor Cyan
    & npm.cmd install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (-not (Test-Path -LiteralPath "$projectDir\prisma\dev.db")) {
    Write-Host "Đang tạo cơ sở dữ liệu mẫu lần đầu..." -ForegroundColor Cyan
    & npx.cmd prisma migrate deploy
    if ($LASTEXITCODE -ne 0) {
        & npx.cmd prisma db push
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    & npm.cmd run db:seed
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (Test-WebReady) {
    Write-Host "Ứng dụng đang chạy sẵn." -ForegroundColor Green
    Start-Process "http://localhost:3000/dang-nhap"
    Write-Host "Đã mở trang đăng nhập trong trình duyệt." -ForegroundColor Green
    exit 0
}

$logOut = Join-Path $projectDir "dev-server.log"
$logErr = Join-Path $projectDir "dev-server-error.log"
$process = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev", "--", "--hostname", "127.0.0.1", "--port", "3000" -WorkingDirectory $projectDir -WindowStyle Hidden -RedirectStandardOutput $logOut -RedirectStandardError $logErr -PassThru
$process.Id | Set-Content -LiteralPath "$projectDir\.dev-server.pid" -Encoding Ascii

Write-Host "Đang khởi động ứng dụng..." -ForegroundColor Cyan
for ($attempt = 1; $attempt -le 30; $attempt++) {
    Start-Sleep -Seconds 1
    if (Test-WebReady) {
        Start-Process "http://localhost:3000/dang-nhap"
        Write-Host "Ứng dụng đã chạy thành công." -ForegroundColor Green
        Write-Host "Địa chỉ: http://localhost:3000/dang-nhap"
        Write-Host "Email: giaovien@chunhiemso.local"
        Write-Host "Mật khẩu: Giaovien@123"
        exit 0
    }
    if ($process.HasExited) { break }
}

Write-Host "Ứng dụng chưa thể khởi động." -ForegroundColor Red
if (Test-Path -LiteralPath $logErr) { Get-Content -LiteralPath $logErr -Tail 20 }
exit 1
