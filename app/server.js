const path = require('path');
const express = require('express');
const { pool, init, waitForDb, rowToAutomation } = require('./db');
const glpi = require('./glpi');
const { validarId, validarAutomacao, validarUrlTeste } = require('./validacao');
const { asyncHandler, ErroHttp, erroFinal } = require('./http');
const { criarRotasAdmin } = require('./rotasAdmin');
const { repoPg } = require('./repoAdmin');
const { criarRotasWhatsapp } = require('./rotasWhatsapp');
const { repoWhatsapp } = require('./repoWhatsapp');

const { lerConfig, verificarSenhaProducao } = require('./config');
const { calcularMudancas } = require('./varredura');
const { criarProxyAutomacoes, repassar } = require('./proxy');
const { mascararUrl } = require('./mascara');
const { criarPasses } = require('./passe');
const { podeVer, validarGrupos } = require('./admin');
const { resumirExecucoes } = require('./execucoes');
const { criarRegistroExecucoes, repoExecucoes } = require('./execucoesRegistro');

const passes = criarPasses();

const { port: PORT, proxyPort: PROXY_PORT, checkIntervalMs: CHECK_INTERVAL_MS, checkTimeoutMs: CHECK_TIMEOUT_MS } = lerConfig();
const HEARTBEAT_MS = 25000;
const URL_CHAMADOS = (process.env.CHAMADOS_GLPI_URL || 'http://host.docker.internal:4013').replace(/\/+$/, '');

const app = express();
// O front do Hub fala com o chamados-glpi por aqui, sem ver o endereço dele. Antes do express.json: o corpo passa em fluxo.
app.use('/servicos/chamados', (req, res) => repassar(req, res, URL_CHAMADOS, req.url, '/servicos/chamados'));
// o "Abrir chamado" pode levar fotos e documentos (glpi.lerAnexos: até 25 MB, em base64); o resto fica no limite padrão
const jsonPadrao = express.json();
const jsonComAnexos = express.json({ limit: '36mb' });
app.use((req, res, next) => (req.path === '/api/glpi/ticket' ? jsonComAnexos : jsonPadrao)(req, res, next));

// Versão do front (hash da pasta public): a tela aberta consulta e recarrega quando muda. O index sai com
// ?v=<versão> nos scripts e estilos, então um F5 comum já pede os arquivos novos (sem depender do cache).
const { calcularVersao, injetarVersaoNoHtml } = require('./versao');
const pastaPublic = path.join(__dirname, 'public');
const versaoFront = calcularVersao(pastaPublic);
let indexComVersao = null;
app.get('/api/versao', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ versao: versaoFront });
});
app.get(['/', '/index.html'], (req, res, next) => {
  try {
    if (!indexComVersao) {
      indexComVersao = injetarVersaoNoHtml(require('fs').readFileSync(path.join(pastaPublic, 'index.html'), 'utf8'), versaoFront);
    }
  } catch {
    return next(); // sem index.html: o static responde 404
  }
  res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.send(indexComVersao);
});

// O layout novo (antes em /v3/) virou o Hub principal; endereços salvos de /v3/ vão para /. A versão anterior
// fica em /original/ como reserva.
app.get(['/v3', '/v3/', '/v3/index.html'], (req, res) => res.redirect(302, '/'));

// Tutoriais em vídeo do botão "?" (Hub e automações): pasta montada no container, fora do Git (mídia pesada).
// CORS aberto porque as automações, em outras portas, leem o índice tutoriais.json daqui.
app.use('/tutoriais', (req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  next();
}, express.static(process.env.TUTORIAIS_DIR || path.join(__dirname, 'tutoriais'), { maxAge: '1h', fallthrough: false }));

