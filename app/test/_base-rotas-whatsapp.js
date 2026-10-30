// Rotas do robô do WhatsApp com Express de verdade, repositórios em memória e GLPI/classificador de mentira.
const assert = require('node:assert/strict');
const express = require('express');
const { criarRotasAdmin } = require('../rotasAdmin');
const { criarRotasWhatsapp } = require('../rotasWhatsapp');
const { asyncHandler, ErroHttp, erroFinal } = require('../http');
const { configPadrao } = require('../admin');
const { SITUACOES_COM_CHAMADO } = require('../repoWhatsapp');

const TOKEN_ADMIN = 'token-do-carlos-0123456789';
const TOKEN_OPERADOR = 'token-do-operador-5555555555';
const TOKEN_BOT = 'segredo-do-robo';
const TOKEN_SERVICO = 'token-de-servico-777777';
const USUARIOS = {
  [TOKEN_ADMIN]: { id: 7, login: 'carlos.alonso', nome: 'Carlos Eduardo de Souza Alonso', nomes: ['CARLOS EDUARDO DE SOUZA ALONSO'] },
  [TOKEN_OPERADOR]: { id: 9, login: 'operador', nome: 'Operador', nomes: ['OPERADOR'], grupos: [33] },
};

function repoAdminMemoria() {
  const config = new Map();
  const admins = [{ id: 1, glpiId: null, login: '', nome: 'Carlos Eduardo de Souza Alonso', criadoEm: 'x', criadoPor: 'i' }];
  return {
    config,
    async listarAdmins() { return admins.map((a) => ({ ...a })); },
    async fixarAdmin(id, d) { const a = admins.find((x) => x.id === id); if (a && a.glpiId == null) a.glpiId = d.glpiId; },
    async lerConfig(c) { return config.has(c) ? config.get(c) : null; },
    async gravarConfig(c, v) { config.set(c, v); },
  };
}

function repoWhatsMemoria() {
  const e = { vinculos: [], pedidos: [], seq: 0, proximo: 1 };
  const copia = (p) => (p ? { ...p } : null);
  return {
    e,
    async listarVinculos() { return e.vinculos.map((v) => ({ ...v })); },
    async salvarVinculo(v) { e.vinculos = e.vinculos.filter((x) => x.telefone !== v.telefone); e.vinculos.push({ ...v }); return { ...v }; },
    async removerVinculo(t) { const n = e.vinculos.length; e.vinculos = e.vinculos.filter((x) => x.telefone !== t); return e.vinculos.length < n; },
    async criarPedido(p) {
      const ja = e.pedidos.find((x) => x.mensagemId === p.mensagemId);
      if (ja) return { pedido: copia(ja), novo: false };
      const novo = { ...p, id: e.proximo++, ticketId: p.ticketId || null, erro: p.erro || '', evento: ++e.seq, criadoEm: Date.now() };
      e.pedidos.push(novo);
      return { pedido: copia(novo), novo: true };
    },
    async listarPendentes() { return e.pedidos.filter((p) => p.status === 'pendente').map(copia); },
    async listarAbertos() { return e.pedidos.filter((p) => SITUACOES_COM_CHAMADO.includes(p.status) && p.ticketId).map(copia); },
    async listarRecentes(n) { return e.pedidos.slice(-n).reverse().map(copia); },
    async reivindicar(id) { const p = e.pedidos.find((x) => x.id === id && x.status === 'pendente'); if (!p) return null; p.status = 'abrindo'; return copia(p); },
    async mudarStatus(id, status, o = {}) {
      const p = e.pedidos.find((x) => x.id === id);
      if (!p || (o.deSituacoes && !o.deSituacoes.includes(p.status))) return null;
      p.status = status; if (o.ticketId) p.ticketId = o.ticketId; if (o.erro !== undefined) p.erro = o.erro; p.evento = ++e.seq;
      return copia(p);
    },
    async pedidoPorChamado(t) { return copia(e.pedidos.filter((p) => p.ticketId === t && SITUACOES_COM_CHAMADO.includes(p.status)).pop()); },
    async eventosDesde(d) { return e.pedidos.filter((p) => p.evento > d).sort((a, b) => a.evento - b.evento).map(copia); },
    async ultimoEvento() { return e.seq; },
  };
}

