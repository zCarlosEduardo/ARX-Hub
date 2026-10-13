const path = require('path');
const express = require('express');
const { pool, init, waitForDb, rowToAutomation } = require('./db');
const glpi = require('./glpi');

const PORT = process.env.PORT || 8317;
const CHECK_INTERVAL_MS = 5000;
const CHECK_TIMEOUT_MS = 3000;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const sseClients = new Set();

async function broadcastAutomations() {
  if (sseClients.size === 0) return;
  const { rows } = await pool.query('SELECT * FROM automations ORDER BY id');
  const payload = `data: ${JSON.stringify(rows.map(rowToAutomation))}\n\n`;
  for (const res of sseClients) res.write(payload);
}

async function checkUrl(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    return res ? 'online' : 'offline';
  } catch (err) {
    return 'offline';
  }
}

async function checkAndPersist(id, url) {
  const status = await checkUrl(url);
  await pool.query(
    'UPDATE automations SET status = $1, last_checked_at = now() WHERE id = $2',
    [status, id]
  );
  return status;
}

async function sweepAll() {
  const { rows } = await pool.query('SELECT id, url FROM automations');
  await Promise.allSettled(rows.map((r) => checkAndPersist(r.id, r.url)));
  await broadcastAutomations().catch(() => {});
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/events', asyncHandler(async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
  const { rows } = await pool.query('SELECT * FROM automations ORDER BY id');
  res.write(`data: ${JSON.stringify(rows.map(rowToAutomation))}

`);
}));

app.get('/api/automations', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM automations ORDER BY id');
  res.json(rows.map(rowToAutomation));
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

app.post('/api/automations', asyncHandler(async (req, res) => {
  const d = dadosOuErro(req);
  const { rows } = await pool.query(
    `INSERT INTO automations (name, url, container, description, icon, color, categories, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'checking') RETURNING *`,
    [d.name, d.url, d.container, d.description, d.icon, d.color, d.categories]
  );
  const created = rows[0];
  broadcastAutomations().catch(() => {});
  checkAndPersist(created.id, created.url).then(() => broadcastAutomations()).catch(() => {});
  res.status(201).json(rowToAutomation(created));
}));

app.put('/api/automations/:id', asyncHandler(async (req, res) => {
  const id = idOuErro(req);
  const d = dadosOuErro(req);
  const { rows } = await pool.query(
    `UPDATE automations SET name=$1, url=$2, container=$3, description=$4, icon=$5, color=$6, categories=$7, updated_at=now()
     WHERE id=$8 RETURNING *`,
    [d.name, d.url, d.container, d.description, d.icon, d.color, d.categories, id]
  );
  if (!rows.length) throw new ErroHttp(404, 'não encontrado');
  const updated = rows[0];
  broadcastAutomations().catch(() => {});
  checkAndPersist(updated.id, updated.url).then(() => broadcastAutomations()).catch(() => {});
  res.json(rowToAutomation(updated));
}));

app.delete('/api/automations/:id', asyncHandler(async (req, res) => {
  const id = idOuErro(req);
  await pool.query('DELETE FROM automations WHERE id=$1', [id]);
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

app.post('/api/test-connection', asyncHandler(async (req, res) => {
  // Só valida o formato da URL; restringir hosts fica para quando o Hub tiver autenticação.
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
    throw new ErroHttp(400, 'Informe seu token GLPI.');
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
  let id;
  try {
    id = await glpi.createTicket(userToken, {
      titulo, descricao, categoriaId: b.categoriaId, requerenteId: b.requerenteId, atribuidoId: b.atribuidoId,
    });
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
  res.json({ id, url: glpi.ticketUrl(id) });
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

// Sempre por último: converte qualquer erro das rotas em JSON {error}.
app.use(erroFinal());

async function start() {
  await waitForDb();
  await init();
  await sweepAll().catch(() => {});
  setInterval(() => sweepAll().catch(() => {}), CHECK_INTERVAL_MS);
  app.listen(PORT, () => console.log(`ARX Hub ouvindo na porta ${PORT}`));
}

start().catch((err) => {
  console.error('Falha ao iniciar o servidor', err);
  process.exit(1);
});