// /vendor e /assets têm nome sem hash: cache de 1 dia. O resto (js/css/html do
// app) revalida por ETag a cada carga, para uma nova versão chegar sem limpar cache.
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, caminho) {
    const p = caminho.split(path.sep).join('/');
    if (p.includes('/public/vendor/') || p.includes('/public/assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

const sseClients = new Set();

// Cache em memória da lista de automações: GET /api/automations, o SSE e o
// broadcast leem daqui em vez de consultar o banco a cada ciclo. É invalidado
// em POST/PUT/DELETE e quando a varredura muda algum status.
let cacheLista = null;
function invalidarCache() { cacheLista = null; }

async function listarAutomacoes() {
  if (!cacheLista) {
    // ordem escolhida no painel de administração; as que ainda não têm ordem ficam no fim, pelo id
    const { rows } = await pool.query('SELECT * FROM automations ORDER BY ordem NULLS LAST, id');
    const lista = rows.map(rowToAutomation);
    // o navegador recebe só o endereço mascarado; a tela abre pelo proxy (/a/<id>/) e a URL real fica no servidor
    const publica = lista.map(({ url, ...a }) => ({ ...a, endereco: mascararUrl(url) }));
    cacheLista = { lista, publica };
  }
  return cacheLista;
}

/**
 * Quem está pedindo, pelo token do GLPI no cabeçalho: { admin, usuario } ou null (sem token ou token inválido).
 * Decide quais automações a pessoa vê (grupos do GLPI) e quem abriu cada tela.
 */
async function quemVe(req) {
  if (!String(req.get('X-Glpi-Token') || '').trim()) return null;
  try {
    const { usuario, admin } = await rotasAdmin.quemE(req);
    return { usuario, admin: !!admin };
  } catch {
    return null; // token recusado pelo GLPI: vê só o que é de todo mundo, como quem não mandou token
  }
}

function escreverSse(res, texto) {
  try {
    res.write(texto);
  } catch {
    // conexão já quebrada: não espera pelo 'close' para tirar o cliente do conjunto
    sseClients.delete(res);
  }
}

// O SSE só avisa que a lista mudou: cada navegador busca GET /api/automations com o próprio token, porque cada pessoa
// vê as automações dos seus grupos (o EventSource não manda cabeçalho).
async function broadcastAutomations() {
  if (sseClients.size === 0) return;
  const payload = 'data: {"mudou":true}\n\n';
  for (const res of sseClients) escreverSse(res, payload);
}

// Heartbeat: proxies e o navegador derrubam conexões SSE ociosas.
setInterval(() => {
  for (const res of sseClients) escreverSse(res, ': ping\n\n');
}, HEARTBEAT_MS).unref();

async function checkUrl(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    // Qualquer resposta HTTP = no ar. Descarta o corpo para liberar a conexão.
    if (res.body) res.body.cancel().catch(() => {});
    return 'online';
  } catch (err) {
    // Rede/timeout (TypeError "fetch failed", TimeoutError, AbortError) = offline.
    // Qualquer outra coisa é bug nosso: loga, mas ainda responde offline.
    if (!(err instanceof TypeError) && err.name !== 'TimeoutError' && err.name !== 'AbortError') {
      console.error('[checkUrl] erro inesperado em', url, err);
    }
    return 'offline';
  }
}

// Grava vários status num único UPDATE. O filtro por url evita sobrescrever o
// status de uma automação cuja URL foi editada enquanto a varredura rodava.
async function gravarStatus(mudancas) {
  if (!mudancas.length) return;
  await pool.query(
    `UPDATE automations a SET status = v.status, last_checked_at = now()
     FROM unnest($1::bigint[], $2::text[], $3::text[]) AS v(id, url, status)
     WHERE a.id = v.id AND a.url = v.url`,
    [mudancas.map((m) => m.id), mudancas.map((m) => m.url), mudancas.map((m) => m.status)]
  );
  invalidarCache();
}

// Só grava se o status mudou (a UI não usa last_checked_at, então ele só
// avança nas mudanças). Retorna o status verificado.
async function checkAndPersist(id, url) {
  const status = await checkUrl(url);
  const { lista } = await listarAutomacoes();
  const atual = lista.filter((a) => a.id === id).map((a) => ({ ...a, url }));
  await gravarStatus(calcularMudancas(atual, new Map([[id, status]])));
  return status;
}

async function sweepAll() {
  const { lista } = await listarAutomacoes();
  const resultados = new Map();
  await Promise.all(lista.map(async (a) => resultados.set(a.id, await checkUrl(a.url))));
  const mudancas = calcularMudancas(lista, resultados);
  if (!mudancas.length) return;
  await gravarStatus(mudancas);
  await broadcastAutomations();
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/events', asyncHandler(async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
  escreverSse(res, 'data: {"mudou":true}\n\n');
}));

