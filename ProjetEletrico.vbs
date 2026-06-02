' ProjetEletrico.vbs - Launcher sem janela preta
' Coloque na mesma pasta que server.js e node_modules

Dim shell, fso, scriptDir, cmd

Set shell = CreateObject("WScript.Shell")
Set fso   = CreateObject("Scripting.FileSystemObject")

' Pasta onde este .vbs est??
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Verificar se node est?? dispon??vel
On Error Resume Next
Dim nodeCheck
nodeCheck = shell.Run("cmd /c node --version > nul 2>&1", 0, True)
On Error GoTo 0

If nodeCheck <> 0 Then
    MsgBox "Node.js nao encontrado." & vbCrLf & vbCrLf & _
           "Instale em: https://nodejs.org" & vbCrLf & _
           "Marque 'Add to PATH' durante a instalacao.", _
           vbCritical, "ProjetEletrico"
    WScript.Quit 1
End If

' Iniciar servidor em background (sem janela)
cmd = "cmd /c cd /d """ & scriptDir & """ && node server.js"
shell.Run cmd, 0, False

' Aguardar o servidor iniciar (2 segundos)
WScript.Sleep 2000

' Abrir o browser
shell.Run "http://127.0.0.1:3847", 1, False

' Manter o VBScript vivo enquanto o servidor roda
' (verifica a cada 5s se o processo ainda existe)
Do While True
    WScript.Sleep 5000
    ' Verificar se o servidor ainda responde
    Dim http
    Set http = CreateObject("MSXML2.XMLHTTP")
    On Error Resume Next
    http.Open "GET", "http://127.0.0.1:3847/api/info", False
    http.Send
    If Err.Number <> 0 Then
        ' Servidor caiu ??? encerrar
        Exit Do
    End If
    On Error GoTo 0
    Set http = Nothing
Loop
