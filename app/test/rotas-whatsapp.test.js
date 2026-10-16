// Rotas do robô do WhatsApp com Express de verdade, repositórios em memória e GLPI/classificador de mentira.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { criarRotasAdmin } = require('../rotasAdmin');
const { criarRotasWhatsapp } = require('../rotasWhatsapp');
const { asyncHandler, ErroHttp, erroFinal } = require('../http');
const { configPadrao } = require('../admin');

const TOKEN_ADMIN = 'token-do-carlos-0123456789';
const TOKEN_OPERADOR = 'token-do-operador-5555555555';
const TOKEN_BOT = 'segredo-do-robo';
const TOKEN_SERVICO = 'token-de-servico-777777';
const USUARIOS = {
  [TOKEN_ADMIN]: { id: 7, login: 'carlos.alonso', nome: 'Carlos Eduardo de Souza Alonso', nomes: ['CARLOS EDUARDO DE SOUZA ALONSO'] },
  [TOKEN_OPERADOR]: { id: 9, login: 'operador', nome: 'Operador', nomes: ['OPERADOR'] },
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
      const novo = { ...p, id: e.proximo++, ticketId: p.ticketId || null, erro: p.erro || '', evento: ++e.seq, criadoEm: 'x' };
      e.pedidos.push(novo);
      return { pedido: copia(novo), novo: true };
    },
    async listarPendentes() { return e.pedidos.filter((p) => p.status === 'pendente').map(copia); },
    async listarAbertos() { return e.pedidos.filter((p) => p.status === 'aberto' && p.ticketId).map(copia); },
    async listarRecentes(n) { return e.pedidos.slice(-n).reverse().map(copia); },
    async reivindicar(id) { const p = e.pedidos.find((x) => x.id === id && x.status === 'pendente'); if (!p) return null; p.status = 'abrindo'; return copia(p); },
    async mudarStatus(id, status, o = {}) {
      const p = e.pedidos.find((x) => x.id === id);
      if (!p || (o.deSituacoes && !o.deSituacoes.includes(p.status))) return null;
      p.status = status; if (o.ticketId) p.ticketId = o.ticketId; if (o.erro !== undefined) p.erro = o.erro; p.evento = ++e.seq;
      return copia(p);
    },
    async pedidoPorChamado(t) { return copia(e.pedidos.filter((p) => p.ticketId === t && p.status === 'aberto').pop()); },
    async eventosDesde(d) { return e.pedidos.filter((p) => p.evento > d).sort((a, b) => a.evento - b.evento).map(copia); },
    async ultimoEvento() { return e.seq; },
  };
}

async function subir({ servico = true, bot = true, tipoPorTexto } = {}) {
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
  };
  const classificar = async (texto) => {
    if (tipoPorTexto) return tipoPorTexto(texto);
    if (/senha/i.test(texto)) return { tipo: 'alterar_senha_sga', tipoNome: 'Alterar senha do SGA' };
    if (/foto/i.test(texto)) return { tipo: 'foto_perfil', tipoNome: 'Foto de perfil' };
    return { tipo: null, tipoNome: '' };
  };
  const admin = criarRotasAdmin({ repo: repoAdm, glpi, asyncHandler, ErroHttp });
  const wa = criarRotasWhatsapp({ repo, admin, glpi, classificar, tokenBot: bot ? TOKEN_BOT : '', tokenServico: servico ? TOKEN_SERVICO : '', asyncHandler, ErroHttp });
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

test('robô sem credencial ou com credencial errada não passa; sem WHATSAPP_BOT_TOKEN no servidor responde 503', async () => {
  const s = await subir();
  assert.equal((await s.chamar('GET', '/api/whatsapp/bot/config')).status, 401);
  assert.equal((await s.chamar('GET', '/api/whatsapp/bot/config', { headers: { 'X-Bot-Token': 'errado' } })).status, 401);
  assert.equal((await s.comoBot('GET', '/api/whatsapp/bot/config')).status, 200);
  s.fechar();
  const sem = await subir({ bot: false });
  assert.equal((await sem.comoBot('GET', '/api/whatsapp/bot/config')).status, 503);
  sem.fechar();
});

