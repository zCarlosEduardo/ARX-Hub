// Express 4 não captura rejeição de handler async: sem este wrapper a request
// fica pendurada e vira unhandledRejection.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

class ErroHttp extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

// Middleware final: responde JSON { error }. O detalhe (stack) fica só no log
// do servidor; 5xx devolve mensagem genérica ao cliente.
function erroFinal(log = console.error) {
  return (err, req, res, next) => {
    const status = Number.isInteger(err && (err.status || err.statusCode)) ? (err.status || err.statusCode) : 500;
    const codigo = status >= 400 && status < 600 ? status : 500;
    log(`[erro] ${req.method} ${req.path} -> ${codigo}:`, (err && err.stack) || err);
    if (res.headersSent) return next(err);
    const mensagem = codigo < 500 && err && err.expose !== false && err.message ? err.message : 'Erro interno do servidor.';
    res.status(codigo).json({ error: mensagem });
  };
}

module.exports = { asyncHandler, ErroHttp, erroFinal };
