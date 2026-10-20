const BASE_URL = (process.env.GLPI_BASE_URL || '').replace(/\/+$/, '');
const APP_TOKEN = process.env.GLPI_APP_TOKEN || '';
// Todo chamado aberto por este widget cai nesta entidade (ex.: 1 = "Sistemas").
const ENTITY_ID = process.env.GLPI_ENTITY_ID || '';
// Raiz do site (sem o /api.php/v1) — usada só pra montar o link direto do
// chamado (front/ticket.form.php), nunca chamada como API.
const SITE_URL = (process.env.GLPI_SITE_URL || BASE_URL.replace(/\/api\.php\/.*/i, '') || 'https://suporte.mutualle.com.br').replace(/\/+$/, '');

function ticketUrl(ticketId) {
  return `${SITE_URL}/front/ticket.form.php?id=${ticketId}`;
}

function assertConfigured() {
  if (!BASE_URL || !APP_TOKEN) {
    throw new Error('GLPI não configurado no servidor (defina GLPI_BASE_URL e GLPI_APP_TOKEN).');
  }
}

async function glpiFetch(path, options = {}) {
  const res = await fetch(BASE_URL + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = Array.isArray(data) ? data.join('; ') : (data && data.message) || text || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

async function initSession(userToken) {
  assertConfigured();
  if (!userToken) throw new Error('Informe o token do GLPI.');
  const data = await glpiFetch('/initSession', {
    method: 'GET',
    headers: { 'App-Token': APP_TOKEN, Authorization: 'user_token ' + userToken },
  });
  if (!data || !data.session_token) throw new Error('O GLPI não devolveu o session_token. Confira o token informado.');
  return data.session_token;
}

async function killSession(sessionToken) {
  try {
    await glpiFetch('/killSession', {
      method: 'GET',
      headers: { 'App-Token': APP_TOKEN, 'Session-Token': sessionToken },
    });
  } catch {
    // best-effort — não é crítico se a sessão expirar sozinha
  }
}

// O user_token é uma credencial pessoal: não pode aparecer em log, resposta de
// erro nem banco. Se o GLPI (ou o fetch) ecoar o token numa mensagem de erro,
// trocamos por [oculto] antes de o erro sair deste módulo.
function sanitizar(mensagem, segredos) {
  let texto = String(mensagem == null ? '' : mensagem);
  for (const s of segredos) {
    if (typeof s === 'string' && s.length >= 4) texto = texto.split(s).join('[oculto]');
  }
  return texto;
}

async function withSession(userToken, fn) {
  let sessionToken = null;
  try {
    sessionToken = await initSession(userToken);
    return await fn(sessionToken);
  } catch (err) {
    throw new Error(sanitizar(err && err.message, [userToken, sessionToken]));
  } finally {
    if (sessionToken) await killSession(sessionToken);
  }
}

async function fetchLookup(userToken) {
  return withSession(userToken, async (sessionToken) => {
    const headers = { 'App-Token': APP_TOKEN, 'Session-Token': sessionToken };
    const [categoriesRaw, usersRaw] = await Promise.all([
      glpiFetch('/ITILCategory?range=0-300', { headers }),
      glpiFetch('/User?range=0-300', { headers }),
    ]);

    const categories = (Array.isArray(categoriesRaw) ? categoriesRaw : [])
      .map((c) => ({ id: c.id, label: c.completename || c.name }))
      .filter((c) => c.id && c.label)
      .sort((a, b) => a.label.localeCompare(b.label));

    const users = (Array.isArray(usersRaw) ? usersRaw : [])
      .map((u) => ({ id: u.id, label: [u.realname, u.firstname].filter(Boolean).join(' ') || u.name }))
      .filter((u) => u.id && u.label)
      .sort((a, b) => a.label.localeCompare(b.label));

    return { categories, users };
  });
}

/** Grupos do GLPI ({ id, label }) para escolher quem vê cada automação, lidos com o token de quem pede. */
async function listarGrupos(userToken) {
  return withSession(userToken, async (sessionToken) => {
    const raw = await glpiFetch('/Group?range=0-500', { headers: { 'App-Token': APP_TOKEN, 'Session-Token': sessionToken } });
    return (Array.isArray(raw) ? raw : [])
      .map((g) => ({ id: g.id, label: g.completename || g.name }))
      .filter((g) => g.id && g.label)
      .sort((a, b) => a.label.localeCompare(b.label));
  });
}

async function createTicket(userToken, { titulo, descricao, categoriaId, requerenteId, atribuidoId }) {
  if (!titulo || !titulo.trim()) throw new Error('Título é obrigatório.');
  return withSession(userToken, async (sessionToken) => {
    const input = { name: titulo.trim(), content: descricao || '' };
    if (categoriaId) input.itilcategories_id = Number(categoriaId);
    if (requerenteId) input._users_id_requester = Number(requerenteId);
    if (atribuidoId) input._users_id_assign = Number(atribuidoId);
    if (ENTITY_ID) input.entities_id = Number(ENTITY_ID);

    const data = await glpiFetch('/Ticket', {
      method: 'POST',
      headers: { 'App-Token': APP_TOKEN, 'Session-Token': sessionToken },
      body: JSON.stringify({ input }),
    });
    const id = Array.isArray(data) ? data[0] && data[0].id : data && data.id;
    if (!id) throw new Error('GLPI não retornou o id do chamado criado.');
    return id;
  });
}

/** Situação do chamado no GLPI (1 novo ... 5 solucionado, 6 fechado), lida com o token informado. */
async function statusChamado(userToken, ticketId) {
  return withSession(userToken, async (sessionToken) => {
    const t = await glpiFetch(`/Ticket/${Number(ticketId)}`, { headers: { 'App-Token': APP_TOKEN, 'Session-Token': sessionToken } });
    return Number(t && t.status);
  });
}

/**
 * Quem é a pessoa dona do token (GET /getFullSession): { id, login, nome, nomes } ou erro. Serve para o painel de
 * administração saber se ela está na lista de admins. O token não é guardado nem logado.
 */
async function identificarUsuario(userToken) {
  const { usuarioDaSessao } = require('./admin');
  return withSession(userToken, async (sessionToken) => {
    const sessao = await glpiFetch('/getFullSession', { method: 'GET', headers: { 'App-Token': APP_TOKEN, 'Session-Token': sessionToken } });
    const usuario = usuarioDaSessao(sessao);
    if (!usuario) throw new Error('O GLPI não informou quem é o dono do token.');
    return usuario;
  });
}

module.exports = { statusChamado, criarChamado: createTicket, fetchLookup, createTicket, ticketUrl, sanitizar, identificarUsuario, listarGrupos };