test('administração do WhatsApp só para admin; vínculos criam, atualizam e removem', async () => {
  const s = await subir();
  assert.equal((await s.comoOperador('GET', '/api/admin/whatsapp/painel')).status, 403);
  assert.equal((await s.chamar('GET', '/api/admin/whatsapp/painel')).status, 401);
  assert.equal((await s.vincular()).status, 201);
  assert.equal((await s.vincular('31988887777', 13, 'Maria S.')).json.glpiId, 13, 'mesmo telefone atualiza');
  assert.equal((await s.comoAdmin('GET', '/api/admin/whatsapp/painel')).json.vinculos.length, 1);
  assert.equal((await s.comoAdmin('POST', '/api/admin/whatsapp/vinculos', { telefone: '1', glpiId: 1 })).status, 400);
  assert.equal((await s.comoAdmin('DELETE', '/api/admin/whatsapp/vinculos/5531988887777')).status, 204);
  assert.equal((await s.comoAdmin('DELETE', '/api/admin/whatsapp/vinculos/5531988887777')).status, 404);
  s.fechar();
});

test('robô desligado, grupo desconhecido, remetente não autorizado e conversa solta: ignorado, nada é gravado', async () => {
  const s = await subir();
  await s.vincular();
  assert.equal((await s.mensagem()).json.status, 'ignorado', 'automação do WhatsApp desligada');
  await s.configurar({ remetentesAutorizados: ['11977776666'] });
  assert.equal((await s.mensagem()).json.status, 'ignorado', 'remetente fora da lista de autorizados');
  await s.configurar({});
  assert.equal((await s.mensagem({ grupoJid: 'outro@g.us', grupoNome: 'Outro' })).json.status, 'ignorado');
  assert.equal((await s.mensagem({ texto: 'bom dia pessoal' })).json.status, 'ignorado');
  await s.configurar({ grupos: [{ id: 'g1', nome: 'Grupo Tech', jid: '1203@g.us', tipos: ['foto_perfil'] }] });
  assert.equal((await s.mensagem()).json.status, 'ignorado', 'tipo que o grupo não atende');
  assert.equal(s.repo.e.pedidos.length, 0);
  s.fechar();
});

test('sem vínculo: guarda o pedido, reage com a dúvida e não abre chamado', async () => {
  const s = await subir();
  await s.configurar({});
  const r = (await s.mensagem()).json;
  assert.equal(r.status, 'sem_vinculo');
  assert.equal(r.reacao, '❓');
  assert.equal(s.abertos.length, 0);
  s.fechar();
});

test('modo observação: registra o que faria, sem abrir chamado e sem reagir', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ modo: 'observacao' });
  const r = (await s.mensagem()).json;
  assert.equal(r.status, 'observado');
  assert.equal(r.reacao, null);
  assert.equal(s.abertos.length, 0);
  s.fechar();
});

test('fila do automático: o pedido espera com a reação de a fazer; o navegador abre o chamado com o token dele e o requerente do vínculo', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'fila_automatico' });
  const r = (await s.mensagem()).json;
  assert.equal(r.status, 'pendente');
  assert.equal(r.reacao, '⏳');
  assert.equal(s.abertos.length, 0, 'ninguém abriu ainda');
  const fila = (await s.comoOperador('GET', '/api/whatsapp/fila')).json;
  assert.equal(fila.length, 1);
  assert.equal(fila[0].solicitante, 'Maria Silva');
  const ab = await s.comoOperador('POST', `/api/whatsapp/fila/${fila[0].id}/abrir`);
  assert.equal(ab.status, 200);
  assert.equal(s.abertos.length, 1);
  assert.equal(s.abertos[0].token, TOKEN_OPERADOR, 'abriu com o token de quem está com o automático');
  assert.equal(s.abertos[0].requerenteId, 12);
  assert.equal(s.abertos[0].categoriaId, 45);
  assert.match(s.abertos[0].descricao, /grupo Grupo Tech, solicitante Maria Silva/);
  // dois computadores: o segundo recebe 409
  assert.equal((await s.comoOperador('POST', `/api/whatsapp/fila/${fila[0].id}/abrir`)).status, 409);
  assert.equal((await s.comoOperador('GET', '/api/whatsapp/fila')).json.length, 0);
  // sem token do GLPI ninguém mexe na fila
  assert.equal((await s.chamar('GET', '/api/whatsapp/fila')).status, 401);
  s.fechar();
});

test('falha ao abrir o chamado: pedido vira erro, a mensagem não vaza o token', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({});
  await s.mensagem();
  s.definirFalha('GLPI recusou');
  const id = (await s.comoOperador('GET', '/api/whatsapp/fila')).json[0].id;
  const r = await s.comoOperador('POST', `/api/whatsapp/fila/${id}/abrir`);
  assert.equal(r.status, 502);
  assert.ok(!JSON.stringify(r.json).includes(TOKEN_OPERADOR));
  assert.equal(s.repo.e.pedidos[0].status, 'erro');
  s.fechar();
});

