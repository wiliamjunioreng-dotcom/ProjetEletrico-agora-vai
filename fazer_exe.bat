@echo off
title ProjetEletrico - Preparando
cls
echo.
echo  ProjetEletrico v2.0
echo  ============================================================
echo.

echo [0/4] Verificando Node.js...
node --version
if errorlevel 1 goto SEM_NODE
echo  OK
echo.
goto STEP1

:SEM_NODE
echo  ERRO: Node.js nao encontrado!
echo  Instale em: https://nodejs.org
pause
exit /b 1

:STEP1
echo [1/4] Instalando dependencias...
call npm install
echo  OK
echo.

:STEP2
echo [2/4] Compilando interface React...
call node_modules\.bin\tsc -b
if errorlevel 1 goto ERRO_BUILD
call node_modules\.bin\vite build
if errorlevel 1 goto ERRO_BUILD
echo  OK
echo.
goto STEP3

:ERRO_BUILD
echo  ERRO no build!
pause
exit /b 1

:STEP3
echo [3/4] Criando pasta de distribuicao...
if exist release rmdir /S /Q release
mkdir release
mkdir release\app
copy server.js release\app\server.js >nul
xcopy /E /I /Y /Q dist release\app\dist >nul
xcopy /E /I /Y /Q node_modules release\app\node_modules >nul
copy ProjetEletrico.bat release\ProjetEletrico.bat >nul
echo  OK
echo.

:STEP4
echo [4/4] Pronto!
echo.
echo  ============================================================
echo   SUCESSO! Pasta release\ criada.
echo.
echo   Para usar: clique em release\ProjetEletrico.bat
echo   Para distribuir: copie a pasta release\ inteira
echo  ============================================================
echo.
start explorer release
pause
exit /b 0
