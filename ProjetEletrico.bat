@echo off
:: Verificar se ja esta rodando
curl -s http://127.0.0.1:3847/api/info >nul 2>&1
if not errorlevel 1 goto JA_RODANDO

:: Iniciar servidor em background (sem janela)
start "ProjetEletrico" /B node "%~dp0server.js"

:: Aguardar servidor iniciar
timeout /t 2 /nobreak >nul

:: Tentar ate 10 vezes
set /a TENTATIVAS=0
:AGUARDAR
curl -s http://127.0.0.1:3847/api/info >nul 2>&1
if not errorlevel 1 goto ABRIR
set /a TENTATIVAS=%TENTATIVAS%+1
if %TENTATIVAS% geq 10 goto ERRO_TIMEOUT
timeout /t 1 /nobreak >nul
goto AGUARDAR

:ABRIR
start http://127.0.0.1:3847
exit /b 0

:JA_RODANDO
start http://127.0.0.1:3847
exit /b 0

:ERRO_TIMEOUT
echo ProjetEletrico nao iniciou.
echo Verifique se Node.js esta instalado: https://nodejs.org
pause
exit /b 1
