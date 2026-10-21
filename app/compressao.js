const compression = require('compression');

// SSE (text/event-stream) nunca é comprimido: o gzip segura os bytes no buffer e o aviso de "mudou" não chega na hora.
// O resto segue a regra padrão do compression (tipo compressível e cliente que aceita gzip).
function deveComprimir(req, res) {
  if (String(res.getHeader('Content-Type') || '').includes('text/event-stream')) return false;
  return compression.filter(req, res);
}

module.exports = { deveComprimir };
