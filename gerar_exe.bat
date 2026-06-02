@echo off
title ProjetEletrico - Gerar .exe via Node SEA
cls
echo.
echo  ProjetEletrico - Gerar executavel standalone
echo  Usando Node.js Single Executable Application (SEA)
echo  ============================================================
echo.

:: Verificar Node.js 18+
node --version > nul 2>&1
if errorlevel 1 goto SEM_NODE

for /f "tokens=1,2 delims=v." %%a in ('node --version') do set NODE_MAJOR=%%b
echo  Node.js v%NODE_MAJOR% detectado
if %NODE_MAJOR% LSS 18 goto NODE_ANTIGO
echo  OK - Node.js compativel com SEA
echo.
goto STEP1

:SEM_NODE
echo  ERRO: Node.js nao encontrado!
echo  Instale em: https://nodejs.org
pause
exit /b 1

:NODE_ANTIGO
echo  ERRO: Node.js v%NODE_MAJOR% e muito antigo. Precisa v18+
echo  Atualize em: https://nodejs.org
pause
exit /b 1

:STEP1
echo [1/5] Instalando dependencias...
call npm install
echo  OK
echo.

:STEP2
echo [2/5] Compilando interface React...
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
echo [3/5] Preparando bundle para SEA...

:: Criar arquivo de configuracao SEA
echo {"main": "server_bundle.cjs", "output": "sea-prep.blob", "disableExperimentalSEAWarning": true} > sea-config.json

:: Criar bundle CommonJS do servidor (SEA precisa de CJS)
call node_modules\.bin\esbuild server.js --bundle --platform=node --outfile=server_bundle.cjs --format=cjs
if errorlevel 1 (
    echo  esbuild falhou, usando server.js direto
    copy server.js server_bundle.cjs > nul
)
echo  OK
echo.

:STEP4
echo [4/5] Gerando blob SEA...
node --experimental-sea-config sea-config.json
if errorlevel 1 goto ERRO_SEA
echo  OK
echo.

echo [5/5] Criando ProjetEletrico.exe...
if not exist release mkdir release

:: Copiar node.exe como base
copy "%ProgramFiles%\nodejs\node.exe" release\ProjetEletrico.exe > nul 2>&1
if not exist release\ProjetEletrico.exe (
    for /f "tokens=*" %%i in ('where node') do copy "%%i" release\ProjetEletrico.exe > nul
)

:: Injetar o blob no exe
npx postject release\ProjetEletrico.exe NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
if errorlevel 1 goto ERRO_POSTJECT

:: Copiar dist junto
if exist release\dist rmdir /S /Q release\dist
xcopy /E /I /Y /Q dist release\dist

:: Limpar temporarios
del sea-config.json sea-prep.blob server_bundle.cjs > nul 2>&1

echo.
echo  ============================================================
echo   SUCESSO!
echo.
echo   Arquivo: release\ProjetEletrico.exe
echo.
echo   O .exe abre o browser automaticamente.
echo   Mantenha release\dist\ na mesma pasta que o .exe
echo  ============================================================
echo.
start explorer release
pause
exit /b 0

:ERRO_SEA
echo  ERRO ao gerar blob SEA.
echo  Tentando metodo alternativo (pkg)...
goto METODO_PKG

:ERRO_POSTJECT
echo  ERRO ao injetar blob. Tentando pkg...

:METODO_PKG
echo.
echo  Instalando pkg...
call npm install -g pkg
call npx pkg server.js --targets node18-win-x64 --output release\ProjetEletrico.exe
if exist release\ProjetEletrico.exe (
    if exist release\dist rmdir /S /Q release\dist
    xcopy /E /I /Y /Q dist release\dist
    echo  SUCESSO via pkg!
    start explorer release
    pause
    exit /b 0
)

echo.
echo  ============================================================
echo   Nao foi possivel gerar o .exe automaticamente.
echo.
echo   USE O MODO DIRETO:
echo   Duplo clique em ProjetEletrico.bat
echo   (abre no browser, funciona igual ao .exe)
echo  ============================================================
echo.
pause
exit /b 1
