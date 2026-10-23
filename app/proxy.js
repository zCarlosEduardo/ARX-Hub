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
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { rotaDeInicio } = require('./execucoes');

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

// Layout novo das automações: a tela aberta pelo Hub com ?v2=1 recebe o estilo e o script novos (public/v2/automacao/),
// servidos aqui mesmo em /__arx-v2/ (mesma origem da automação). Sem o v2, nada muda.
const PASTA_V2 = path.join(__dirname, 'public', 'v2', 'automacao');
// nome publicado -> [arquivo, tipo]; icons.js é o do Hub, para o título da automação usar o ícone do cadastro
const ARQUIVOS_V2 = {
  'skin.css': [path.join(PASTA_V2, 'skin.css'), 'text/css; charset=utf-8'],
  'skin.js': [path.join(PASTA_V2, 'skin.js'), 'application/javascript; charset=utf-8'],
  // Hub v1 (?v1=1): o desenho da maquete por cima do skin.css
  'skin-v1.css': [path.join(PASTA_V2, 'skin-v1.css'), 'text/css; charset=utf-8'],
  'icons.js': [path.join(__dirname, 'public', 'icons.js'), 'application/javascript; charset=utf-8'],
};
// darkreader-lock: extensões de modo escuro (Dark Reader e parecidas) não repintam a tela; o tema vem do Hub
const tagsV2 = (v1) => '<meta name="darkreader-lock"><link rel="stylesheet" href="/__arx-v2/skin.css">' + (v1 ? '<link rel="stylesheet" href="/__arx-v2/skin-v1.css">' : '') + '<script src="/__arx-v2/skin.js" defer></script>';

function servirV2(req, res) {
  const nome = req.url.slice('/__arx-v2/'.length).split('?')[0];
  if (!Object.prototype.hasOwnProperty.call(ARQUIVOS_V2, nome)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Não encontrado.');
  }
  const [arquivo, tipo] = ARQUIVOS_V2[nome];
  fs.readFile(arquivo, (err, corpo) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Não encontrado.');
    }
    res.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': 'no-cache' });
    res.end(corpo);
  });
}

/** Página HTML sem compressão: põe as tags do v2 antes do </head> (ou no começo, se não houver). */
const podeInjetar = (resposta) => /text\/html/i.test(resposta.headers['content-type'] || '') && !resposta.headers['content-encoding'];
function comTagsV2(html, v1) {
  const tags = tagsV2(v1);
  const i = html.search(/<\/head>/i);
  return i >= 0 ? html.slice(0, i) + tags + html.slice(i) : tags + html;
}

/**
 * Repassa o pedido e devolve a resposta em fluxo (SSE, upload e download passam sem ficar em memória).
 * `caminho` começa com "/" e inclui a query; `prefixo` é o que o navegador vê no lugar do endereço real.
 */
