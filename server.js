#!/usr/bin/env node
'use strict';

const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const http     = require('http');
const { exec } = require('child_process');
const os       = require('os');

const app  = express();
const PORT = 3847;

// ── Localizar dist/ ───────────────────────────────────────────
// pkg embute arquivos em /snapshot/ — __dirname funciona lá
// Mas express.static precisa de path real, então extraímos para temp
const isPkg = typeof process.pkg !== 'undefined';

let DIST_DIR;

if (isPkg) {
  // Dentro do .exe: extrair dist/ para pasta temp
  const tmpBase = path.join(os.tmpdir(), 'ProjetEletrico_' + process.pid);
  DIST_DIR = path.join(tmpBase, 'dist');
  
  // Copiar arquivos do snapshot virtual para o sistema real
  function copyDir(src, dst) {
    if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
    const items = fs.readdirSync(src);
    items.forEach(item => {
      const srcPath = path.join(src, item);
      const dstPath = path.join(dst, item);
      const stat = fs.statSync(srcPath);
      if (stat.isDirectory()) {
        copyDir(srcPath, dstPath);
      } else {
        fs.writeFileSync(dstPath, fs.readFileSync(srcPath));
      }
    });
  }
  
  // Tentar primeiro: dist junto ao .exe (sem extrair)
  const exeDir  = path.dirname(process.execPath);
  const distAdj = path.join(exeDir, 'dist');
  
  if (fs.existsSync(distAdj) && fs.existsSync(path.join(distAdj, 'index.html'))) {
    // Pasta dist existe ao lado do .exe — usar diretamente
    DIST_DIR = distAdj;
    console.log('  Usando dist/ ao lado do .exe');
  } else {
    // Extrair do snapshot para temp
    const snapshotDist = path.join(__dirname, 'dist');
    try {
      copyDir(snapshotDist, DIST_DIR);
      console.log('  Interface extraida para:', DIST_DIR);
    } catch(e) {
      console.error('  ERRO ao extrair interface:', e.message);
      process.exit(1);
    }
  }
} else {
  // Desenvolvimento: usar dist/ local
  DIST_DIR = path.join(__dirname, 'dist');
}

// ── Verificar que dist existe ─────────────────────────────────
if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  console.error('');
  console.error('  ERRO: Interface nao encontrada em:', DIST_DIR);
  console.error('  Execute: npm run build');
  console.error('');
  process.exit(1);
}

// ── Express ───────────────────────────────────────────────────
app.use(express.static(DIST_DIR));
app.use(express.json({ limit: '10mb' }));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

// ── API de arquivos ───────────────────────────────────────────
const DOCS_DIR = path.join(os.homedir(), 'Documents', 'ProjetEletrico');
function ensureDocs() {
  if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });
}