test('só abrir (token de serviço): abre na hora com a lupa; o poll vê a solução e conclui', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir' });
  const r = (await s.mensagem()).json;
  assert.equal(r.status, 'aberto');
  assert.equal(r.reacao, '🔍');
  assert.equal(s.abertos[0].token, TOKEN_SERVICO);
  assert.equal(s.abertos[0].requerenteId, 12);
  assert.equal(await s.wa.verificarAbertos(), 0, 'ainda não foi solucionado');
  s.statusDosChamados.set(r.ticketId, 5);
  assert.equal(await s.wa.verificarAbertos(), 1);
  const ev = (await s.comoBot('GET', '/api/whatsapp/bot/eventos?desde=0')).json;
  const ultimo = ev.eventos[ev.eventos.length - 1];
  assert.equal(ultimo.status, 'concluido');
  assert.equal(ultimo.reacao, '✅');
  assert.equal(ultimo.resposta, `Chamado ${r.ticketId} concluído.`);
  s.fechar();
});

test('só abrir sem token de serviço configurado: erro claro, sem abrir nada', async () => {
  const s = await subir({ servico: false });
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir' });
  const r = (await s.mensagem()).json;
  assert.equal(r.status, 'erro');
  assert.equal(r.reacao, '⚠️');
  assert.match(s.repo.e.pedidos[0].erro, /HUB_GLPI_TOKEN_SERVICO/);
  assert.equal((await s.comoAdmin('GET', '/api/admin/whatsapp/painel')).json.disponivel.so_abrir, false);
  s.fechar();
});

test('mensagem repetida (o robô reenviou): não duplica pedido nem chamado', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir' });
  await s.mensagem();
  const dup = (await s.mensagem()).json;
  assert.equal(dup.repetida, true);
  assert.equal(s.abertos.length, 1);
  assert.equal(s.repo.e.pedidos.length, 1);
  s.fechar();
});

test('resultado do automático: conclui ou marca erro só do pedido aberto; chamado de fora do WhatsApp é ignorado', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({});
  await s.mensagem();
  const id = (await s.comoOperador('GET', '/api/whatsapp/fila')).json[0].id;
  const ticketId = (await s.comoOperador('POST', `/api/whatsapp/fila/${id}/abrir`)).json.ticketId;
  assert.equal((await s.comoOperador('POST', '/api/whatsapp/resultado', { ticketId: 999999, ok: true })).json.atualizado, false);
  assert.equal((await s.comoOperador('POST', '/api/whatsapp/resultado', { ticketId: 'x', ok: true })).status, 400);
  assert.equal((await s.comoOperador('POST', '/api/whatsapp/resultado', { ticketId, ok: false, texto: 'não achou o usuário' })).json.atualizado, true);
  assert.equal(s.repo.e.pedidos[0].status, 'erro');
  assert.equal((await s.comoOperador('POST', '/api/whatsapp/resultado', { ticketId, ok: true })).json.atualizado, false, 'só sai do estado aberto uma vez');
  s.fechar();
});

test('eventos: "agora" devolve só o último; reação nula quando o grupo não reage; resposta só quando o grupo responde', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir', grupos: [{ id: 'g1', nome: 'Grupo Tech', jid: '1203@g.us', categoriaId: 45, tipos: [], responder: false, reagir: false }] });
  const r = (await s.mensagem()).json;
  assert.equal(r.reacao, null);
  assert.equal((await s.comoBot('GET', '/api/whatsapp/bot/eventos?desde=agora')).json.ultimo, 2, 'reservado e aberto');
  s.statusDosChamados.set(r.ticketId, 5);
  await s.wa.verificarAbertos();
  const ev = (await s.comoBot('GET', '/api/whatsapp/bot/eventos?desde=2')).json;
  assert.equal(ev.eventos.length, 1);
  assert.equal(ev.eventos[0].reacao, null);
  assert.equal(ev.eventos[0].resposta, null);
  assert.equal((await s.comoBot('GET', '/api/whatsapp/bot/eventos?desde=abc')).status, 400);
  s.fechar();
});

test('estado do robô fica só em memória e aparece no painel do admin (com os grupos visíveis)', async () => {
  const s = await subir();
  await s.comoBot('POST', '/api/whatsapp/bot/estado', { conectado: false, qr: 'data:image/png;base64,AAAA', grupos: [{ jid: '1@g.us', nome: 'Grupo A' }, { nome: 'sem jid' }] });
  const p = (await s.comoAdmin('GET', '/api/admin/whatsapp/painel')).json;
  assert.equal(p.estado.conectado, false);
  assert.equal(p.estado.qr, 'data:image/png;base64,AAAA');
  assert.deepEqual(p.estado.grupos, [{ jid: '1@g.us', nome: 'Grupo A' }]);
  assert.equal(p.estado.botConfigurado, true);
  s.fechar();
});
