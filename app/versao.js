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

// Registra GET /api/versao e serve a pasta do front revalidando .html/.js/.css a cada carga
// (ETag), para o "recarregar" nunca reaproveitar um app.js antigo do cache.
function registrarVersao(app, express, pastaPublic) {
  let versao = calcularVersao(pastaPublic);
  app.get('/api/versao', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ versao });
  });
  app.use(
    express.static(pastaPublic, {
      setHeaders(res, arquivo) {
        if (/\.(html|js|css)$/i.test(arquivo)) res.setHeader('Cache-Control', 'no-cache');
      },
    })
  );
  return { recalcular: () => (versao = calcularVersao(pastaPublic)), obter: () => versao };
}

module.exports = { calcularVersao, registrarVersao };