app.post('/api/save', (req, res) => {
  try {
    ensureDocs();
    const { json, filename } = req.body;
    const safe = (filename || 'projeto.projelec').replace(/[<>:"/\\|?*]/g, '_');
    const fp   = path.join(DOCS_DIR, safe);
    fs.writeFileSync(fp, json, 'utf-8');
    res.json({ ok: true, path: fp });
  } catch(e) { res.json({ ok: false, error: String(e) }); }
});

app.post('/api/load', (req, res) => {
  try {
    const { filepath } = req.body;
    if (!fs.existsSync(filepath)) return res.json({ ok: false, error: 'Arquivo nao encontrado' });
    res.json({ ok: true, json: fs.readFileSync(filepath, 'utf-8') });
  } catch(e) { res.json({ ok: false, error: String(e) }); }
});

app.get('/api/projects', (req, res) => {
  try {
    ensureDocs();
    const files = fs.readdirSync(DOCS_DIR)
      .filter(f => f.endsWith('.projelec') || f.endsWith('.json'))
      .map(f => {
        const fp = path.join(DOCS_DIR, f);
        return { name: f, path: fp, mtime: fs.statSync(fp).mtime };
      })
      .sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
    res.json({ files });
  } catch(e) { res.json({ files: [] }); }
});


// ── API: Gerar QDFL.xlsx real (via Python/openpyxl) ──────────
app.post('/api/export-qdfl', (req, res) => {
  try {
    const { data, filename } = req.body;
    const { execSync } = require('child_process');
    const os   = require('os');
    const path = require('path');
    const fs   = require('fs');

    // Arquivo temporário para dados
    const tmpJson = path.join(os.tmpdir(), `qdfl_${Date.now()}.json`);
    const tmpXlsx = path.join(os.tmpdir(), `qdfl_${Date.now()}.xlsx`);

    fs.writeFileSync(tmpJson, JSON.stringify(data));

    // Localizar o script Python
    const isPkg = typeof process.pkg !== 'undefined';
    const scriptDir = isPkg ? path.dirname(process.execPath) : __dirname;
    const scriptPath = path.join(scriptDir, 'gerar_qdfl.py');

    if (!fs.existsSync(scriptPath)) {
      return res.json({ ok: false, error: 'Script gerar_qdfl.py nao encontrado junto ao servidor' });
    }

    // Executar Python
    try {
      execSync(`python3 "${scriptPath}" "${tmpJson}" "${tmpXlsx}"`, { timeout: 30000 });
    } catch(e) {
      // Tentar python se python3 nao disponivel
      try {
        execSync(`python "${scriptPath}" "${tmpJson}" "${tmpXlsx}"`, { timeout: 30000 });
      } catch(e2) {
        fs.unlinkSync(tmpJson);
        return res.json({ ok: false, error: 'Python nao disponivel: ' + e.message });
      }
    }

    if (!fs.existsSync(tmpXlsx)) {
      fs.unlinkSync(tmpJson);
      return res.json({ ok: false, error: 'Arquivo Excel nao foi gerado' });
    }

    // Salvar em Documentos/ProjetEletrico
    ensureDocs();
    const safeFilename = (filename || 'QDFL.xlsx').replace(/[<>:"/\\|?*]/g, '_');
    const outputPath = path.join(DOCS_DIR, safeFilename);
    fs.copyFileSync(tmpXlsx, outputPath);

    // Limpar temporários
    fs.unlinkSync(tmpJson);
    fs.unlinkSync(tmpXlsx);

    res.json({ ok: true, path: outputPath });
  } catch(e) {
    res.json({ ok: false, error: String(e) });
  }
});

app.get('/api/info', (_req, res) => {
  res.json({ version: '2.0.0', node: process.version,
             platform: process.platform, isPkg, dist: DIST_DIR });
});

// ── Iniciar ───────────────────────────────────────────────────
const server = http.createServer(app);

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log('');
  console.log('  ProjetEletrico v2.0 rodando!');
  console.log('  ==============================');
  console.log(`  Endereco : ${url}`);
  console.log(`  Projetos : ${DOCS_DIR}`);
  console.log('');
  console.log('  Mantenha esta janela aberta.');
  console.log('  Para encerrar: feche esta janela.');
  console.log('');

  // Abrir browser
  const openCmd = process.platform === 'win32'
    ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(openCmd);
});

// MANTER PROCESSO VIVO — sem isso o .exe fecha imediatamente
process.stdin.resume();

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.log(`\n  Porta ${PORT} ja em uso — ProjetEletrico ja esta rodando!`);
    exec(process.platform === 'win32'
      ? `start "" "http://127.0.0.1:${PORT}"`
      : `open "http://127.0.0.1:${PORT}"`);
    setTimeout(() => process.exit(0), 1000);
  } else {
    console.error('  Erro:', err.message);
    process.exit(1);
  }
});

function shutdown() {
  console.log('\n  Encerrando...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000);
}
process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);
try { process.on('SIGBREAK', shutdown); } catch(_) {}
