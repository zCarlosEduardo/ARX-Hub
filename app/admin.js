// Administração do Hub (funções puras, testáveis): quem é admin, validação das configurações e da ordem das automações.
//
// Quem é admin: a identidade vem do GLPI (o token do usuário abre uma sessão e o GLPI diz quem é). O Hub NÃO tem login próprio;
// este módulo só decide se aquela pessoa está na lista de admins. A lista casa por id do GLPI (o mais seguro), por login ou por
// nome completo. Na primeira vez que alguém casa por login ou nome, o id do GLPI é gravado (aí só o id vale).

const norm = (s) =>
  String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Lê o que o GLPI devolve em GET /getFullSession e devolve { id, login, nome, nomes }.
 * `nomes` são as formas normalizadas do nome completo (nome sobrenome, sobrenome nome, nome de exibição), para comparar.
 * @returns {{id: number|null, login: string, nome: string, nomes: string[]} | null}
 */
function usuarioDaSessao(resposta) {
  const s = resposta && typeof resposta === 'object' ? resposta.session || resposta : null;
  if (!s || typeof s !== 'object') return null;
  const id = Number(s.glpiID);
  const login = String(s.glpiname || '').trim();
  const primeiro = String(s.glpifirstname || '').trim();
  const ultimo = String(s.glpirealname || '').trim();
  const amigavel = String(s.glpifriendlyname || '').trim();
  const completo = [primeiro, ultimo].filter(Boolean).join(' ');
  const nome = completo || amigavel || login;
  if (!Number.isInteger(id) && !login && !nome) return null;
  const nomes = [...new Set([completo, [ultimo, primeiro].filter(Boolean).join(' '), amigavel, login].map(norm).filter(Boolean))];
  return { id: Number.isInteger(id) && id > 0 ? id : null, login, nome, nomes };
}

/**
 * A pessoa está na lista de admins? Devolve a entrada que casou (com `porId: false` quando casou por login ou nome e o id
 * ainda não estava gravado, para o servidor gravar) ou null.
 * @param {{id: number|null, login: string, nomes: string[]}} usuario
 * @param {Array<{id: number, glpiId: number|null, login: string, nome: string}>} admins
 */
function adminCorrespondente(usuario, admins) {
  if (!usuario) return null;
  for (const a of admins || []) {
    if (a.glpiId != null) {
      if (usuario.id != null && a.glpiId === usuario.id) return { admin: a, porId: true };
      continue; // com id gravado, login e nome não valem (evita homônimo)
    }
    if (a.login && norm(a.login) === norm(usuario.login)) return { admin: a, porId: false };
    if (a.nome && usuario.nomes.includes(norm(a.nome))) return { admin: a, porId: false };
  }
  return null;
}

/** Nomes iniciais de admin vindos da variável de ambiente (separados por ; ou vírgula), sem repetir. */
function adminsIniciais(texto) {
  const vistos = new Set();
  const lista = [];
  for (const bruto of String(texto || '').split(/[;\n]/)) {
    const nome = bruto.trim();
    if (nome && !vistos.has(norm(nome))) {
      vistos.add(norm(nome));
      lista.push(nome);
    }
  }
  return lista;
}

// ---------- configurações ----------
const SESSOES_COFRE = ['dia', 'horas', 'aba', 'pedir'];
const MODOS_WHATSAPP = ['observacao', 'aprovacao', 'automatico'];
/** Tipos de solicitação que o robô do WhatsApp pode tratar (mesmas chaves do chamados-glpi). */
const TIPOS_SOLICITACAO = [
  { chave: 'cadastro_consultor', nome: 'Cadastro de consultor' },
  { chave: 'cadastro_usuario', nome: 'Cadastro de usuário' },
  { chave: 'inativacao_consultor', nome: 'Inativação de consultor' },
  { chave: 'bloqueio_acesso', nome: 'Bloqueio de acesso' },
  { chave: 'senha_sistemas', nome: 'Senha de sistemas' },
  { chave: 'alterar_senha_sga', nome: 'Alterar senha do SGA' },
  { chave: 'foto_perfil', nome: 'Foto de perfil' },
  { chave: 'sincronizar_vistoria', nome: 'Sincronizar vistoria' },
  { chave: 'cadastro_modelo', nome: 'Cadastro de modelo' },
  { chave: 'erro_exportar_modelo', nome: 'Erro ao exportar modelo' },
  { chave: 'fechamento', nome: 'Fechamento' },
];
const CHAVES_TIPOS = new Set(TIPOS_SOLICITACAO.map((t) => t.chave));
const SLUG = /^[a-z0-9][a-z0-9_-]{0,29}$/;

