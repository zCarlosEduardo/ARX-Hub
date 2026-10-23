// Administração > IA: ligar e desligar a IA local de verdade (ia-controle dá start/stop nos containers), ver o estado,
// exportar o histórico do GLPI para treinar (pelo chamados-glpi, com o token do admin) e treinar. Só admin.
//
//   GET  /api/admin/ia/estado      containers, modelo treinado, métricas, exportação em andamento
//   POST /api/admin/ia/ligar       liga (containers) e grava ia.ligada = true
//   POST /api/admin/ia/desligar    desliga (containers parados) e grava ia.ligada = false
//   POST /api/admin/ia/exportar    exporta os chamados da entidade e treina no fim
//   POST /api/admin/ia/treinar     treina de novo com o que já foi exportado
//   GET  /api/admin/ia/auditoria   dados da página de auditoria (eventos, métricas, decisões)

function criarRotasIa({ admin, repo, asyncHandler, ErroHttp, env = process.env, buscar = fetch }) {
  const IA_URL = (env.IA_URL || 'http://ia-local:4025').replace(/\/+$/, '');
  const CONTROLE_URL = (env.IA_CONTROLE_URL || 'http://ia-controle:4026').replace(/\/+$/, '');
  const CHAMADOS_URL = (env.CHAMADOS_GLPI_URL || 'http://chamados-glpi:4013').replace(/\/+$/, '');

  async function chamar(url, { metodo = 'GET', cabecalhos = {}, corpo, ms = 5000 } = {}) {
    try {
      const r = await buscar(url, { method: metodo, headers: { 'Content-Type': 'application/json', ...cabecalhos }, body: corpo === undefined ? undefined : JSON.stringify(corpo), signal: AbortSignal.timeout(ms) });
      const dados = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, dados };
    } catch (err) {
      return { ok: false, status: 0, dados: { error: 'sem resposta' } };
    }
  }
  const controle = (acao, metodo = 'GET') => chamar(`${CONTROLE_URL}/api/${acao}`, { metodo, cabecalhos: { 'X-IA-Controle-Token': env.IA_CONTROLE_TOKEN || '' }, ms: 70000 });
  const ia = (caminho, metodo = 'GET', corpo, ms = 10000) => chamar(`${IA_URL}${caminho}`, { metodo, corpo, cabecalhos: { 'X-IA-Token': env.IA_TOKEN || '' }, ms });

  async function gravarLigada(ligada, usuario) {
    const atual = await admin.configAtual();
    const novo = { ...atual.ia, ligada };
    await repo.gravarConfig('ia', novo, usuario.nome || usuario.login);
    await admin.anotar(usuario, 'ia.' + (ligada ? 'ligar' : 'desligar'), 'IA local', { ligada: atual.ia.ligada }, { ligada });
  }

  function registrar(app) {
    app.get('/api/admin/ia/estado', admin.soAdmin, asyncHandler(async (req, res) => {
      const [ctl, st, exp] = await Promise.all([controle('estado'), ia('/api/status'), chamar(`${CHAMADOS_URL}/api/ia/exportar`)]);
      res.set('Cache-Control', 'no-store');
      res.json({
        configurada: !!(env.IA_TOKEN && env.IA_CONTROLE_TOKEN),
        controle: ctl.ok ? ctl.dados : { erro: ctl.dados.error || 'controle da IA fora do ar' },
        ia: st.ok ? st.dados : null,
        exportacao: exp.ok ? exp.dados : null,
        config: (await admin.configAtual()).ia,
      });
    }));

    for (const [acao, ligada] of [['ligar', true], ['desligar', false]]) {
      app.post(`/api/admin/ia/${acao}`, admin.soAdmin, asyncHandler(async (req, res) => {
        const usuario = await admin.exigirAdmin(req);
        const r = await controle(acao, 'POST');
        if (!r.ok) throw new ErroHttp(424, r.dados.error || 'Controle da IA fora do ar.');
        await gravarLigada(ligada, usuario);
        res.json(r.dados);
      }));
    }

    app.post('/api/admin/ia/exportar', admin.soAdmin, asyncHandler(async (req, res) => {
      const usuario = await admin.exigirAdmin(req);
      // o token do admin vai só neste pedido ao chamados-glpi (rede interna), que lê o GLPI e não guarda
      const r = await chamar(`${CHAMADOS_URL}/api/ia/exportar`, { metodo: 'POST', corpo: { glpi: { userToken: String(req.get('X-Glpi-Token') || '').trim() } }, ms: 30000 });
      if (!r.ok) throw new ErroHttp(r.status === 429 ? 429 : 424, r.dados.error || 'Falha ao iniciar a exportação.');
      await admin.anotar(usuario, 'ia.exportar', 'IA local', null, { iniciada: true });
      res.json(r.dados);
    }));

    app.post('/api/admin/ia/treinar', admin.soAdmin, asyncHandler(async (req, res) => {
      const usuario = await admin.exigirAdmin(req);
      const r = await ia('/api/treinar', 'POST', {});
      if (!r.ok) throw new ErroHttp(r.status === 409 ? 409 : 424, r.dados.error || 'IA fora do ar.');
      await admin.anotar(usuario, 'ia.treinar', 'IA local', null, { iniciado: true });
      res.json(r.dados);
    }));

    // Revisão: a IA local lê todos os chamados e as divergências são decididas aqui, uma por uma (gabarito humano)
    app.get('/api/admin/ia/revisao', admin.soAdmin, asyncHandler(async (req, res) => {
      const r = await ia('/api/revisao');
      res.set('Cache-Control', 'no-store');
      res.json(r.ok ? r.dados : { indisponivel: true });
    }));
    for (const acao of ['iniciar', 'parar']) {
      app.post(`/api/admin/ia/revisao/${acao}`, admin.soAdmin, asyncHandler(async (req, res) => {
        const usuario = await admin.exigirAdmin(req);
        const r = await ia(`/api/revisao/${acao}`, 'POST', {});
        if (!r.ok) throw new ErroHttp(r.status === 409 || r.status === 400 ? r.status : 424, r.dados.error || 'IA fora do ar.');
        await admin.anotar(usuario, `ia.revisao.${acao}`, 'IA local', null, { feito: r.dados.feito, total: r.dados.total });
        res.json(r.dados);
      }));
    }
    app.get('/api/admin/ia/revisao/divergencias', admin.soAdmin, asyncHandler(async (req, res) => {
      const r = await ia('/api/revisao/divergencias', 'POST', { offset: Number(req.query.offset) || 0, limite: Number(req.query.limite) || 20, pendentes: req.query.todas !== '1' });
      if (!r.ok) throw new ErroHttp(424, r.dados.error || 'IA fora do ar.');
      res.set('Cache-Control', 'no-store');
      res.json(r.dados);
    }));
    app.post('/api/admin/ia/revisao/decidir', admin.soAdmin, asyncHandler(async (req, res) => {
      const usuario = await admin.exigirAdmin(req);
      const b = req.body || {};
      const r = await ia('/api/revisao/decidir', 'POST', { id: String(b.id || ''), tipo: String(b.tipo || ''), quem: usuario.nome || usuario.login });
      if (!r.ok) throw new ErroHttp(r.status === 400 || r.status === 404 ? r.status : 424, r.dados.error || 'IA fora do ar.');
      res.json(r.dados);
    }));

    app.get('/api/admin/ia/auditoria', admin.soAdmin, asyncHandler(async (req, res) => {
      const r = await ia('/api/auditoria');
      res.set('Cache-Control', 'no-store');
      res.json(r.ok ? r.dados : { indisponivel: true, motivo: 'IA desligada ou fora do ar: ligue para ver os dados ao vivo.' });
    }));

    // Página web da auditoria (public/ia-auditoria.html): só números agregados, nenhum chamado, texto ou pessoa. Com a IA
    // desligada, mostra a última fotografia guardada (hub_config, chave ia_auditoria).
    app.get('/api/ia/auditoria-publica', asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store');
      const r = await ia('/api/auditoria');
      if (r.ok) {
        const foto = { ...resumirAuditoria(r.dados), aoVivo: true, em: new Date().toISOString() };
        await repo.gravarConfig('ia_auditoria', foto, 'auditoria').catch(() => {}); // sem gravar, a página só não tem a cópia
        return res.json(foto);
      }
      const guardada = await repo.lerConfig('ia_auditoria').catch(() => null);
      res.json(guardada ? { ...guardada, aoVivo: false } : { aoVivo: false, vazio: true });
    }));
  }

  /** Só agregados: eventos (o que e quando), métricas do treino, modelos e contagem das decisões. */
  function resumirAuditoria(d) {
    const dec = Array.isArray(d.decisoes) ? d.decisoes : [];
    const porOrigem = {};
    let concorda = 0;
    for (const x of dec) {
      porOrigem[x.origem] = (porOrigem[x.origem] || 0) + 1;
      if (x.concorda) concorda += 1;
    }
    const numeros = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => typeof v === 'number' || typeof v === 'string' && v.length < 80));
    return {
      estado: d.estado ? { revisao: d.estado.revisao || null, treinado: d.estado.treinado, exemplos: d.estado.exemplos, treinadoEm: d.estado.treinadoEm, modelos: d.estado.modelos, tipos: d.estado.tipos, treino: d.estado.treino && { etapa: d.estado.treino.etapa, rodando: d.estado.treino.rodando, iniciouEm: d.estado.treino.iniciouEm, terminouEm: d.estado.treino.terminouEm } } : null,
      metricas: d.metricas ? { total: d.metricas.total, acertoIa: d.metricas.acertoIa, acertoRegras: d.metricas.acertoRegras, porTipo: d.metricas.porTipo, distribuicao: d.metricas.distribuicao, treinadoEm: d.metricas.treinadoEm, modeloEmbed: d.metricas.modeloEmbed, modeloTexto: d.metricas.modeloTexto, confirmados: d.metricas.confirmados ? { total: d.metricas.confirmados.total, acertoIa: d.metricas.confirmados.acertoIa, acertoRegras: d.metricas.confirmados.acertoRegras } : null, humanos: d.metricas.humanos ? { total: d.metricas.humanos.total, acertoIa: d.metricas.humanos.acertoIa, acertoRegras: d.metricas.humanos.acertoRegras } : null } : null,
      modelos: (d.modelos || []).map((m) => ({ nome: m.nome, tamanhoMb: m.tamanhoMb })),
      eventos: (d.eventos || []).slice(-100).map((ev) => ({ quando: ev.quando, tipo: ev.tipo, ...numeros(ev) })),
      decisoes: { total: dec.length, concorda, discorda: dec.length - concorda, porOrigem },
    };
  }

  return { registrar, chamarIa: ia, resumirAuditoria };
}

module.exports = { criarRotasIa };