app.get('/api/automations', asyncHandler(async (req, res) => {
  const quem = await quemVe(req);
  res.set('Cache-Control', 'no-store');
  res.json((await listarAutomacoes()).publica.filter((a) => podeVer(a, quem)));
}));

// Hub de exemplo (inicio-exemplo.html): lista geral, sem o filtro de grupo e sem o endereço. Abrir a tela continua
// exigindo o passe no proxy, então automação restrita só abre para quem tem acesso.
app.get('/api/exemplo/automacoes', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json((await listarAutomacoes()).publica.map((a) => {
    const geral = { ...a };
    delete geral.endereco;
    delete geral.grupos;
    delete geral.container;
    delete geral.vncPorta;
    return geral;
  }));
}));

// Execuções manuais (rodadas pela tela da automação, registradas pelo proxy) para a aba Resultados.
// GET /api/execucoes/resumo?desde=YYYY-MM-DD&ate=YYYY-MM-DD&incluirTeste=0|1 (datas no fuso de São Paulo)
const linhaExecucao = (r) => ({
  id: Number(r.id), automacaoId: String(r.automacao_id), automacaoNome: r.automacao_nome, quem: r.quem, quemGlpiId: r.quem_glpi_id,
  inicio: r.inicio, fim: r.fim, situacao: r.situacao, itens: r.itens, concluidos: r.concluidos, erros: r.erros, modoTeste: r.modo_teste, detalhe: r.detalhe,
});
app.get('/api/execucoes/resumo', asyncHandler(async (req, res) => {
  const data = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
  const desde = data(req.query.desde);
  const ate = data(req.query.ate);
  if (!desde || !ate || desde > ate) throw new ErroHttp(400, 'Informe desde e ate (AAAA-MM-DD), com desde até ate.');
  const incluirTeste = req.query.incluirTeste === '1';
  const { rows } = await pool.query(
    `SELECT * FROM hub_execucoes
     WHERE inicio >= ($1::date)::timestamp AT TIME ZONE 'America/Sao_Paulo'
       AND inicio < (($2::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
     ORDER BY inicio DESC LIMIT 20000`,
    [desde, ate]
  );
  const linhas = rows.map(linhaExecucao);
  const minutos = Object.fromEntries((await listarAutomacoes()).lista.map((a) => [String(a.id), a.minutosPorItem]));
  res.set('Cache-Control', 'no-store');
  res.json({
    ...resumirExecucoes(linhas, minutos, { incluirTeste }),
    recentes: linhas.filter((l) => incluirTeste || !l.modoTeste).slice(0, 30),
  });
}));

// Passe para abrir a tela pelo proxy (passe.js): confere se a pessoa vê a automação e diz ao proxy quem abriu.
app.post('/api/automations/:id/passe', asyncHandler(async (req, res) => {
  const id = idOuErro(req);
  const a = (await listarAutomacoes()).lista.find((x) => String(x.id) === String(id));
  const quem = await quemVe(req);
  if (!a || !podeVer(a, quem)) throw new ErroHttp(403, 'Sem acesso a esta automação.');
  res.set('Cache-Control', 'no-store');
  res.json({ passe: passes.emitir({ automacaoId: id, usuario: quem ? quem.usuario : null }) });
}));

function idOuErro(req) {
  const id = validarId(req.params.id);
  if (id === null) throw new ErroHttp(400, 'id inválido');
  return id;
}

function dadosOuErro(req) {
  const r = validarAutomacao(req.body);
  if (!r.ok) throw new ErroHttp(400, r.error);
  return r.valor;
}

// Cadastro de automações (criar, editar, remover, testar conexão) e URLs reais: só admin, ou todos se a administração
// liberar (aba Automações). `rotasAdmin` é criado mais abaixo; a função só roda na requisição, quando ele já existe.
const podeGerenciar = (req, res, next) => rotasAdmin.podeGerenciarAutomacoes(req, res, next);

// URL real de cada automação ({ id: url }): para editar, copiar e abrir direto.
app.get('/api/admin/automations/urls', podeGerenciar, asyncHandler(async (req, res) => {
  const quem = await quemVe(req);
  res.set('Cache-Control', 'no-store');
  res.json(Object.fromEntries((await listarAutomacoes()).lista.filter((a) => podeVer(a, quem)).map((a) => [a.id, a.url])));
}));