function configPadrao() {
  return {
    cofre: { modo: 'ativo', sessao: 'dia', horas: 8 },
    whatsapp: {
      ativo: false,
      modo: 'observacao',
      numeros: [],
      grupos: [],
      remetentesAutorizados: [],
      reacoes: { sucesso: '✅', erro: '⚠️', duvida: '❓' },
    },
  };
}

const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max + 1) : '');
const soDigitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');

function validarCofre(b) {
  const padrao = configPadrao().cofre;
  const c = b && typeof b === 'object' ? b : {};
  const modo = c.modo === undefined ? padrao.modo : c.modo;
  if (modo !== 'ativo' && modo !== 'desativado') return { erro: 'cofre.modo deve ser ativo ou desativado' };
  const sessao = c.sessao === undefined ? padrao.sessao : c.sessao;
  if (!SESSOES_COFRE.includes(sessao)) return { erro: `cofre.sessao deve ser uma de: ${SESSOES_COFRE.join(', ')}` };
  const horas = c.horas === undefined ? padrao.horas : Number(c.horas);
  if (!Number.isInteger(horas) || horas < 1 || horas > 72) return { erro: 'cofre.horas deve ser um número inteiro de 1 a 72' };
  return { valor: { modo, sessao, horas } };
}

function validarWhatsapp(b) {
  const padrao = configPadrao().whatsapp;
  const w = b && typeof b === 'object' ? b : {};
  const ativo = w.ativo === undefined ? padrao.ativo : w.ativo;
  if (typeof ativo !== 'boolean') return { erro: 'whatsapp.ativo deve ser verdadeiro ou falso' };
  const modo = w.modo === undefined ? padrao.modo : w.modo;
  if (!MODOS_WHATSAPP.includes(modo)) return { erro: `whatsapp.modo deve ser um de: ${MODOS_WHATSAPP.join(', ')}` };

  const numerosBrutos = w.numeros === undefined ? [] : w.numeros;
  if (!Array.isArray(numerosBrutos) || numerosBrutos.length > 10) return { erro: 'whatsapp.numeros deve ser uma lista de até 10 números' };
  const numeros = [];
  const idsNumeros = new Set();
  for (const n of numerosBrutos) {
    if (!n || typeof n !== 'object') return { erro: 'cada número do WhatsApp deve ser um objeto' };
    if (typeof n.id !== 'string' || !SLUG.test(n.id)) return { erro: 'o id do número deve ter letras minúsculas, números, hífen ou sublinhado (até 30)' };
    if (idsNumeros.has(n.id)) return { erro: `o número "${n.id}" está repetido` };
    idsNumeros.add(n.id);
    const rotulo = texto(n.rotulo, 60);
    if (!rotulo || rotulo.length > 60) return { erro: 'cada número precisa de um nome de até 60 caracteres' };
    const telefone = soDigitos(n.telefone);
    if (telefone && (telefone.length < 10 || telefone.length > 15)) return { erro: `o telefone de "${rotulo}" deve ter de 10 a 15 dígitos (com DDI e DDD)` };
    numeros.push({ id: n.id, rotulo, telefone, ativo: n.ativo !== false });
  }

  const gruposBrutos = w.grupos === undefined ? [] : w.grupos;
  if (!Array.isArray(gruposBrutos) || gruposBrutos.length > 100) return { erro: 'whatsapp.grupos deve ser uma lista de até 100 grupos' };
  const grupos = [];
  const idsGrupos = new Set();
  for (const g of gruposBrutos) {
    if (!g || typeof g !== 'object') return { erro: 'cada grupo deve ser um objeto' };
    if (typeof g.id !== 'string' || !SLUG.test(g.id)) return { erro: 'o id do grupo deve ter letras minúsculas, números, hífen ou sublinhado (até 30)' };
    if (idsGrupos.has(g.id)) return { erro: `o grupo "${g.id}" está repetido` };
    idsGrupos.add(g.id);
    const nome = texto(g.nome, 120);
    if (!nome || nome.length > 120) return { erro: 'cada grupo precisa de um nome de até 120 caracteres' };
    const jid = texto(g.jid, 120);
    if (jid.length > 120) return { erro: `o identificador do grupo "${nome}" passa de 120 caracteres` };
    const numeroId = typeof g.numeroId === 'string' ? g.numeroId : '';
    if (numeroId && !idsNumeros.has(numeroId)) return { erro: `o grupo "${nome}" usa um número que não existe na lista` };
    const tiposBrutos = g.tipos === undefined ? [] : g.tipos;
    if (!Array.isArray(tiposBrutos)) return { erro: `os tipos do grupo "${nome}" devem ser uma lista` };
    const tipos = [...new Set(tiposBrutos.map(String))];
    const invalido = tipos.find((t) => !CHAVES_TIPOS.has(t));
    if (invalido) return { erro: `o tipo "${invalido}" do grupo "${nome}" não existe` };
    grupos.push({ id: g.id, nome, jid, numeroId, tipos, ativo: g.ativo !== false, responder: g.responder === true, reagir: g.reagir !== false });
  }

  const autorizadosBrutos = w.remetentesAutorizados === undefined ? [] : w.remetentesAutorizados;
  if (!Array.isArray(autorizadosBrutos) || autorizadosBrutos.length > 200) return { erro: 'whatsapp.remetentesAutorizados deve ser uma lista de até 200 telefones' };
  const remetentesAutorizados = [];
  for (const t of autorizadosBrutos) {
    const d = soDigitos(t);
    if (d.length < 10 || d.length > 15) return { erro: 'cada remetente autorizado deve ter de 10 a 15 dígitos (com DDI e DDD)' };
    if (!remetentesAutorizados.includes(d)) remetentesAutorizados.push(d);
  }

  const r = w.reacoes && typeof w.reacoes === 'object' ? w.reacoes : {};
  const reacoes = {};
  for (const chave of ['sucesso', 'erro', 'duvida']) {
    const v = r[chave] === undefined ? padrao.reacoes[chave] : r[chave];
    if (typeof v !== 'string' || !v.trim() || [...v.trim()].length > 4) return { erro: `a reação "${chave}" deve ser um emoji` };
    reacoes[chave] = v.trim();
  }
  return { valor: { ativo, modo, numeros, grupos, remetentesAutorizados, reacoes } };
}

