// Acesso ao Postgres da administração do Hub (admins, configurações e ordem das automações). Só SQL: as regras ficam em
// admin.js e rotasAdmin.js, que recebem este repositório por injeção (nos testes entra um repositório em memória).
const linhaAdmin = (r) => ({ id: Number(r.id), glpiId: r.glpi_id == null ? null : r.glpi_id, login: r.login, nome: r.nome, criadoEm: r.criado_em, criadoPor: r.criado_por });

function repoPg(pool) {
  return {
    async listarAdmins() {
      const { rows } = await pool.query('SELECT * FROM hub_admins ORDER BY id');
      return rows.map(linhaAdmin);
    },
    /** Grava o id do GLPI (e login ou nome que faltavam) na entrada do admin. Ignora se o id já é de outro admin. */
    async fixarAdmin(id, { glpiId, login, nome }) {
      try {
        await pool.query(
          `UPDATE hub_admins SET glpi_id = $1, login = COALESCE(NULLIF(login, ''), $2), nome = COALESCE(NULLIF(nome, ''), $3)
           WHERE id = $4 AND glpi_id IS NULL`,
          [glpiId, login || '', nome || '', id]
        );
      } catch (err) {
        if (!(err && err.code === '23505')) throw err; // 23505: esse id do GLPI já está em outra entrada
      }
    },
    /** @returns {Promise<object|null>} null quando o id do GLPI já é admin */
    async criarAdmin({ glpiId, login, nome }, criadoPor) {
      try {
        const { rows } = await pool.query('INSERT INTO hub_admins (glpi_id, login, nome, criado_por) VALUES ($1, $2, $3, $4) RETURNING *', [glpiId, login, nome, criadoPor]);
        return linhaAdmin(rows[0]);
      } catch (err) {
        if (err && err.code === '23505') return null;
        throw err;
      }
    },
    async contarAdmins() {
      const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM hub_admins');
      return rows[0].n;
    },
    async removerAdmin(id) {
      const { rowCount } = await pool.query('DELETE FROM hub_admins WHERE id = $1', [id]);
      return rowCount > 0;
    },
    async lerConfig(chave) {
      const { rows } = await pool.query('SELECT valor FROM hub_config WHERE chave = $1', [chave]);
      return rows.length ? rows[0].valor : null;
    },
    async gravarConfig(chave, valor, atualizadoPor) {
      await pool.query(
        `INSERT INTO hub_config (chave, valor, atualizado_por) VALUES ($1, $2::jsonb, $3)
         ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now(), atualizado_por = EXCLUDED.atualizado_por`,
        [chave, JSON.stringify(valor), atualizadoPor]
      );
    },
    async registrarHistorico({ quem, quemGlpiId, acao, alvo, antes, depois }) {
      await pool.query(
        'INSERT INTO hub_historico (quem, quem_glpi_id, acao, alvo, antes, depois) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)',
        [quem || '', quemGlpiId == null ? null : quemGlpiId, acao, alvo || '', antes == null ? null : JSON.stringify(antes), depois == null ? null : JSON.stringify(depois)]
      );
    },
    /** Mais recentes primeiro; `antesDe` (id) pagina para trás. */
    async listarHistorico({ limite, antesDe }) {
      const { rows } = await pool.query(
        'SELECT * FROM hub_historico WHERE ($1::bigint IS NULL OR id < $1) ORDER BY id DESC LIMIT $2',
        [antesDe || null, limite]
      );
      return rows.map((r) => ({ id: Number(r.id), quando: r.quando, quem: r.quem, quemGlpiId: r.quem_glpi_id, acao: r.acao, alvo: r.alvo, antes: r.antes, depois: r.depois }));
    },
    /** `ids` na nova ordem: grava 1, 2, 3... em `ordem`. Automação fora da lista fica depois. */
    async gravarOrdem(ids) {
      await pool.query(
        `UPDATE automations a SET ordem = v.ordem
         FROM unnest($1::bigint[], $2::int[]) AS v(id, ordem) WHERE a.id = v.id`,
        [ids, ids.map((_, i) => i + 1)]
      );
    },
  };
}

module.exports = { repoPg };
