// Leitura e validação de variáveis de ambiente (funções puras, testáveis).
const SENHAS_PADRAO = ['arxhub_dev_password', 'change_me_before_deploying'];

function inteiroPositivo(valor, padrao) {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : padrao;
}

function lerConfig(env = process.env) {
  return {
    port: inteiroPositivo(env.PORT, 8317),
    checkIntervalMs: inteiroPositivo(env.CHECK_INTERVAL_MS, 15000),
    checkTimeoutMs: inteiroPositivo(env.CHECK_TIMEOUT_MS, 3000),
  };
}

// Em produção a senha do Postgres precisa vir do .env; o compose só usa a senha
// de desenvolvimento quando a variável não existe, e isso não pode ir ao ar.
function verificarSenhaProducao(env = process.env) {
  if (env.NODE_ENV !== 'production') return { ok: true };
  const senha = env.POSTGRES_PASSWORD;
  if (!senha) {
    return { ok: false, error: 'POSTGRES_PASSWORD não definida em produção. Defina no .env (veja .env.example) antes de subir o Hub.' };
  }
  if (SENHAS_PADRAO.includes(senha)) {
    return { ok: true, aviso: 'POSTGRES_PASSWORD ainda é a senha de exemplo/desenvolvimento; troque por uma senha própria.' };
  }
  return { ok: true };
}

module.exports = { lerConfig, verificarSenhaProducao, inteiroPositivo };