function repassar(req, res, destino, caminho, prefixo, extras = {}) {
  const base = new URL(destino);
  const cabecalhos = semSaltoASalto(req.headers);
  cabecalhos.host = base.host;
  delete cabecalhos.referer; // a automação não precisa saber o endereço do proxy
  delete cabecalhos.cookie; // o passe do Hub fica no proxy; as automações não usam cookie
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
      if (extras.setCookie) saida['set-cookie'] = [].concat(saida['set-cookie'] || [], extras.setCookie);
      if (extras.injetarV2 && podeInjetar(resposta)) {
        // só a página (pequena) fica em memória para receber as tags; o resto continua em fluxo
        const partes = [];
        resposta.on('data', (c) => partes.push(c));
        resposta.on('end', () => {
          const corpo = Buffer.from(comTagsV2(Buffer.concat(partes).toString('utf8'), extras.injetarV2 === 'v1'), 'utf8');
          saida['content-length'] = String(corpo.length);
          res.writeHead(resposta.statusCode, saida);
          res.end(corpo);
        });
        return;
      }
      res.writeHead(resposta.statusCode, saida);
      if (extras.aoResponder) extras.aoResponder(resposta);
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
  delete cabecalhos.cookie;
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

function lerCookie(cabecalho, nome) {
  for (const parte of String(cabecalho || '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nome) return parte.slice(i + 1).trim();
  }
  return null;
}

/** Tira `passe`, `v2` e `v1` da query: são do Hub e não vão para a automação. */
function semPasse(url) {
  if (!/[?&](passe|v2|v1)=/.test(url)) return url;
  const u = new URL(url, 'http://x');
  u.searchParams.delete('passe');
  u.searchParams.delete('v2');
  u.searchParams.delete('v1');
  return u.pathname + u.search;
}

/**
 * Servidor da porta das automações. `buscarDestino(id)` devolve { url, vncPorta, grupos } da automação cadastrada ou
 * null. Automação com grupos exige o passe do Hub (passe.js): ele chega na query da primeira página (?passe=) e fica
 * num cookie por automação (`arx_passe_<id>`), que acompanha os pedidos seguintes, inclusive WebSocket.
 * Devolve `atender` (pedidos HTTP) e `atenderUpgrade` (WebSocket, evento 'upgrade' do servidor).
 */
function criarProxyAutomacoes({ buscarDestino, passes = null, observador = null }) {
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

    const nomeCookie = `arx_passe_${achado.id}`;
    const daUrl = achado.porCaminho ? new URL(req.url, 'http://x').searchParams.get('passe') : null;
    let acesso = null;
    let setCookie = null;
    if (passes && daUrl) {
      acesso = passes.ler(daUrl, achado.id);
      if (acesso) setCookie = `${nomeCookie}=${daUrl}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(passes.VALIDADE_MS / 1000)}`;
    }
    if (passes && !acesso) {
      const doCookie = lerCookie(req.headers.cookie, nomeCookie);
      if (doCookie) acesso = passes.ler(doCookie, achado.id);
    }
    if ((destino.grupos || []).length && !acesso) return { status: 403, texto: 'Sem acesso a esta automação.' };

    const a = alvo(destino, achado, semPasse(req.url));
    if (!a) return { status: 404, texto: 'Esta automação não tem tela ao vivo.' };
    const q = new URL(req.url, 'http://x').searchParams;
    // 'v1' = layout novo com o desenho do Hub v1; true = só o layout novo
    const v2 = achado.porCaminho && req.method === 'GET' && q.get('v2') === '1' && (q.get('v1') === '1' ? 'v1' : true);
    return { achado, destino, alvo: a, setCookie, quem: acesso ? acesso.usuario : null, v2 };
  }

  /**
   * Para o registro de execuções manuais (execucoesRegistro.js): no POST de início, guarda os corpos (com teto) e
   * avisa quando a resposta termina; no GET de logs (SSE), passa os pedaços adiante. Não altera o que trafega.
   */
  function observar(req, r) {
    if (!observador || r.alvo.prefixo.endsWith('/vnc')) return undefined;
    if (req.method === 'POST' && rotaDeInicio('POST', r.alvo.caminho)) {
      const pedido = [];
      let tamPedido = 0;
      req.on('data', (c) => { if (tamPedido < 262144) { pedido.push(c); tamPedido += c.length; } });
      return (resposta) => {
        const corpo = [];
        let tam = 0;
        resposta.on('data', (c) => { if (tam < 65536) { corpo.push(c); tam += c.length; } });
        resposta.on('end', () => observador.aoIniciar({
          automacao: r.destino, quem: r.quem, caminho: r.alvo.caminho, status: resposta.statusCode, cabecalhos: resposta.headers,
          corpoPedido: Buffer.concat(pedido), corpoResposta: Buffer.concat(corpo),
        }));
      };
    }
    if (req.method === 'GET') {
      return (resposta) => {
        const leitor = observador.abrirSse({ automacao: r.destino, caminho: r.alvo.caminho });
        if (leitor) resposta.on('data', leitor);
      };
    }
    return undefined;
  }

  async function atender(req, res) {
    if (req.url.startsWith('/__arx-v2/')) return servirV2(req, res);
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
    repassar(req, res, r.alvo.base, r.alvo.caminho, r.alvo.prefixo, { setCookie: r.setCookie, aoResponder: observar(req, r), injetarV2: r.v2 });
  }

  async function atenderUpgrade(req, socket, cabeca) {
    socket.on('error', () => socket.destroy()); // navegador caiu no meio do aperto de mão
    const r = await resolver(req);
    if (!r.alvo) return socket.end(`HTTP/1.1 ${r.status === 403 ? '403 Forbidden' : '404 Not Found'}\r\nConnection: close\r\n\r\n`);
    repassarUpgrade(req, socket, cabeca, r.alvo.base, r.alvo.caminho);
  }

  return { atender, atenderUpgrade };
}

module.exports = { criarProxyAutomacoes, repassar, reescreverLocation, idDoPedido };
