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

/** Servidor da porta das automações. `buscarUrl(id)` devolve a URL cadastrada ou null. */
function criarProxyAutomacoes({ buscarUrl }) {
  return async function atender(req, res) {
    const achado = idDoPedido(req);
    const nada = (status, texto) => {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(texto);
    };
    if (!achado) return nada(404, 'Não encontrado.');
    const prefixo = `/a/${achado.id}`;
    if (achado.porCaminho && !achado.temBarra) {
      // sem a barra final os caminhos relativos da tela (app.js, style.css) sairiam de /a/
      const query = req.url.slice(prefixo.length);
      res.writeHead(301, { Location: prefixo + '/' + query });
      return res.end();
    }
    let destino;
    try {
      destino = await buscarUrl(achado.id);
    } catch {
      return nada(503, 'Hub sem acesso ao cadastro das automações.');
    }
    if (!destino) return nada(404, 'Automação não cadastrada.');
    const caminho = achado.porCaminho ? req.url.slice(prefixo.length) : req.url;
    repassar(req, res, destino, caminho, prefixo);
  };
}

module.exports = { criarProxyAutomacoes, repassar, reescreverLocation, idDoPedido };
