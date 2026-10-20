// Proxy das automações com servidores de verdade em 127.0.0.1 (uma automação de mentira e o proxy na frente).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarProxyAutomacoes, reescreverLocation } = require('../proxy');
const { criarPasses } = require('../passe');

test('automação restrita: sem passe 403; o passe da query vira cookie e não vai para a automação', async () => {
  const s = await subir();
  try {
    assert.equal((await fetch(`${s.base}/a/9/`)).status, 403);
    assert.equal((await fetch(`${s.base}/a/9/?passe=lixo`)).status, 403);
    assert.equal((await fetch(`${s.base}/a/9/?passe=${s.passes.emitir({ automacaoId: 7, usuario: null })}`)).status, 403); // passe de outra
    const passe = s.passes.emitir({ automacaoId: 9, usuario: { id: 7, nome: 'Fulano' } });
    const r = await fetch(`${s.base}/a/9/tela?x=1&passe=${passe}`);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).url, '/tela?x=1');
    const cookie = r.headers.get('set-cookie');
    assert.match(cookie, /^arx_passe_9=.+; Path=\/; HttpOnly; SameSite=Lax/);
    // pedido seguinte (caminho absoluto da tela, pelo Referer) com o cookie: passa, e o cookie não chega à automação
    const r2 = await fetch(`${s.base}/api/opcoes`, { headers: { Referer: `${s.base}/a/9/`, Cookie: cookie.split(';')[0] } });
    assert.equal(r2.status, 200);
    assert.equal(s.vistos.some((v) => v.cookie), false);
    // automação sem grupos continua aberta sem passe
    assert.equal((await fetch(`${s.base}/a/7/`)).status, 200);
  } finally { await s.fim(); }
});

const ouvir = (servidor) => new Promise((ok) => servidor.listen(0, '127.0.0.1', () => ok(servidor.address().port)));
const fechar = (servidor) => new Promise((ok) => { servidor.closeAllConnections(); servidor.close(ok); });

async function subir() {
  const vistos = [];
  const automacao = http.createServer((req, res) => {
    vistos.push({ url: req.url, host: req.headers.host, referer: req.headers.referer, cookie: req.headers.cookie });
    if (req.url === '/pasta') { res.writeHead(301, { Location: '/pasta/' }); return res.end(); }
    if (req.url === '/api/logs/1') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"type":"log"}\n\n');
      req.on('close', () => vistos.push({ fechou: true }));
      return; // fica aberto, como um SSE de verdade
    }
    let corpo = '';
    req.on('data', (c) => { corpo += c; });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ metodo: req.method, url: req.url, corpo }));
    });
  });
  const portaAuto = await ouvir(automacao);
  // tela ao vivo de mentira (noVNC): página HTTP e WebSocket que devolve o que recebe
  const vnc = http.createServer((req, res) => { res.writeHead(200); res.end(`vnc ${req.url}`); });
  vnc.on('upgrade', (req, socket) => {
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nX-Caminho: ${req.url}\r\n\r\n`);
    socket.on('data', (d) => socket.write(d)); // eco
    socket.on('end', () => socket.destroy());
    socketsVnc.push(socket);
  });
  const socketsVnc = [];
  const portaVnc = await ouvir(vnc);
  const destinos = {
    7: { url: `http://127.0.0.1:${portaAuto}/`, vncPorta: portaVnc },
    8: { url: 'http://127.0.0.1:1/' }, // ninguém escuta e não tem tela ao vivo
    9: { url: `http://127.0.0.1:${portaAuto}/`, grupos: [5] }, // restrita a um grupo do GLPI
  };
  const passes = criarPasses();
  const p = criarProxyAutomacoes({ buscarDestino: async (id) => destinos[id] || null, passes });
  const proxy = http.createServer(p.atender);
  proxy.on('upgrade', p.atenderUpgrade);
  const porta = await ouvir(proxy);
  const base = `http://127.0.0.1:${porta}`;
  return { base, porta, portaAuto, vistos, passes, fim: async () => { socketsVnc.forEach((x) => x.destroy()); await fechar(proxy); await fechar(automacao); await fechar(vnc); } };
}

test('tela ao vivo: /a/<id>/vnc/ vai para a porta VNC da automação; sem VNC cadastrado dá 404', async () => {
  const s = await subir();
  try {
    assert.equal(await (await fetch(`${s.base}/a/7/vnc/arx_vnc.html?x=1`)).text(), 'vnc /arx_vnc.html?x=1');
    assert.equal((await fetch(`${s.base}/a/8/vnc/arx_vnc.html`)).status, 404);
  } finally { await s.fim(); }
});

