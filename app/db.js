const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const SEED_AUTOMATIONS = [
  { name: 'Emissão de Boletos', url: 'http://192.168.0.10:8081', container: 'boletos-service', icon: 'Receipt', color: '#1E4A9E', description: 'Geração e emissão de boletos para condôminos e clientes.' },
  { name: 'Conciliação Bancária', url: 'http://192.168.0.10:8082', container: 'conciliacao-bancaria', icon: 'BarChart3', color: '#1E4A9E', description: 'Concilia lançamentos bancários com o sistema financeiro.' },
  { name: 'Gerador de Relatórios de Condomínio', url: 'http://192.168.0.10:8083', container: 'relatorios-condominio', icon: 'FileText', color: '#14B8A6', description: 'Compila e exporta relatórios mensais em PDF.' },
  { name: 'Leitor de Notas Fiscais / OCR', url: 'http://192.168.0.10:8084', container: 'ocr-notas-fiscais', icon: 'Server', color: '#8B5CF6', description: 'Extrai dados de notas fiscais automaticamente via OCR.' },
  { name: 'Envio de Comunicados aos Condôminos', url: 'http://192.168.0.10:8085', container: 'comunicados-bot', icon: 'Building2', color: '#6DBE6A', description: 'Dispara comunicados por e-mail e WhatsApp aos condôminos.' },
  { name: 'Controle de Inadimplência', url: 'http://192.168.0.10:8086', container: 'inadimplencia-tracker', icon: 'Activity', color: '#F5A524', description: 'Monitora pagamentos em atraso e gera alertas automáticos.' },
  { name: 'Folha de Pagamento', url: 'http://192.168.0.10:8087', container: 'folha-pagamento', icon: 'Users', color: '#1E4A9E', description: 'Processa a folha de pagamento mensal dos funcionários.' },
  { name: 'Bot de Atendimento WhatsApp', url: 'http://192.168.0.10:8088', container: 'whatsapp-bot', icon: 'Bot', color: '#6DBE6A', description: 'Atendimento automatizado via WhatsApp para condôminos.' },
];

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS automations (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      container TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT 'Workflow',
      color TEXT NOT NULL DEFAULT '#1E4A9E',
      status TEXT NOT NULL DEFAULT 'checking',
      last_checked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS glpi_tickets (
      id BIGSERIAL PRIMARY KEY,
      ticket_id INTEGER NOT NULL,
      titulo TEXT NOT NULL,
      descricao TEXT NOT NULL DEFAULT '',
      categoria_label TEXT,
      requerente_label TEXT,
      atribuido_label TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM automations');
  if (rows[0].count === 0) {
    for (const a of SEED_AUTOMATIONS) {
      await pool.query(
        `INSERT INTO automations (name, url, container, description, icon, color, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'checking')`,
        [a.name, a.url, a.container, a.description, a.icon, a.color]
      );
    }
  }
}

async function waitForDb(retries = 20, delayMs = 2000) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

function rowToAutomation(row) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    container: row.container,
    description: row.description,
    icon: row.icon,
    color: row.color,
    status: row.status,
    lastCheckedAt: row.last_checked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = { pool, init, waitForDb, rowToAutomation };
