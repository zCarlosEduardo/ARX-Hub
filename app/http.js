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

// Middleware final: responde JSON { error }. O stack fica só no log do
// servidor; 5xx devolve mensagem genérica ao cliente.
function erroFinal(log = console.error) {
  return (err, req, res, next) => {
    const status = Number.isInteger(err && (err.status || err.statusCode)) ? (err.status || err.statusCode) : 500;
    const codigo = status >= 400 && status < 600 ? status : 500;
    // O body-parser coloca um trecho do corpo na mensagem de erro, e o corpo das
    // rotas GLPI carrega o token do usuário: nunca ecoar nem logar essa mensagem.
    const corpoRuim = Boolean(err && typeof err.type === 'string' && err.type.startsWith('entity.'));
    if (corpoRuim) {
      log(`[erro] ${req.method} ${req.path} -> ${codigo}: corpo da requisição inválido (${err.type})`);
    } else if (codigo >= 500) {
      log(`[erro] ${req.method} ${req.path} -> ${codigo}:`, (err && err.stack) || err);
    } else {
      log(`[erro] ${req.method} ${req.path} -> ${codigo}: ${err && err.message}`);
    }
    if (res.headersSent) return next(err);
    let mensagem = 'Erro interno do servidor.';
    if (corpoRuim) mensagem = codigo === 413 ? 'Corpo da requisição grande demais.' : 'JSON inválido.';
    else if (codigo < 500 && err && err.expose !== false && err.message) mensagem = err.message;
    res.status(codigo).json({ error: mensagem });
  };
}

module.exports = { asyncHandler, ErroHttp, erroFinal };
