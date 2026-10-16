// Regras puras do robô do WhatsApp (sem Express nem banco): telefone, vínculo telefone x usuário do GLPI, texto do chamado
// que o robô abre e reação de cada situação do pedido. As rotas ficam em rotasWhatsapp.js.

const soDigitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');

/**
 * Telefone só com dígitos e DDI. Aceita "(31) 98888-7777", "+55 31 ..." e o JID do WhatsApp ("5531...:12@s.whatsapp.net").
 * Sem DDI (10 ou 11 dígitos) vale Brasil (55). Devolve '' quando não parece um telefone.
 */
function normalizarTelefone(valor) {
  const bruto = String(valor == null ? '' : valor).split('@')[0].split(':')[0];
  let d = soDigitos(bruto).replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d.length >= 12 && d.length <= 15 ? d : '';
}

/** O WhatsApp de número antigo vem sem o nono dígito: cada telefone brasileiro de celular tem duas grafias possíveis. */
function chavesTelefone(valor) {
  const n = normalizarTelefone(valor);
  if (!n) return [];
  const chaves = [n];
  if (n.startsWith('55') && n.length === 13 && n[4] === '9') chaves.push(n.slice(0, 4) + n.slice(5));
  if (n.startsWith('55') && n.length === 12 && '6789'.includes(n[4])) chaves.push(`${n.slice(0, 4)}9${n.slice(4)}`);
  return chaves;
}

function mesmoTelefone(a, b) {
  const x = chavesTelefone(a);
  const y = chavesTelefone(b);
  return x.length > 0 && x.some((c) => y.includes(c));
}

/** Vínculo: telefone do solicitante x usuário do GLPI (id) que vai como requerente do chamado. */
function validarVinculo(corpo) {
  const b = corpo && typeof corpo === 'object' ? corpo : {};
  const telefone = normalizarTelefone(b.telefone);
  if (!telefone) return { ok: false, error: 'informe um telefone válido, com DDD' };
  const glpiId = Number(b.glpiId);
  if (!Number.isInteger(glpiId) || glpiId < 1) return { ok: false, error: 'escolha o usuário do GLPI' };
  const nome = typeof b.nome === 'string' ? b.nome.trim() : '';
  if (nome.length > 160) return { ok: false, error: 'o nome passa de 160 caracteres' };
  return { ok: true, valor: { telefone, glpiId, nome } };
}

function acharVinculo(vinculos, telefone) {
  return (vinculos || []).find((v) => mesmoTelefone(v.telefone, telefone)) || null;
}

/** Título (primeira linha da mensagem) e descrição do chamado que o robô abre. */
function montarChamado({ texto, vinculo, grupo, tipoNome }) {
  const t = String(texto || '').trim();
  const primeira = t.split(/\r?\n/).map((l) => l.trim()).find(Boolean) || '';
  const titulo = (primeira || tipoNome || 'Solicitação pelo WhatsApp').slice(0, 120);
  const origem = `Aberto pelo ARX Hub a partir do WhatsApp (grupo ${(grupo && grupo.nome) || 'Não informado'}, solicitante ${(vinculo && vinculo.nome) || 'Não informado'}).`;
  return { titulo, descricao: t ? `${t}\n\n${origem}` : origem };
}

/** Situação do pedido -> reação na mensagem (null = não reage). */
function reacaoDoStatus(status, reacoes) {
  const r = reacoes || {};
  const mapa = { pendente: r.aFazer, aberto: r.andamento, concluido: r.sucesso, erro: r.erro, sem_vinculo: r.duvida, sem_tipo: r.duvida };
  return mapa[status] || null;
}

function textoResposta(modelo, { ticketId, solicitante, tipo }) {
  return String(modelo || '')
    .replace(/\{chamado\}/g, String(ticketId == null ? '' : ticketId))
    .replace(/\{solicitante\}/g, solicitante || '')
    .replace(/\{tipo\}/g, tipo || '');
}

module.exports = { normalizarTelefone, chavesTelefone, mesmoTelefone, validarVinculo, acharVinculo, montarChamado, reacaoDoStatus, textoResposta };
