// Proxy reverso: o navegador fala só com o Hub e nunca vê o endereço (IP e porta) das automações nem do chamados-glpi.
//
//   porta das automações (PROXY_PORT, padrão 8318)   /a/<id>/...  ->  URL cadastrada da automação <id>
//   porta do Hub (8317)                              /servicos/chamados/...  ->  CHAMADOS_GLPI_URL
//
// As automações ficam numa porta (origem) separada do Hub de propósito: na mesma origem, qualquer tela de automação
// poderia ler a memória do Hub, onde fica a chave do cofre destravado.
//
// As telas das automações chamam a própria API por caminho absoluto (fetch('/api/start')). Esse pedido chega sem o
// /a/<id>/, então a automação é descoberta pelo Referer (a página que pediu, /a/<id>/...). Os navegadores mandam o
// Referer completo para a mesma origem; nenhuma automação muda a Referrer-Policy.
const http = require('http');
const https = require('https');

// cabeçalhos de uma conexão só (RFC 9110 7.6.1): não passam adiante
const SALTO_A_SALTO = ['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te', 'trailer'];

function semSaltoASalto(cabecalhos) {
  const saida = { ...cabecalhos };
  for (const c of SALTO_A_SALTO) delete saida[c];
  return saida;
}

/** Redirecionamento da automação para ela mesma volta pelo proxy (sem o endereço real). */
function reescreverLocation(location, base, prefixo) {
  let u;
  try {
    u = new URL(location, base);
  } catch {
    return location;
  }
  if (u.origin !== base.origin) return location;
  const raiz = base.pathname.replace(/\/+$/, '');
  const caminho = raiz && u.pathname.startsWith(raiz) ? u.pathname.slice(raiz.length) || '/' : u.pathname;
  return prefixo + caminho + u.search + u.hash;
}

/**
 * Repassa o pedido e devolve a resposta em fluxo (SSE, upload e download passam sem ficar em memória).
 * `caminho` começa com "/" e inclui a query; `prefixo` é o que o navegador vê no lugar do endereço real.
 */
function repassar(req, res, destino, caminho, prefixo) {
  const base = new URL(destino);
  const cabecalhos = semSaltoASalto(req.headers);
  cabecalhos.host = base.host;
  delete cabecalhos.referer; // a automação não precisa saber o endereço do proxy
  const modulo = base.protocol === 'https:' ? https : http;
  const pedido = modulo.request(
    {
      protocol: base.protocol,
      hostname: base.hostname,
      port: base.port,
      method: req.method,
      path: base.pathname.replace(/\/+$/, '') + caminho,
      headers: cabecalhos,
    },
    (resposta) => {
      const saida = semSaltoASalto(resposta.headers);
      if (saida.location) saida.location = reescreverLocation(saida.location, base, prefixo);
      res.writeHead(resposta.statusCode, saida);
      resposta.pipe(res);
    }
  );
  pedido.on('error', () => {
    // automação fora do ar: a mensagem não cita o endereço
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Automação fora do ar.' }));
  });
  // o navegador saiu (aba fechada, SSE encerrado): solta a conexão com a automação também, senão a tela ao vivo
  // continua achando que tem alguém olhando
  res.on('close', () => pedido.destroy());
  req.pipe(pedido);
}

/** Id da automação pelo caminho (/a/<id>/...) ou, para caminho absoluto, pela página que pediu (Referer). */
function idDoPedido(req) {
  const m = /^\/a\/(\d+)(\/|\?|$)/.exec(req.url);
  if (m) return { id: Number(m[1]), porCaminho: true, temBarra: m[2] === '/' };
  let ref;
  try {
    ref = new URL(req.headers.referer || '');
  } catch {
    return null;
  }
  if (ref.host !== req.headers.host) return null;
  const r = /^\/a\/(\d+)\//.exec(ref.pathname);
  return r ? { id: Number(r[1]), porCaminho: false } : null;
}

/**
 * Para onde vai o pedido: a URL da automação ou, em /a/<id>/vnc/..., a tela ao vivo (noVNC) na porta `vncPorta` do
 * mesmo host. Devolve { base, caminho, prefixo } ou null (sem tela ao vivo cadastrada).
 */
