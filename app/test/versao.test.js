const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { calcularVersao, registrarVersao } = require('../versao');

function pastaTemp(arquivos) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arx-versao-'));
  for (const [rel, conteudo] of Object.entries(arquivos)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), conteudo);
  }
  return dir;
}

test('mesmo conteúdo, mesma versão; arquivo alterado, versão diferente', () => {
  const a = pastaTemp({ 'index.html': '<p>oi</p>', 'sub/app.js': 'x=1' });
  const b = pastaTemp({ 'index.html': '<p>oi</p>', 'sub/app.js': 'x=1' });
  assert.equal(calcularVersao(a), calcularVersao(b));
  assert.match(calcularVersao(a), /^[0-9a-f]{12}$/);
  fs.writeFileSync(path.join(b, 'sub/app.js'), 'x=2');
  assert.notEqual(calcularVersao(a), calcularVersao(b));
});

test('fim de linha CRLF e LF dão a mesma versão', () => {
  const a = pastaTemp({ 'app.js': 'a\nb\n' });
  const b = pastaTemp({ 'app.js': 'a\r\nb\r\n' });
  assert.equal(calcularVersao(a), calcularVersao(b));
});

test('renomear arquivo muda a versão', () => {
  const a = pastaTemp({ 'a.js': 'x' });
  const b = pastaTemp({ 'b.js': 'x' });
  assert.notEqual(calcularVersao(a), calcularVersao(b));
});

test('pastas ignoradas e arquivos ocultos não entram', () => {
  const base = pastaTemp({ 'index.html': 'x' });
  const antes = calcularVersao(base);
  for (const rel of ['uploads/a.png', 'logs/l.txt', 'downloads/d.zip', 'dados/x.json', 'node_modules/m/i.js', '.env', 'sub/.oculto']) {
    fs.mkdirSync(path.dirname(path.join(base, rel)), { recursive: true });
    fs.writeFileSync(path.join(base, rel), 'lixo');
  }
  assert.equal(calcularVersao(base), antes);
});

test('pasta inexistente não quebra', () => {
  assert.match(calcularVersao(path.join(os.tmpdir(), 'arx-nao-existe-xyz')), /^[0-9a-f]{12}$/);
});

function pegar(porta, caminho) {
  return new Promise((resolve, reject) => {
    http.get({ port: porta, path: caminho, agent: false }, (res) => {
      let corpo = '';
      res.on('data', (c) => (corpo += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, corpo }));
    }).on('error', reject);
  });
}

// No Hub o express é dependência do próprio app.
let express = null;
try {
  express = require('express');
} catch {
  // sem node_modules: o teste da rota fica como skipped
}

test('rota /api/versao e static respondem com os cabeçalhos certos', { skip: !express && 'express não instalado em nenhum app' }, async () => {
  const pasta = pastaTemp({ 'index.html': '<p>oi</p>', 'app.js': 'x=1', 'logo.png': 'png' });
  const app = express();
  app.use(express.json());
  const reg = registrarVersao(app, express, pasta);
  const srv = app.listen(0);
  try {
    const porta = srv.address().port;
    const v = await pegar(porta, '/api/versao');
    assert.equal(v.status, 200);
    assert.equal(v.headers['cache-control'], 'no-store');
    assert.deepEqual(JSON.parse(v.corpo), { versao: calcularVersao(pasta) });
    for (const arq of ['/app.js', '/index.html']) {
      const r = await pegar(porta, arq);
      assert.equal(r.status, 200);
      assert.equal(r.headers['cache-control'], 'no-cache');
      assert.ok(r.headers.etag);
    }
    const img = await pegar(porta, '/logo.png');
    assert.notEqual(img.headers['cache-control'], 'no-cache');
    fs.writeFileSync(path.join(pasta, 'app.js'), 'x=2');
    reg.recalcular();
    const v2 = await pegar(porta, '/api/versao');
    assert.notEqual(JSON.parse(v2.corpo).versao, JSON.parse(v.corpo).versao);
  } finally {
    srv.close();
  }
});
