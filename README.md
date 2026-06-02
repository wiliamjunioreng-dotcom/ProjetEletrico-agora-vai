# ProjetEletrico v2.1.0

**Software de projeto elétrico residencial — Motor NBR 5410:2004+Em1:2008**

Desenvolvido por Wiliam A. S. Junior — CREA-MG 23564875

---

## Como gerar o .exe (GitHub Actions)

### 1. Criar repositório no GitHub

1. Acesse [github.com](https://github.com) → **New repository**
2. Nome: `projeletrico` (ou qualquer nome)
3. Visibilidade: **Private** (recomendado — código proprietário)
4. Clique em **Create repository**

### 2. Fazer upload dos arquivos

**Opção A — Interface web (mais simples):**
1. Na página do repositório, clique em **"uploading an existing file"**
2. Arraste TODOS os arquivos extraídos do ZIP (incluindo pastas)
3. Mensagem de commit: `Initial commit — ProjetEletrico v2.1.0`
4. Clique em **Commit changes**

**Opção B — Git (se tiver instalado):**
```bash
git init
git add .
git commit -m "Initial commit — ProjetEletrico v2.1.0"
git remote add origin https://github.com/SEU_USUARIO/projeletrico.git
git push -u origin main
```

### 3. Aguardar o build (~8-12 minutos)

1. Acesse a aba **Actions** no seu repositório
2. Você verá o workflow **"Build ProjetEletrico.exe"** rodando
3. Quando terminar (ícone verde ✓), clique no workflow
4. Na seção **Artifacts**, baixe:
   - `ProjetEletrico-Setup-Windows-x64` → instalador com wizard
   - `ProjetEletrico-Portatil-Windows-x64` → .exe sem instalação

### 4. Instalar e testar

**Instalador:** Execute `ProjetEletrico Setup X.X.X.exe`, clique em avançar
**Portátil:** Execute `ProjetEletrico-Portatil.exe` diretamente

---

## Funcionalidades

- Motor NBR 5410:2004+Em1:2008 completo (Tabelas 36, 40, 42, 54)
- Demanda CEMIG ND-5.1 com FD
- Curto-circuito IEC 60909
- Diagrama unifilar SVG automático
- Luminotécnico — Método dos Lúmens (NBR ISO/CIE 8995-1)
- QDFL + Memorial descritivo
- Lista de materiais quantificada
- Preços SINAPI/SETOP (importação .xlsx nativa)
- Relatório ART para CREA
- Separação Potência Real vs. Dimensionamento (LED real)

## Normas implementadas

- NBR 5410:2004+Em1:2008
- CEMIG ND-5.1
- IEC 60909:2016
- IEC 60898 (disjuntores)
- IEC 61008 (IDR)
- NBR ISO/CIE 8995-1 (luminotécnico)
- NBR 5419:2015 (SPDA — guia)

---

© 2026 Wiliam A. S. Junior — CREA-MG 23564875