function alvo(destino, achado, url) {
  const prefixo = `/a/${achado.id}`;
  const caminho = achado.porCaminho ? url.slice(prefixo.length) : url;
  if (!/^\/vnc(\/|\?|$)/.test(caminho)) return { base: destino.url, caminho, prefixo };
  if (!destino.vncPorta) return null;
  const base = new URL(destino.url);
  base.port = String(destino.vncPorta);
  base.pathname = '/';
  return { base: base.toString(), caminho: caminho.slice('/vnc'.length) || '/', prefixo: prefixo + '/vnc' };
}

/** WebSocket (tela ao vivo): repassa o aperto de mão e depois liga os dois sockets. */
function repassarUpgrade(req, socket, cabeca, destino, caminho) {
  const base = new URL(destino);
  const cabecalhos = { ...req.headers, host: base.host };
  delete cabecalhos.referer;
  const pedido = http.request({ hostname: base.hostname, port: base.port, method: req.method, path: base.pathname.replace(/\/+$/, '') + caminho, headers: cabecalhos });
  pedido.on('upgrade', (resposta, socketAuto, cabecaAuto) => {
    const linhas = [`HTTP/1.1 ${resposta.statusCode} ${resposta.statusMessage}`];
    for (let i = 0; i < resposta.rawHeaders.length; i += 2) linhas.push(`${resposta.rawHeaders[i]}: ${resposta.rawHeaders[i + 1]}`);
    socket.write(linhas.join('\r\n') + '\r\n\r\n');
    if (cabecaAuto && cabecaAuto.length) socket.write(cabecaAuto);
    if (cabeca && cabeca.length) socketAuto.write(cabeca);
    socketAuto.pipe(socket).pipe(socketAuto);
    const fechar = () => { socket.destroy(); socketAuto.destroy(); };
    socket.on('error', fechar);
    socketAuto.on('error', fechar);
    // um lado terminou: derruba o outro (socket de WebSocket aceita meia conexão aberta e ficaria pendurado)
    for (const s of [socket, socketAuto]) {
      s.on('end', fechar);
      s.on('close', fechar);
    }
  });
  pedido.on('response', (resposta) => {
    // a automação não aceitou o WebSocket: devolve a resposta dela e fecha
    socket.end(`HTTP/1.1 ${resposta.statusCode} ${resposta.statusMessage}\r\nConnection: close\r\n\r\n`);
    resposta.resume();
  });
  pedido.on('error', () => socket.destroy());
  pedido.end();
}

/**
 * Servidor da porta das automações. `buscarDestino(id)` devolve { url, vncPorta } da automação cadastrada ou null.
 * Devolve `atender` (pedidos HTTP) e `atenderUpgrade` (WebSocket, evento 'upgrade' do servidor).
 */
function criarProxyAutomacoes({ buscarDestino }) {
  async function resolver(req) {
    const achado = idDoPedido(req);
    if (!achado) return { status: 404, texto: 'Não encontrado.' };
    if (achado.porCaminho && !achado.temBarra) return { achado };
    let destino;
    try {
      destino = await buscarDestino(achado.id);
    } catch {
      return { status: 503, texto: 'Hub sem acesso ao cadastro das automações.' };
    }
    if (!destino) return { status: 404, texto: 'Automação não cadastrada.' };
    const a = alvo(destino, achado, req.url);
    return a ? { achado, alvo: a } : { status: 404, texto: 'Esta automação não tem tela ao vivo.' };
  }

  async function atender(req, res) {
    const r = await resolver(req);
    if (r.status) {
      res.writeHead(r.status, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(r.texto);
    }
    if (!r.alvo) {
      // sem a barra final os caminhos relativos da tela (app.js, style.css) sairiam de /a/
      const prefixo = `/a/${r.achado.id}`;
      res.writeHead(301, { Location: prefixo + '/' + req.url.slice(prefixo.length) });
      return res.end();
    }
    repassar(req, res, r.alvo.base, r.alvo.caminho, r.alvo.prefixo);
  }

  async function atenderUpgrade(req, socket, cabeca) {
    socket.on('error', () => socket.destroy()); // navegador caiu no meio do aperto de mão
    const r = await resolver(req);
    if (!r.alvo) return socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    repassarUpgrade(req, socket, cabeca, r.alvo.base, r.alvo.caminho);
  }

  return { atender, atenderUpgrade };
}

module.exports = { criarProxyAutomacoes, repassar, reescreverLocation, idDoPedido };
