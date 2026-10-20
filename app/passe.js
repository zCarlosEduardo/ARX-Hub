// Passe de acesso a uma automação pelo proxy (porta 8318). O Hub confere quem é a pessoa (token do GLPI) e se ela pode
// ver a automação, e entrega um passe assinado (HMAC-SHA256) que o proxy exige das automações restritas por grupo. O
// passe diz também quem abriu a tela, para o histórico de execuções. A chave nasce a cada subida do Hub: reiniciar
// invalida os passes, e a tela pede outro ao recarregar.
const crypto = require('crypto');

const VALIDADE_MS = 12 * 60 * 60 * 1000;

function criarPasses({ segredo = crypto.randomBytes(32), agora = Date.now } = {}) {
  const assinar = (dados) => crypto.createHmac('sha256', segredo).update(dados).digest('base64url');

  /** @param {{automacaoId: string|number, usuario: {id: number|null, nome: string}|null}} p */
  function emitir({ automacaoId, usuario }) {
    const corpo = { a: String(automacaoId), u: usuario ? { id: usuario.id == null ? null : usuario.id, nome: String(usuario.nome || '') } : null, exp: agora() + VALIDADE_MS };
    const dados = Buffer.from(JSON.stringify(corpo)).toString('base64url');
    return `${dados}.${assinar(dados)}`;
  }

  /** Devolve { usuario } se o passe é desta automação, está assinado e no prazo; senão null. */
  function ler(passe, automacaoId) {
    if (typeof passe !== 'string' || passe.length > 2000) return null;
    const [dados, assinatura] = passe.split('.');
    if (!dados || !assinatura) return null;
    const esperada = Buffer.from(assinar(dados));
    const recebida = Buffer.from(assinatura);
    if (esperada.length !== recebida.length || !crypto.timingSafeEqual(esperada, recebida)) return null;
    let corpo;
    try {
      corpo = JSON.parse(Buffer.from(dados, 'base64url').toString('utf8'));
    } catch {
      return null; // assinatura certa com conteúdo estragado não acontece; se acontecer, recusa
    }
    if (!corpo || corpo.a !== String(automacaoId) || !(corpo.exp > agora())) return null;
    return { usuario: corpo.u || null };
  }

  return { emitir, ler, VALIDADE_MS };
}

module.exports = { criarPasses };