async function subir({ servico = true, bot = true, tipoPorTexto, robo = null, ia = null } = {}) {
  const repoAdm = repoAdminMemoria();
  const repo = repoWhatsMemoria();
  const abertos = [];
  const statusDosChamados = new Map();
  let falhaGlpi = null;
  const glpi = {
    async identificarUsuario(t) { if (USUARIOS[t]) return USUARIOS[t]; throw new Error('token recusado'); },
    async criarChamado(token, dados) {
      if (falhaGlpi) throw new Error(`${falhaGlpi} (token ${token})`);
      const id = 1000 + abertos.length;
      abertos.push({ token, ...dados, id });
      statusDosChamados.set(id, 1);
      return id;
    },
    async statusChamado(token, id) { return statusDosChamados.get(id) || 1; },
    async fetchLookup() { return { categories: [{ id: 2, label: 'ARX - Demandas Internas' }, { id: 45, label: 'Tech' }, { id: 46, label: 'Valle' }], users: [] }; },
    async createTicketComAnexos(token, dados, anexos) {
      if (falhaGlpi) throw new Error(falhaGlpi);
      const id = 1000 + abertos.length;
      abertos.push({ token, ...dados, id, anexos });
      return { id, anexados: anexos.length, falhas: [] };
    },
  };
  const classificar = async (texto) => {
    if (tipoPorTexto) return tipoPorTexto(texto);
    if (/senha/i.test(texto)) return { tipo: 'alterar_senha_sga', tipoNome: 'Alterar senha do SGA' };
    if (/foto/i.test(texto)) return { tipo: 'foto_perfil', tipoNome: 'Foto de perfil' };
    return { tipo: null, tipoNome: '' };
  };
  const admin = criarRotasAdmin({ repo: repoAdm, glpi, asyncHandler, ErroHttp });
  const wa = criarRotasWhatsapp({ repo, admin, glpi, classificar, tokenBot: bot ? TOKEN_BOT : '', tokenServico: servico ? TOKEN_SERVICO : '', asyncHandler, ErroHttp, robo, ia });
  const app = express();
  app.use(express.json());
  admin.registrar(app);
  wa.registrar(app);
  app.use(erroFinal(() => {}));
  const srv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const chamar = async (metodo, caminho, { corpo, headers } = {}) => {
    const r = await fetch(base + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', ...(headers || {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    const texto = await r.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* sem corpo */ }
    return { status: r.status, json };
  };
  const comoBot = (metodo, caminho, corpo) => chamar(metodo, caminho, { corpo, headers: { 'X-Bot-Token': TOKEN_BOT } });
  const comoAdmin = (metodo, caminho, corpo) => chamar(metodo, caminho, { corpo, headers: { 'X-Glpi-Token': TOKEN_ADMIN } });
  const comoOperador = (metodo, caminho, corpo) => chamar(metodo, caminho, { corpo, headers: { 'X-Glpi-Token': TOKEN_OPERADOR } });
  const configurar = async (mud) => {
    const base0 = configPadrao().whatsapp;
    const cfg = { ...base0, ativo: true, modo: 'ativo', grupos: [{ id: 'g1', nome: 'Grupo Tech', jid: '1203@g.us', categoriaId: 45, categoriaLabel: 'Tech', tipos: [], responder: true, reagir: true }], ...mud };
    const r = await comoAdmin('PUT', '/api/admin/config/whatsapp', cfg);
    assert.equal(r.status, 200, JSON.stringify(r.json));
  };
  const vincular = (tel = '(31) 98888-7777', glpiId = 12, nome = 'Maria Silva') => comoAdmin('POST', '/api/admin/whatsapp/vinculos', { telefone: tel, glpiId, nome });
  const mensagem = (extra = {}) => comoBot('POST', '/api/whatsapp/bot/mensagem', { mensagemId: 'm1', grupoJid: '1203@g.us', grupoNome: 'Grupo Tech', remetente: '553188887777@s.whatsapp.net', texto: 'Alterar a senha do SGA do Fulano de Tal', ...extra });
  return { repo, abertos, statusDosChamados, comoBot, comoAdmin, comoOperador, chamar, configurar, vincular, mensagem, wa, definirFalha: (m) => { falhaGlpi = m; }, fechar: () => { srv.closeAllConnections(); srv.close(); } };
}

module.exports = { subir, TOKEN_ADMIN, TOKEN_OPERADOR, TOKEN_BOT, TOKEN_SERVICO };
