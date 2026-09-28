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

app.get('/api/events', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  sseClients.add(res);
  const { rows } = await pool.query('SELECT * FROM automations ORDER BY id');
  res.write(`data: ${JSON.stringify(rows.map(rowToAutomation))}\n\n`);
  req.on('close', () => sseClients.delete(res));
});

app.get('/api/automations', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM automations ORDER BY id');
  res.json(rows.map(rowToAutomation));
});

app.post('/api/automations', async (req, res) => {
  const { name, url, container, description, icon, color, categories } = req.body || {};
  if (!name || !name.trim() || !url || !url.trim()) {
    return res.status(400).json({ error: 'name e url são obrigatórios' });
  }
  const { rows } = await pool.query(
    `INSERT INTO automations (name, url, container, description, icon, color, categories, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'checking') RETURNING *`,
    [name.trim(), url.trim(), container || '', description || '', icon || 'Workflow', color || '#1E4A9E', Array.isArray(categories) ? categories : []]
  );
  const created = rows[0];
  broadcastAutomations().catch(() => {});
  checkAndPersist(created.id, created.url).then(() => broadcastAutomations()).catch(() => {});
  res.status(201).json(rowToAutomation(created));
});

app.put('/api/automations/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { name, url, container, description, icon, color, categories } = req.body || {};
  if (!name || !name.trim() || !url || !url.trim()) {
    return res.status(400).json({ error: 'name e url são obrigatórios' });
  }
  const { rows } = await pool.query(
    `UPDATE automations SET name=$1, url=$2, container=$3, description=$4, icon=$5, color=$6, categories=$7, updated_at=now()
     WHERE id=$8 RETURNING *`,
    [name.trim(), url.trim(), container || '', description || '', icon || 'Workflow', color || '#1E4A9E', Array.isArray(categories) ? categories : [], id]
  );
  if (!rows.length) return res.status(404).json({ error: 'não encontrado' });
  const updated = rows[0];
  broadcastAutomations().catch(() => {});
  checkAndPersist(updated.id, updated.url).then(() => broadcastAutomations()).catch(() => {});
  res.json(rowToAutomation(updated));
});

app.delete('/api/automations/:id', async (req, res) => {
  const id = Number(req.params.id);
  await pool.query('DELETE FROM automations WHERE id=$1', [id]);
  broadcastAutomations().catch(() => {});
  res.status(204).end();
});

app.post('/api/automations/:id/check', async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await pool.query('SELECT id, url FROM automations WHERE id=$1', [id]);
  if (!rows.length) return res.status(404).json({ error: 'não encontrado' });
  const status = await checkAndPersist(id, rows[0].url);
  broadcastAutomations().catch(() => {});
  res.json({ id, status });
});

app.post('/api/test-connection', async (req, res) => {
  const { url } = req.body || {};
  if (!url || !url.trim()) return res.status(400).json({ error: 'url é obrigatória' });
  const status = await checkUrl(url.trim());
  res.json({ status });
});

// GLPI: o App-Token fica só no servidor (env var); cada usuário informa seu
// próprio User-Token no navegador (fica salvo em localStorage, nunca aqui).
app.post('/api/glpi/lookup', async (req, res) => {
  const { userToken } = req.body || {};
  if (!userToken) return res.status(400).json({ error: 'Informe seu token GLPI.' });
  try {
    const data = await glpi.fetchLookup(userToken);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/glpi/ticket', async (req, res) => {
  const {
    userToken, titulo, descricao, categoriaId, requerenteId, atribuidoId,
    categoriaLabel, requerenteLabel, atribuidoLabel,
  } = req.body || {};
  if (!userToken) return res.status(400).json({ error: 'Informe seu token GLPI.' });
  try {
    const id = await glpi.createTicket(userToken, { titulo, descricao, categoriaId, requerenteId, atribuidoId });
    await pool.query(
      `INSERT INTO glpi_tickets (ticket_id, titulo, descricao, categoria_label, requerente_label, atribuido_label)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, titulo, descricao || '', categoriaLabel || null, requerenteLabel || null, atribuidoLabel || null]
    );
    res.json({ id, url: glpi.ticketUrl(id) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/glpi/history', async (req, res) => {
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
});

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
