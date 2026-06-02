# ProjetEletrico — Gerador de .exe (executar UMA VEZ no Windows)
# Requisito: Node.js instalado (https://nodejs.org)

Write-Host ""
Write-Host "  ProjetEletrico v2.0 — Gerando executavel" -ForegroundColor Cyan
Write-Host "  ==========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar Node.js
try { $nodeVer = node --version 2>&1; Write-Host "  Node.js: $nodeVer" -ForegroundColor Green }
catch { Write-Host "  ERRO: Node.js nao encontrado. Instale em https://nodejs.org" -ForegroundColor Red; pause; exit 1 }

# Instalar dependencias
Write-Host ""
Write-Host "  [1/4] Instalando dependencias..." -ForegroundColor Yellow
npm install --legacy-peer-deps | Out-Null

# Build React
Write-Host "  [2/4] Compilando interface React..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "  ERRO no build!" -ForegroundColor Red; pause; exit 1 }

# Instalar pkg
Write-Host "  [3/4] Instalando empacotador..." -ForegroundColor Yellow
npm install -g pkg | Out-Null

# Gerar .exe
Write-Host "  [4/4] Gerando ProjetEletrico.exe..." -ForegroundColor Yellow
Write-Host "  (Primeira vez: baixa ~30MB de binarios, pode levar 5 min)" -ForegroundColor Gray
New-Item -ItemType Directory -Force -Path release | Out-Null
pkg server.js --targets node18-win-x64 --output release\ProjetEletrico.exe --compress GZip

# Copiar dist
if (Test-Path "release\ProjetEletrico.exe") {
    Write-Host ""
    Write-Host "  SUCESSO!" -ForegroundColor Green
    Write-Host "  Arquivo: $(Resolve-Path release\ProjetEletrico.exe)" -ForegroundColor Green
    Write-Host ""
    Write-Host "  O arquivo .exe abre o ProjetEletrico diretamente." -ForegroundColor Cyan
    Write-Host "  Pode copiar para pendrive ou qualquer computador Windows." -ForegroundColor Cyan
    Write-Host ""
    
    # Copiar dist junto com o exe
    if (-not (Test-Path "release\dist")) {
        Copy-Item -Path dist -Destination release\dist -Recurse
    }
    
    # Abrir a pasta release
    explorer release
} else {
    Write-Host ""
    Write-Host "  Nao foi possivel gerar o .exe." -ForegroundColor Red
    Write-Host "  Use: node server.js   e acesse http://localhost:3847" -ForegroundColor Yellow
}

Write-Host ""
pause
