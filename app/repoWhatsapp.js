// Acesso ao Postgres do robô do WhatsApp (vínculos telefone x usuário do GLPI e pedidos). Só SQL: as regras ficam em
// whatsapp.js e rotasWhatsapp.js, que recebem este repositório por injeção (nos testes entra um repositório em memória).
const linhaVinculo = (r) => ({ telefone: r.telefone, glpiId: Number(r.glpi_id), nome: r.nome, criadoEm: r.criado_em });
const linhaPedido = (r) => ({
  id: Number(r.id), mensagemId: r.mensagem_id, grupoId: r.grupo_id, grupoJid: r.grupo_jid, grupoNome: r.grupo_nome, telefone: r.telefone,
  solicitante: r.solicitante, glpiId: r.glpi_id == null ? null : Number(r.glpi_id), categoriaId: r.categoria_id == null ? null : Number(r.categoria_id),
  texto: r.texto, tipo: r.tipo, status: r.status, ticketId: r.ticket_id == null ? null : Number(r.ticket_id), erro: r.erro,
  evento: Number(r.evento), criadoEm: r.criado_em, atualizadoEm: r.atualizado_em,
});

function repoWhatsapp(pool) {
  return {
    async listarVinculos() {
      const { rows } = await pool.query('SELECT * FROM whatsapp_vinculos ORDER BY nome, telefone');
      return rows.map(linhaVinculo);
    },
    async salvarVinculo({ telefone, glpiId, nome }) {
      const { rows } = await pool.query(
        `INSERT INTO whatsapp_vinculos (telefone, glpi_id, nome) VALUES ($1, $2, $3)
         ON CONFLICT (telefone) DO UPDATE SET glpi_id = EXCLUDED.glpi_id, nome = EXCLUDED.nome RETURNING *`,
        [telefone, glpiId, nome]
      );
      return linhaVinculo(rows[0]);
    },
    async removerVinculo(telefone) {
      const { rowCount } = await pool.query('DELETE FROM whatsapp_vinculos WHERE telefone = $1', [telefone]);
      return rowCount > 0;
    },
    /** Cria o pedido; devolve { pedido, novo }. Mensagem repetida (o robô reenviou) devolve o pedido que já existe. */
    async criarPedido(p) {
      const { rows } = await pool.query(
        `INSERT INTO whatsapp_pedidos (mensagem_id, grupo_id, grupo_jid, grupo_nome, telefone, solicitante, glpi_id, categoria_id, texto, tipo, status, ticket_id, erro, evento)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, nextval('whatsapp_eventos_seq'))
         ON CONFLICT (mensagem_id) DO NOTHING RETURNING *`,
        [p.mensagemId, p.grupoId, p.grupoJid, p.grupoNome, p.telefone, p.solicitante, p.glpiId, p.categoriaId, p.texto, p.tipo, p.status, p.ticketId || null, p.erro || '']
      );
      if (rows.length) return { pedido: linhaPedido(rows[0]), novo: true };
      const { rows: ja } = await pool.query('SELECT * FROM whatsapp_pedidos WHERE mensagem_id = $1', [p.mensagemId]);
      return { pedido: linhaPedido(ja[0]), novo: false };
    },
    async obterPedido(id) {
      const { rows } = await pool.query('SELECT * FROM whatsapp_pedidos WHERE id = $1', [id]);
      return rows.length ? linhaPedido(rows[0]) : null;
    },
    async listarPendentes() {
      const { rows } = await pool.query(`SELECT * FROM whatsapp_pedidos WHERE status = 'pendente' ORDER BY id LIMIT 50`);
      return rows.map(linhaPedido);
    },
    async listarAbertos() {
      const { rows } = await pool.query(`SELECT * FROM whatsapp_pedidos WHERE status = 'aberto' AND ticket_id IS NOT NULL ORDER BY id LIMIT 200`);
      return rows.map(linhaPedido);
    },
    async listarRecentes(n) {
      const { rows } = await pool.query('SELECT * FROM whatsapp_pedidos ORDER BY id DESC LIMIT $1', [n]);
      return rows.map(linhaPedido);
    },
    /** Só um navegador abre cada pedido: pendente -> abrindo de forma atômica. null = outro já pegou. */
    async reivindicar(id) {
      const { rows } = await pool.query(`UPDATE whatsapp_pedidos SET status = 'abrindo', atualizado_em = now() WHERE id = $1 AND status = 'pendente' RETURNING *`, [id]);
      return rows.length ? linhaPedido(rows[0]) : null;
    },
    /** Muda a situação e gera um evento novo (é por ele que o robô descobre o que mudou). `deSituacoes` limita de quais situações pode sair. */
    async mudarStatus(id, status, { ticketId, erro, deSituacoes } = {}) {
      const { rows } = await pool.query(
        `UPDATE whatsapp_pedidos SET status = $2, ticket_id = COALESCE($3, ticket_id), erro = COALESCE($4, erro), evento = nextval('whatsapp_eventos_seq'), atualizado_em = now()
         WHERE id = $1 AND ($5::text[] IS NULL OR status = ANY($5)) RETURNING *`,
        [id, status, ticketId || null, erro === undefined ? null : erro, deSituacoes || null]
      );
      return rows.length ? linhaPedido(rows[0]) : null;
    },
    async pedidoPorChamado(ticketId) {
      const { rows } = await pool.query(`SELECT * FROM whatsapp_pedidos WHERE ticket_id = $1 AND status = 'aberto' ORDER BY id DESC LIMIT 1`, [ticketId]);
      return rows.length ? linhaPedido(rows[0]) : null;
    },
    async eventosDesde(desde) {
      const { rows } = await pool.query('SELECT * FROM whatsapp_pedidos WHERE evento > $1 ORDER BY evento LIMIT 200', [desde]);
      return rows.map(linhaPedido);
    },
    async ultimoEvento() {
      const { rows } = await pool.query('SELECT COALESCE(MAX(evento), 0)::bigint AS n FROM whatsapp_pedidos');
      return Number(rows[0].n);
    },
  };
}

module.exports = { repoWhatsapp };