/** Valida UMA seção da configuração. @returns {{ok: true, valor: object} | {ok: false, error: string}} */
function validarSecao(chave, corpo) {
  const r = chave === 'cofre' ? validarCofre(corpo) : chave === 'whatsapp' ? validarWhatsapp(corpo) : { erro: 'seção de configuração desconhecida' };
  return r.erro ? { ok: false, error: r.erro } : { ok: true, valor: r.valor };
}

/** Admin novo: id do GLPI, login ou nome (ao menos um). */
function validarNovoAdmin(corpo) {
  const b = corpo && typeof corpo === 'object' ? corpo : {};
  const glpiId = b.glpiId === undefined || b.glpiId === null || b.glpiId === '' ? null : Number(b.glpiId);
  if (glpiId !== null && (!Number.isInteger(glpiId) || glpiId < 1)) return { ok: false, error: 'glpiId inválido' };
  const login = texto(b.login, 80);
  const nome = texto(b.nome, 160);
  if (login.length > 80 || nome.length > 160) return { ok: false, error: 'login ou nome grande demais' };
  if (glpiId === null && !login && !nome) return { ok: false, error: 'informe a pessoa (id, login ou nome do GLPI)' };
  return { ok: true, valor: { glpiId, login, nome } };
}

/** Nova ordem das automações: lista de ids sem repetir. */
function validarOrdem(corpo) {
  const ids = corpo && Array.isArray(corpo.ids) ? corpo.ids : null;
  if (!ids || !ids.length || ids.length > 500) return { ok: false, error: 'ids deve ser uma lista com as automações na nova ordem' };
  const saida = [];
  for (const bruto of ids) {
    const s = String(bruto);
    if (!/^[1-9][0-9]{0,15}$/.test(s)) return { ok: false, error: 'id de automação inválido' };
    const n = Number(s);
    if (!Number.isSafeInteger(n) || saida.includes(n)) return { ok: false, error: 'ids repetidos ou inválidos' };
    saida.push(n);
  }
  return { ok: true, valor: saida };
}

module.exports = {
  norm,
  usuarioDaSessao,
  adminCorrespondente,
  adminsIniciais,
  configPadrao,
  validarSecao,
  validarNovoAdmin,
  validarOrdem,
  TIPOS_SOLICITACAO,
  SESSOES_COFRE,
  MODOS_WHATSAPP,
};
