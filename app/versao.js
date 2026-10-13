// Versão do front de uma automação: um hash curto do conteúdo da pasta `public`.
// A tela aberta pergunta `GET /api/versao` de tempos em tempos (ver ArxVersao em arx-ui.js)
// e recarrega quando o valor muda. Só muda quando o front muda, não a cada reinício.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Dados de execução e dependências nunca fazem parte do front.
const IGNORADAS = new Set(['uploads', 'logs', 'downloads', 'dados', 'node_modules']);

function listarArquivos(raiz, rel = '') {
  const achados = [];
  let entradas;
  try {
    entradas = fs.readdirSync(path.join(raiz, rel), { withFileTypes: true });
  } catch {
    return achados; // pasta inexistente: versão de pasta vazia
  }
  for (const e of entradas) {
    if (e.name.startsWith('.') || IGNORADAS.has(e.name)) continue;
    const relFilho = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) achados.push(...listarArquivos(raiz, relFilho));
    else if (e.isFile()) achados.push(relFilho);
  }
  return achados;
}

// pastas: um caminho ou uma lista. Fim de linha não conta (CRLF vira LF).
function calcularVersao(pastas) {
  const hash = crypto.createHash('sha1');
  for (const pasta of [].concat(pastas)) {
    for (const rel of listarArquivos(pasta).sort()) {
      const conteudo = fs.readFileSync(path.join(pasta, rel)).toString('latin1').replace(/\r\n/g, '\n');
      hash.update(`${rel}\0${conteudo}\0`, 'latin1');
    }
  }
  return hash.digest('hex').slice(0, 12);
}

// Acrescenta ?v=<versão> nos <script src> e <link href> LOCAIS (.js/.css) do HTML. Com isso, quando o front
// muda, o navegador pede o arquivo novo mesmo que tenha uma cópia antiga "fresca" no cache (um F5 comum
// basta). Ignora URLs externas (http, //), data: e as que já têm query string.
function injetarVersaoNoHtml(html, versao) {
  if (!versao) return html;
  return html.replace(
    /(<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*)(["'])([^"']+?\.(?:js|css))\2/gi,
    (todo, antes, aspas, url) => {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) return todo;
      return `${antes}${aspas}${url}?v=${versao}${aspas}`;
    }
  );
}

// Registra GET /api/versao, serve o index.html com ?v= nos scripts/estilos e o resto da pasta do front
// revalidando .html/.js/.css a cada carga (ETag), para o "recarregar" nunca reaproveitar um app.js antigo.
function registrarVersao(app, express, pastaPublic) {
  let versao = calcularVersao(pastaPublic);
  let indexPronto = null; // { versao, html }

  const servirIndex = (req, res, next) => {
    let html;
    try {
      if (!indexPronto || indexPronto.versao !== versao) {
        const bruto = fs.readFileSync(path.join(pastaPublic, 'index.html'), 'utf8');
        indexPronto = { versao, html: injetarVersaoNoHtml(bruto, versao) };
      }
      html = indexPronto.html;
    } catch {
      return next(); // sem index.html: deixa o static responder (404)
    }
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.send(html);
  };

  app.get('/api/versao', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ versao });
  });
  app.get(['/', '/index.html'], servirIndex);
  app.use(
    express.static(pastaPublic, {
      setHeaders(res, arquivo) {
        if (/\.(html|js|css)$/i.test(arquivo)) res.setHeader('Cache-Control', 'no-cache');
      },
    })
  );
  return { recalcular: () => (versao = calcularVersao(pastaPublic)), obter: () => versao };
}

module.exports = { calcularVersao, registrarVersao, injetarVersaoNoHtml };
