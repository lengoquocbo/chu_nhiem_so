Option Explicit
Dim shell, fso, folder, command, url, i
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
url = "http://localhost:3000/dang-nhap"
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & folder & "\scripts\start-local.ps1"""
shell.Run command, 0, False
For i = 1 To 30
  WScript.Sleep 1000
  If shell.Run("powershell.exe -NoProfile -WindowStyle Hidden -Command ""try { if ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 'http://127.0.0.1:3000/dang-nhap').StatusCode -eq 200) { exit 0 } } catch {}; exit 1""", 0, True) = 0 Then
    shell.Run "cmd.exe /c start """" """ & url & """", 0, False
    WScript.Quit 0
  End If
Next
MsgBox "Khong the khoi dong Chu Nhiem So. Hay xem file dev-server-error.log.", 16, "Chu Nhiem So"