// Grupos do GLPI que veem cada automação: só admin (mesmo com o cadastro liberado para todos).
const soAdmin = (req, res, next) => rotasAdmin.soAdmin(req, res, next);

app.get('/api/admin/grupos-glpi', soAdmin, asyncHandler(async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await glpi.listarGrupos(String(req.get('X-Glpi-Token')).trim()));
  } catch (err) {
    throw new ErroHttp(424, glpi.sanitizar((err && err.message) || 'Falha ao ler os grupos do GLPI.', [req.get('X-Glpi-Token')]));
  }
}));

app.put('/api/admin/automations/:id/grupos', soAdmin, asyncHandler(async (req, res) => {
  const id = idOuErro(req);
  const v = validarGrupos(req.body);
  if (!v.ok) throw new ErroHttp(400, v.error);
  const antes = await automacaoAtual(id);
  if (!antes) throw new ErroHttp(404, 'não encontrado');
  await pool.query('UPDATE automations SET grupos = $1, updated_at = now() WHERE id = $2', [v.valor, id]);
  invalidarCache();
  const quem = await quemVe(req);
  await rotasAdmin.anotar(quem && quem.usuario, 'automacao.grupos', antes.name, { grupos: antes.grupos }, { grupos: v.valor });
  broadcastAutomations().catch(() => {});
  res.json({ id, grupos: v.valor });
}));

app.post('/api/automations', podeGerenciar, asyncHandler(async (req, res) => {
  const d = dadosOuErro(req);
  const { rows } = await pool.query(
    `INSERT INTO automations (name, url, container, description, icon, color, categories, vnc_porta, minutos_por_item, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'checking') RETURNING *`,
    [d.name, d.url, d.container, d.description, d.icon, d.color, d.categories, d.vncPorta, d.minutosPorItem]
  );
  const created = rows[0];
  invalidarCache();
  await rotasAdmin.anotar(req.quemHub, 'automacao.criar', created.name, null, cadastroDe(rowToAutomation(created)));
  broadcastAutomations().catch(() => {});
  checkAndPersist(created.id, created.url).then(() => broadcastAutomations()).catch(() => {});
  res.status(201).json(rowToAutomation(created));
}));

/** Só os campos do cadastro (sem status e datas), para o histórico mostrar o que mudou de fato. */
function cadastroDe(a) {
  if (!a) return null;
  const { name, url, container, description, icon, color, categories, vncPorta, minutosPorItem } = a;
  return { name, url, container, description, icon, color, categories, vncPorta, minutosPorItem };
}
const automacaoAtual = async (id) => (await listarAutomacoes()).lista.find((a) => String(a.id) === String(id)) || null;

app.put('/api/automations/:id', podeGerenciar, asyncHandler(async (req, res) => {
  const id = idOuErro(req);
  const d = dadosOuErro(req);
  const antes = await automacaoAtual(id);
  const { rows } = await pool.query(
    `UPDATE automations SET name=$1, url=$2, container=$3, description=$4, icon=$5, color=$6, categories=$7, vnc_porta=$8, minutos_por_item=$9, updated_at=now()
     WHERE id=$10 RETURNING *`,
    [d.name, d.url, d.container, d.description, d.icon, d.color, d.categories, d.vncPorta, d.minutosPorItem, id]
  );
  if (!rows.length) throw new ErroHttp(404, 'não encontrado');
  const updated = rows[0];
  invalidarCache();
  await rotasAdmin.anotar(req.quemHub, 'automacao.editar', updated.name, cadastroDe(antes), cadastroDe(rowToAutomation(updated)));
  broadcastAutomations().catch(() => {});
  checkAndPersist(updated.id, updated.url).then(() => broadcastAutomations()).catch(() => {});
  res.json(rowToAutomation(updated));
}));

app.delete('/api/automations/:id', podeGerenciar, asyncHandler(async (req, res) => {
  const id = idOuErro(req);
  const antes = await automacaoAtual(id);
  const { rowCount } = await pool.query('DELETE FROM automations WHERE id=$1', [id]);
  invalidarCache();
  if (rowCount) await rotasAdmin.anotar(req.quemHub, 'automacao.remover', antes ? antes.name : id, cadastroDe(antes), null);
  broadcastAutomations().catch(() => {});
  res.status(204).end();
}));

