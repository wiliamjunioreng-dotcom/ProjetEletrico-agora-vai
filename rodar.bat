@echo off
title ProjetEletrico v2.0
cls

node --version >nul 2>&1
if errorlevel 1 (
    echo Node.js nao encontrado. Instale em: https://nodejs.org
    pause
    exit /b 1
)

if not exist node_modules (
    echo Instalando dependencias (primeira vez)...
    call npm install --legacy-peer-deps
)

if not exist dist (
    echo Compilando interface...
    call npm run build
)

echo Iniciando ProjetEletrico...
echo Acesse: http://localhost:3847
echo Pressione Ctrl+C para encerrar.
node server.js
