// Hub de exemplo (/v2/): a tela da automação aberta com ?v2=1 recebe o estilo e o script novos; sem o v2 nada muda.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarProxyAutomacoes } = require('../proxy');

const HTML = '<!DOCTYPE html><html><head><title>ARX Teste</title></head><body><h1>Teste</h1></body></html>';
const ouvir = (servidor) => new Promise((ok) => servidor.listen(0, '127.0.0.1', () => ok(servidor.address().port)));
const fechar = (servidor) => new Promise((ok) => { servidor.closeAllConnections(); servidor.close(ok); });

async function subir() {
  const vistos = [];
  const automacao = http.createServer((req, res) => {
    vistos.push(req.url);
    if (req.url.startsWith('/api/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end('{"ok":true}');
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(HTML) });
    res.end(HTML);
  });
  const portaAuto = await ouvir(automacao);
  const p = criarProxyAutomacoes({ buscarDestino: async (id) => (id === 7 ? { url: `http://127.0.0.1:${portaAuto}/` } : null) });
  const proxy = http.createServer(p.atender);
  const base = `http://127.0.0.1:${await ouvir(proxy)}`;
  return { base, vistos, fim: async () => { await fechar(proxy); await fechar(automacao); } };
}

test('v2: a página da automação ganha o estilo e o script novos, o v2 não vai para a automação e o tamanho confere', async () => {
  const s = await subir();
  try {
    const r = await fetch(`${s.base}/a/7/?v2=1`);
    const corpo = await r.text();
    assert.equal(r.status, 200);
    assert.match(corpo, /<link rel="stylesheet" href="\/__arx-v2\/skin\.css">/);
    assert.match(corpo, /<script src="\/__arx-v2\/skin\.js" defer><\/script><\/head>/);
    assert.equal(Number(r.headers.get('content-length')), Buffer.byteLength(corpo));
    assert.equal(s.vistos[0], '/');
  } finally { await s.fim(); }
});

test('v2: sem o v2 a página passa igual; API com v2 não é mexida', async () => {
  const s = await subir();
  try {
    assert.equal(await (await fetch(`${s.base}/a/7/`)).text(), HTML);
    assert.equal(await (await fetch(`${s.base}/a/7/api/x?v2=1`)).text(), '{"ok":true}');
  } finally { await s.fim(); }
});

test('v2: /__arx-v2/ serve só os arquivos da lista', async () => {
  const s = await subir();
  try {
    const css = await fetch(`${s.base}/__arx-v2/skin.css`);
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type'), /text\/css/);
    // os ícones do Hub, para o título da automação usar o mesmo ícone do cadastro
    const icones = await fetch(`${s.base}/__arx-v2/icons.js`);
    assert.equal(icones.status, 200);
    assert.match(await icones.text(), /window\.Icons/);
    assert.equal((await fetch(`${s.base}/__arx-v2/../proxy.js`)).status, 404);
    assert.equal((await fetch(`${s.base}/__arx-v2/app.js`)).status, 404);
    assert.equal((await fetch(`${s.base}/__arx-v2/qualquer.js`)).status, 404);
  } finally { await s.fim(); }
});

test('v1: com ?v1=1 a página também recebe o desenho da maquete (skin-v1.css), e o v1 não vai para a automação', async () => {
  const s = await subir();
  try {
    const corpo = await (await fetch(`${s.base}/a/7/?v2=1&v1=1`)).text();
    assert.match(corpo, /<link rel="stylesheet" href="\/__arx-v2\/skin\.css"><link rel="stylesheet" href="\/__arx-v2\/skin-v1\.css">/);
    assert.match(corpo, /<script src="\/__arx-v2\/skin\.js" defer><\/script><script src="\/__arx-v2\/skin-v1\.js" defer><\/script>/);
    assert.equal((await fetch(`${s.base}/__arx-v2/skin-v1.js`)).status, 200);
    assert.equal(s.vistos[0], '/');
    assert.doesNotMatch(await (await fetch(`${s.base}/a/7/?v2=1`)).text(), /skin-v1/);
    const css = await fetch(`${s.base}/__arx-v2/skin-v1.css`);
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type'), /text\/css/);
  } finally { await s.fim(); }
});
