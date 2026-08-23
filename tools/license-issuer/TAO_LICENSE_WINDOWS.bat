@echo off
setlocal
cd /d "%~dp0\..\.."
cscript //nologo "tools\license-issuer\TAO_LICENSE_WINDOWS.vbs"