test('tela ao vivo: o WebSocket passa pelo proxy nos dois sentidos', async () => {
  const s = await subir();
  try {
    const { resposta, socket } = await new Promise((ok, falha) => {
      const req = http.request({ host: '127.0.0.1', port: s.porta, path: '/a/7/vnc/websockify', headers: { Connection: 'Upgrade', Upgrade: 'websocket' } });
      req.on('upgrade', (r, sock) => ok({ resposta: r, socket: sock }));
      req.on('response', (r) => falha(new Error(`sem upgrade: ${r.statusCode}`)));
      req.on('error', falha);
      req.end();
    });
    assert.equal(resposta.statusCode, 101);
    assert.equal(resposta.headers['x-caminho'], '/websockify');
    const eco = await new Promise((ok) => { socket.once('data', (d) => ok(d.toString())); socket.write('oi'); });
    assert.equal(eco, 'oi');
    socket.destroy();
  } finally { await s.fim(); }
});

test('repassa por /a/<id>/ sem o prefixo, com corpo, e o host vira o da automação', async () => {
  const s = await subir();
  try {
    const r = await fetch(`${s.base}/a/7/api/start?x=1`, { method: 'POST', body: '{"a":1}', headers: { 'Content-Type': 'application/json' } });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { metodo: 'POST', url: '/api/start?x=1', corpo: '{"a":1}' });
    assert.equal(s.vistos[0].host, `127.0.0.1:${s.portaAuto}`);
  } finally { await s.fim(); }
});

test('caminho absoluto vai para a automação da página que pediu (Referer), sem repassar o Referer', async () => {
  const s = await subir();
  try {
    const r = await fetch(`${s.base}/api/opcoes`, { headers: { Referer: `${s.base}/a/7/` } });
    assert.equal((await r.json()).url, '/api/opcoes');
    assert.equal(s.vistos[0].referer, undefined);
  } finally { await s.fim(); }
});

test('sem automação: 404 para id desconhecido, sem Referer ou Referer de outro host', async () => {
  const s = await subir();
  try {
    assert.equal((await fetch(`${s.base}/a/99/`)).status, 404);
    assert.equal((await fetch(`${s.base}/api/opcoes`)).status, 404);
    assert.equal((await fetch(`${s.base}/api/opcoes`, { headers: { Referer: 'http://outro:8318/a/7/' } })).status, 404);
    assert.equal(s.vistos.length, 0);
  } finally { await s.fim(); }
});

test('/a/<id> sem barra redireciona para /a/<id>/; redirecionamento da automação volta pelo proxy', async () => {
  const s = await subir();
  try {
    const r1 = await fetch(`${s.base}/a/7?theme=dark`, { redirect: 'manual' });
    assert.equal(r1.status, 301);
    assert.equal(r1.headers.get('location'), '/a/7/?theme=dark');
    const r2 = await fetch(`${s.base}/a/7/pasta`, { redirect: 'manual' });
    assert.equal(r2.headers.get('location'), '/a/7/pasta/');
  } finally { await s.fim(); }
});

test('automação fora do ar: 502 sem citar o endereço', async () => {
  const s = await subir();
  try {
    const r = await fetch(`${s.base}/a/8/`);
    assert.equal(r.status, 502);
    const texto = await r.text();
    assert.doesNotMatch(texto, /127\.0\.0\.1|:1\b/);
  } finally { await s.fim(); }
});

test('SSE passa em fluxo e, quando o navegador sai, a conexão com a automação fecha', async () => {
  const s = await subir();
  try {
    const ctrl = new AbortController();
    const r = await fetch(`${s.base}/a/7/api/logs/1`, { signal: ctrl.signal });
    const leitor = r.body.getReader();
    const { value } = await leitor.read();
    assert.match(Buffer.from(value).toString(), /"type":"log"/);
    ctrl.abort();
    for (let i = 0; i < 50 && !s.vistos.some((v) => v.fechou); i++) await new Promise((ok) => setTimeout(ok, 20));
    assert.ok(s.vistos.some((v) => v.fechou), 'a automação devia ver o fim da conexão');
  } finally { await s.fim(); }
});

test('reescreverLocation: endereço da automação vira o do proxy; outro site fica como está', () => {
  const base = new URL('http://192.168.1.70:4016/');
  assert.equal(reescreverLocation('http://192.168.1.70:4016/x?y=1', base, '/a/3'), '/a/3/x?y=1');
  assert.equal(reescreverLocation('/x', base, '/a/3'), '/a/3/x');
  assert.equal(reescreverLocation('https://exemplo.com/', base, '/a/3'), 'https://exemplo.com/');
  assert.equal(reescreverLocation('http://h:4013/base/x', new URL('http://h:4013/base/'), '/p'), '/p/x');
});