app.post('/api/automations/:id/check', asyncHandler(async (req, res) => {
  const id = idOuErro(req);
  const { rows } = await pool.query('SELECT id, url FROM automations WHERE id=$1', [id]);
  if (!rows.length) throw new ErroHttp(404, 'não encontrado');
  const status = await checkAndPersist(id, rows[0].url);
  broadcastAutomations().catch(() => {});
  res.json({ id, status });
}));

app.post('/api/test-connection', podeGerenciar, asyncHandler(async (req, res) => {
  // Só admin chama; o formato da URL é validado, os hosts não são restringidos.
  const v = validarUrlTeste((req.body || {}).url);
  if (!v.ok) throw new ErroHttp(400, v.error);
  const status = await checkUrl(v.valor);
  res.json({ status });
}));

// GLPI: o App-Token fica só no servidor (env var); cada usuário informa seu
// próprio User-Token no navegador (fica salvo em localStorage, nunca aqui).
// O userToken nunca é gravado (glpi_tickets não tem coluna para ele), nem logado:
// só a mensagem já sanitizada por glpi.js vai para o log e para a resposta.
function tokenOuErro(body) {
  const { userToken } = body || {};
  if (typeof userToken !== 'string' || !userToken.trim() || userToken.length > 200) {
    throw new ErroHttp(400, 'Informe o token do GLPI.');
  }
  return userToken.trim();
}

function textoLimitado(valor, campo, max, obrigatorio) {
  if (valor === undefined || valor === null || valor === '') {
    if (obrigatorio) throw new ErroHttp(400, `${campo} é obrigatório.`);
    return '';
  }
  if (typeof valor !== 'string' || valor.length > max) throw new ErroHttp(400, `${campo} inválido (texto de até ${max} caracteres).`);
  return valor;
}

function erroGlpi(err) {
  console.error('[glpi]', err && err.message);
  return new ErroHttp(400, (err && err.message) || 'Falha ao falar com o GLPI.');
}

app.post('/api/glpi/lookup', asyncHandler(async (req, res) => {
  const userToken = tokenOuErro(req.body);
  try {
    res.json(await glpi.fetchLookup(userToken));
  } catch (err) {
    throw erroGlpi(err);
  }
}));

