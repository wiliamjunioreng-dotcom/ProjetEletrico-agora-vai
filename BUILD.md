# ProjetEletrico v2.0 — Build Guide

## Pré-requisitos (instalar uma vez)
```
node --version   # precisa v18+
npm --version    # precisa v9+
```

## Desenvolvimento (browser — sem Electron)
```bash
npm install
npm run dev
# Abre http://localhost:5173
```

## Gerar .exe Windows

### 1. Instalar dependências
```bash
npm install
npm install --save-dev electron electron-builder xlsx
```

### 2. Criar ícone (opcional)
Colocar `assets/icon.ico` (256×256 px)

### 3. Build instalador + portátil
```bash
npm run dist:win
# Gera em release/:
#   ProjetEletrico Setup 2.0.0.exe   (~90MB instalador NSIS)
#   ProjetEletrico-v2.0.0-portable.exe  (~90MB portátil — copia para pendrive)
```

### 4. Build só portátil (mais rápido)
```bash
npm run dist:portable
```

## Estrutura
```
projeletrico/
├── src/
│   ├── core/engine.ts       ← Motor NBR 5410 TypeScript
│   ├── data/nbr5410tables.ts ← Tabelas normativas
│   ├── store/projectStore.ts ← Zustand (estado global)
│   ├── types/electrical.ts  ← Tipagem do grafo elétrico
│   ├── pages/               ← 8 páginas React
│   └── components/          ← Shell BIM 360
├── electron/
│   ├── main.js              ← Processo principal Electron
│   └── preload.js           ← Bridge segura (contextBridge)
├── dist/                    ← Build React (gerado por npm run build)
└── release/                 ← .exe final (gerado por npm run dist)
```

## Motor de cálculo (TypeScript puro)
- `engine.ts`: física real — Ib, Iz', Ft, Fa, ΔU%, auditoria tripartida
- `nbr5410tables.ts`: Tabela 36 (todos os métodos), Tab 40, Tab 42, Tab 54
- `projectStore.ts`: Zustand reativo — qualquer mudança recalcula tudo
- Zero latência de bridge — React ↔ Zustand é síncrono

## Arquivos de projeto
- Extensão: `.projelec` (JSON estruturado)
- Auto-save: Zustand mantém estado, `Salvar` gera o arquivo
- Compatibilidade: JSON legível, sem binário proprietário
