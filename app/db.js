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
      categories TEXT[] NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'checking',
      last_checked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`ALTER TABLE automations DROP COLUMN IF EXISTS category;`);
  await pool.query(`ALTER TABLE automations ADD COLUMN IF NOT EXISTS categories TEXT[] NOT NULL DEFAULT '{}';`);

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

  // ---------- administração do Hub ----------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hub_admins (
      id BIGSERIAL PRIMARY KEY,
      glpi_id INTEGER,
      login TEXT NOT NULL DEFAULT '',
      nome TEXT NOT NULL DEFAULT '',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      criado_por TEXT NOT NULL DEFAULT ''
    );
  `);
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS hub_admins_glpi_id_uq ON hub_admins (glpi_id) WHERE glpi_id IS NOT NULL;');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hub_config (
      chave TEXT PRIMARY KEY,
      valor JSONB NOT NULL,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_por TEXT NOT NULL DEFAULT ''
    );
  `);
  // histórico do que mudou pela administração e pelo cadastro de automações (quem, quando, antes e depois)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hub_historico (
      id BIGSERIAL PRIMARY KEY,
      quando TIMESTAMPTZ NOT NULL DEFAULT now(),
      quem TEXT NOT NULL DEFAULT '',
      quem_glpi_id INTEGER,
      acao TEXT NOT NULL,
      alvo TEXT NOT NULL DEFAULT '',
      antes JSONB,
      depois JSONB
    );
  `);
  await pool.query('ALTER TABLE automations ADD COLUMN IF NOT EXISTS ordem INTEGER;');
  // porta da tela ao vivo (noVNC) no mesmo host da automação; o proxy a serve em /a/<id>/vnc/
  await pool.query('ALTER TABLE automations ADD COLUMN IF NOT EXISTS vnc_porta INTEGER;');
  // grupos do GLPI que veem a automação (vazio = todo mundo); quem está fora nem vê o card nem abre pelo proxy
  await pool.query("ALTER TABLE automations ADD COLUMN IF NOT EXISTS grupos INTEGER[] NOT NULL DEFAULT '{}';");
  // minutos que um item levaria à mão (tempo economizado das execuções manuais na aba Resultados); null = sem tempo
  await pool.query('ALTER TABLE automations ADD COLUMN IF NOT EXISTS minutos_por_item NUMERIC(6,1);');
  // execuções manuais (rodadas pela tela da automação, registradas pelo proxy): execucoes.js e aba Resultados
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hub_execucoes (
      id BIGSERIAL PRIMARY KEY,
      automacao_id BIGINT NOT NULL,
      automacao_nome TEXT NOT NULL DEFAULT '',
      quem TEXT NOT NULL DEFAULT '',
      quem_glpi_id INTEGER,
      job_id TEXT NOT NULL DEFAULT '',
      inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
      fim TIMESTAMPTZ,
      situacao TEXT NOT NULL DEFAULT 'rodando',
      itens INTEGER NOT NULL DEFAULT 0,
      concluidos INTEGER NOT NULL DEFAULT 0,
      erros INTEGER NOT NULL DEFAULT 0,
      modo_teste BOOLEAN NOT NULL DEFAULT false,
      detalhe TEXT NOT NULL DEFAULT ''
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS hub_execucoes_inicio_idx ON hub_execucoes (inicio);');
  // robô do WhatsApp: quem é quem (telefone -> usuário do GLPI) e os pedidos que chegam pelos grupos
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_vinculos (
      telefone TEXT PRIMARY KEY,
      glpi_id BIGINT NOT NULL,
      nome TEXT NOT NULL DEFAULT '',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query('CREATE SEQUENCE IF NOT EXISTS whatsapp_eventos_seq;');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_pedidos (
      id BIGSERIAL PRIMARY KEY,
      mensagem_id TEXT NOT NULL UNIQUE,
      grupo_id TEXT NOT NULL DEFAULT '',
      grupo_jid TEXT NOT NULL DEFAULT '',
      grupo_nome TEXT NOT NULL DEFAULT '',
      telefone TEXT NOT NULL DEFAULT '',
      solicitante TEXT NOT NULL DEFAULT '',
      glpi_id BIGINT,
      categoria_id BIGINT,
      texto TEXT NOT NULL DEFAULT '',
      tipo TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      ticket_id BIGINT,
      erro TEXT NOT NULL DEFAULT '',
      evento BIGINT NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS whatsapp_pedidos_status_idx ON whatsapp_pedidos (status);');
  await pool.query('CREATE INDEX IF NOT EXISTS whatsapp_pedidos_evento_idx ON whatsapp_pedidos (evento);');
  // primeiro admin: nomes (ou logins) da variável HUB_ADMINS_INICIAIS, só quando a lista ainda está vazia
  const { adminsIniciais } = require('./admin');
  const { rows: adm } = await pool.query('SELECT COUNT(*)::int AS count FROM hub_admins');
  if (adm[0].count === 0) {
    for (const nome of adminsIniciais(process.env.HUB_ADMINS_INICIAIS)) {
      const ehLogin = !/\s/.test(nome);
      await pool.query('INSERT INTO hub_admins (login, nome, criado_por) VALUES ($1, $2, $3)', [ehLogin ? nome : '', ehLogin ? '' : nome, 'instalação']);
    }
  }

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
    categories: row.categories || [],
    ordem: row.ordem == null ? null : row.ordem,
    vncPorta: row.vnc_porta == null ? null : row.vnc_porta,
    grupos: row.grupos || [],
    minutosPorItem: row.minutos_por_item == null ? null : Number(row.minutos_por_item),
    status: row.status,
    lastCheckedAt: row.last_checked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = { pool, init, waitForDb, rowToAutomation };
