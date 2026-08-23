@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-local.ps1"
if not errorlevel 1 (
  start "" "http://localhost:3000/dang-nhap"
  exit /b 0
)
echo Khong the khoi dong ung dung. Hay xem dev-server-error.log.
pause