@echo off
chcp 65001 >nul
title CHỦ NHIỆM SỐ - Dừng ứng dụng
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-local.ps1"
echo.
pause
