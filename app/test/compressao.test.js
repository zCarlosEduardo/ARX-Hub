const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const compression = require('compression');
const { deveComprimir } = require('../compressao');

function servidor() {
  const app = express();
  app.use(compression({ filter: deveComprimir }));
  app.get('/app.js', (req, res) => res.type('application/javascript').send('const x = 1;\n'.repeat(500)));
  app.get('/eventos', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.flushHeaders();
    res.write('data: {"mudou":true}\n\n');
  });
  return new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
}

function pedir(porta, caminho) {
  return new Promise((ok, erro) => {
    const req = http.get({ host: '127.0.0.1', port: porta, path: caminho, headers: { 'Accept-Encoding': 'gzip' } }, (res) => {
      // o SSE não termina: basta o primeiro pedaço para conferir que chegou sem esperar o fim
      res.once('data', (pedaco) => { ok({ codificacao: res.headers['content-encoding'], pedaco: pedaco.toString() }); req.destroy(); });
    });
    req.on('error', (e) => { if (e.code !== 'ECONNRESET') erro(e); });
  });
}

test('js sai comprimido; SSE sai sem compressão e o aviso chega na hora', async () => {
  const s = await servidor();
  try {
    const { port } = s.address();
    assert.equal((await pedir(port, '/app.js')).codificacao, 'gzip');
    const sse = await pedir(port, '/eventos');
    assert.equal(sse.codificacao, undefined);
    assert.match(sse.pedaco, /mudou/);
  } finally {
    s.closeAllConnections();
    s.close();
  }
});