app.post('/api/glpi/ticket', asyncHandler(async (req, res) => {
  const userToken = tokenOuErro(req.body);
  const b = req.body;
  const titulo = textoLimitado(b.titulo, 'Título', 255, true);
  const descricao = textoLimitado(b.descricao, 'Descrição', 20000, false);
  const categoriaLabel = textoLimitado(b.categoriaLabel, 'categoriaLabel', 300, false) || null;
  const requerenteLabel = textoLimitado(b.requerenteLabel, 'requerenteLabel', 300, false) || null;
  const atribuidoLabel = textoLimitado(b.atribuidoLabel, 'atribuidoLabel', 300, false) || null;
  let anexos;
  try {
    anexos = glpi.lerAnexos(b.anexos);
  } catch (err) {
    throw new ErroHttp(400, err.message);
  }
  let id;
  let falhas = [];
  try {
    const r = await glpi.createTicketComAnexos(userToken, {
      titulo, descricao, categoriaId: b.categoriaId, requerenteId: b.requerenteId, atribuidoId: b.atribuidoId,
    }, anexos);
    id = r.id;
    falhas = r.falhas;
  } catch (err) {
    throw erroGlpi(err);
  }
  // O chamado já existe no GLPI: falha ao gravar o histórico local não pode virar erro para o usuário.
  try {
    await pool.query(
      `INSERT INTO glpi_tickets (ticket_id, titulo, descricao, categoria_label, requerente_label, atribuido_label)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, titulo, descricao, categoriaLabel, requerenteLabel, atribuidoLabel]
    );
  } catch (err) {
    console.error('[glpi] chamado', id, 'criado, mas não gravei no histórico:', err.message);
  }
  res.json({ id, url: glpi.ticketUrl(id), anexados: anexos.length - falhas.length, falhasAnexo: falhas });
}));

app.get('/api/glpi/history', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM glpi_tickets ORDER BY created_at DESC LIMIT 50');
  res.json(rows.map((r) => ({
    id: r.id,
    ticketId: r.ticket_id,
    titulo: r.titulo,
    descricao: r.descricao,
    categoriaLabel: r.categoria_label,
    requerenteLabel: r.requerente_label,
    atribuidoLabel: r.atribuido_label,
    createdAt: r.created_at,
    url: glpi.ticketUrl(r.ticket_id),
  })));
}));

// Administração (painel de configuração): só admins do GLPI. Veja rotasAdmin.js.
const rotasAdmin = criarRotasAdmin({
  repo: repoPg(pool),
  glpi,
  asyncHandler,
  ErroHttp,
  aoMudarOrdem: async () => {
    invalidarCache();
    await broadcastAutomations();
  },
});
rotasAdmin.registrar(app);

// IA local: ligar/desligar, exportar, treinar e auditoria (veja rotasIa.js). Rede interna arx-ia-interna.
const { criarRotasIa } = require('./rotasIa');
const rotasIa = criarRotasIa({ admin: rotasAdmin, repo: repoPg(pool), asyncHandler, ErroHttp });
rotasIa.registrar(app);

// Robô do WhatsApp (veja rotasWhatsapp.js). O robô é um serviço à parte; o Hub decide o que cada mensagem vira.
async function classificarMensagem(texto) {
  const r = await fetch(`${URL_CHAMADOS}/api/classificar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto }), signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`classificador respondeu ${r.status}`);
  return r.json();
}
const rotasWhatsapp = criarRotasWhatsapp({
  repo: repoWhatsapp(pool),
  admin: rotasAdmin,
  // IA local: valida o tipo da mensagem e escreve a resposta que daria (desligada ou fora: null, segue a regra)
  ia: { whatsapp: (corpo) => rotasIa.chamarIa('/api/whatsapp', 'POST', corpo).then((r) => (r.ok ? r.dados : null)) },
  glpi,
  classificar: classificarMensagem,
  tokenBot: process.env.WHATSAPP_BOT_TOKEN || '',
  tokenServico: process.env.HUB_GLPI_TOKEN_SERVICO || '',
  asyncHandler,
  ErroHttp,
  registrarHistorico: async ({ id, titulo, descricao, pedido }) => {
    await pool.query(
      'INSERT INTO glpi_tickets (ticket_id, titulo, descricao, categoria_label, requerente_label, atribuido_label) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, titulo, descricao, '', pedido.solicitante || '', null]
    );
  },
});
rotasWhatsapp.registrar(app);

// Sempre por último: converte qualquer erro das rotas em JSON {error}.
app.use(erroFinal());

async function start() {
  const senha = verificarSenhaProducao();
  if (!senha.ok) throw new Error(senha.error);
  if (senha.aviso) console.warn(senha.aviso);
  await waitForDb();
  await init();
  await sweepAll().catch((err) => console.error('[varredura]', err.message));
  setInterval(() => sweepAll().catch((err) => console.error('[varredura]', err.message)), CHECK_INTERVAL_MS);
  // com o token de serviço, confere a cada minuto se os chamados que o robô abriu já foram solucionados
  if (process.env.HUB_GLPI_TOKEN_SERVICO) {
    setInterval(() => rotasWhatsapp.verificarAbertos().catch((err) => console.error('[whatsapp]', err.message)), 60000);
    // pedido parado na fila por mais de 1 minuto (ninguém com o Chamados automático) é aberto pelo servidor
    setInterval(() => rotasWhatsapp.abrirPendentesAtrasados().catch((err) => console.error('[whatsapp]', err.message)), 20000);
  }
  app.listen(PORT, () => console.log(`ARX Hub ouvindo na porta ${PORT}`));
  const buscarDestino = async (id) => (await listarAutomacoes()).lista.find((a) => String(a.id) === String(id)) || null; // BIGSERIAL chega do pg como texto
  // execuções manuais (rodadas pela tela da automação): o proxy avisa, execucoesRegistro grava e acompanha até o fim
  const registroExecucoes = criarRegistroExecucoes({ repo: repoExecucoes(pool) });
  await registroExecucoes.aoSubir();
  const proxy = criarProxyAutomacoes({ buscarDestino, passes, observador: registroExecucoes });
  require('http').createServer(proxy.atender)
    .on('upgrade', proxy.atenderUpgrade)
    .listen(PROXY_PORT, () => console.log(`Proxy das automações ouvindo na porta ${PROXY_PORT}`));
}

start().catch((err) => {
  console.error('Falha ao iniciar o servidor', err);
  process.exit(1);
});
