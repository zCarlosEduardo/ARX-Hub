// Rotas do robô do WhatsApp. Três tipos de chamador, cada um com a sua credencial:
//
//   Robô (header X-Bot-Token = WHATSAPP_BOT_TOKEN, só o robô conhece)
//     GET  /api/whatsapp/bot/config         grupos e reações que ele precisa para ouvir e reagir
//     POST /api/whatsapp/bot/mensagem       uma mensagem de grupo: o Hub decide o que fazer e devolve a reação
//     GET  /api/whatsapp/bot/eventos        o que mudou nos pedidos desde o último evento (reação nova ou resposta no grupo)
//     POST /api/whatsapp/bot/estado         conectado, QR code e grupos visíveis (só em memória)
//   Navegador com o Chamados automático ligado (header X-Glpi-Token de qualquer usuário do GLPI)
//     GET  /api/whatsapp/fila               pedidos esperando alguém abrir o chamado
//     POST /api/whatsapp/fila/:id/abrir     abre o chamado no GLPI com o token de quem chamou e o solicitante do pedido
//     POST /api/whatsapp/resultado          a automação terminou o chamado: avisa o pedido
//   Administradores (X-Glpi-Token de admin)
//     GET/POST/DELETE /api/admin/whatsapp/...   painel, vínculos telefone x usuário do GLPI
const crypto = require('crypto');
const W = require('./whatsapp');
const { TIPOS_SOLICITACAO } = require('./admin');

// tipos que não dependem de associação: no privado não precisam de "Categoria X" (quem diz a associação é a categoria do GLPI)
const TIPOS_SEM_CATEGORIA = new Set(['foto_perfil', 'senha_sistemas']);
const NOME_TIPO = new Map(TIPOS_SOLICITACAO.map((t) => [t.chave, t.nome]));
const sem = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const mesmoHash = (a, b) => {
  const h = (x) => crypto.createHash('sha256').update(String(x)).digest();
  return crypto.timingSafeEqual(h(a), h(b));
};
const truncar = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 3)}...` : String(s));

/**
 * @param {{repo: object, admin: {configAtual: Function, exigirAdmin: Function, identificar: Function},
 *          glpi: {criarChamado: Function, statusChamado: Function}, classificar: Function, tokenBot?: string,
 *          tokenServico?: string, asyncHandler: Function, ErroHttp: Function, registrarHistorico?: Function}} deps
 */
function criarRotasWhatsapp(deps) {
  const { repo, admin, glpi, classificar, asyncHandler, ErroHttp } = deps;
  const tokenBot = deps.tokenBot || '';
  const tokenServico = deps.tokenServico || '';
  let estadoBot = { conectado: false, numero: '', qr: '', grupos: [], atualizadoEm: null };

  const exigirBot = (req) => {
    if (!tokenBot) throw new ErroHttp(503, 'O robô do WhatsApp não está configurado neste Hub (falta WHATSAPP_BOT_TOKEN).');
    const enviado = String(req.get('X-Bot-Token') || '');
    if (!enviado || !mesmoHash(enviado, tokenBot)) throw new ErroHttp(401, 'Credencial do robô inválida.');
  };

  const limpar = (msg, token) => (token ? String(msg).split(token).join('[oculto]') : String(msg));

  async function abrirNoGlpi(pedido, token) {
    const { titulo, descricao } = W.montarChamado({
      texto: pedido.texto, vinculo: { nome: pedido.solicitante }, grupo: { nome: pedido.grupoNome, privado: pedido.grupoId === 'privado' }, tipoNome: NOME_TIPO.get(pedido.tipo) || '',
    });
    const id = await glpi.criarChamado(token, { titulo, descricao, categoriaId: pedido.categoriaId, requerenteId: pedido.glpiId });
    if (deps.registrarHistorico) await deps.registrarHistorico({ id, titulo, descricao, pedido }).catch(() => {});
    return id;
  }

  /**
   * Decide o que fazer com uma mensagem (de grupo ou da conversa privada). Devolve { status, pedidoId?, ticketId?, reacao? }.
   * Na conversa privada (b.privado) não há grupo: a categoria do GLPI vem da linha "Categoria X" da mensagem.
   */
  async function processarMensagem(b) {
    const cfg = (await admin.configAtual()).whatsapp;
    if (!cfg.ativo) return { status: 'ignorado' };
    const bruto = typeof b.texto === 'string' ? b.texto.trim().slice(0, 5000) : '';
    const mensagemId = typeof b.mensagemId === 'string' ? b.mensagemId.slice(0, 200) : '';
    if (!bruto || !mensagemId) return { status: 'ignorado' };
    const ehPrivado = b.privado === true;
    let grupo = null;
    if (ehPrivado) {
      if (!cfg.privado.ativo) return { status: 'ignorado' };
    } else {
      grupo = cfg.grupos.find((g) => g.ativo && ((g.jid && g.jid === b.grupoJid) || (!g.jid && sem(g.nome) === sem(b.grupoNome))));
      if (!grupo) return { status: 'ignorado' };
    }
    if (cfg.remetentesAutorizados.length && !cfg.remetentesAutorizados.some((t) => W.mesmoTelefone(t, b.remetente))) return { status: 'ignorado' };

    const { apelido, texto } = ehPrivado ? W.extrairCategoria(bruto) : { apelido: '', texto: bruto };
    const { tipo } = await classificar(texto);
    const tiposLiberados = ehPrivado ? cfg.privado.tipos : grupo.tipos;
    // conversa solta ou pedido que não é deste grupo: o robô fica quieto
    if (!tipo || (tiposLiberados.length && !tiposLiberados.includes(tipo))) return { status: 'ignorado' };

    const vinculo = W.acharVinculo(await repo.listarVinculos(), b.remetente);
    // no privado qualquer pessoa pode escrever para o chip: quem não tem vínculo é ignorado em silêncio (nos grupos continua a dúvida)
    if (ehPrivado && !vinculo) return { status: 'ignorado' };
    const categoria = ehPrivado ? W.acharCategoria(cfg.privado.categorias, apelido) : null;
    const reagirLigado = ehPrivado ? cfg.privado.reagir : grupo.reagir;
    const base = {
      mensagemId, grupoId: ehPrivado ? 'privado' : grupo.id, grupoJid: String(b.grupoJid || ''), grupoNome: ehPrivado ? 'Conversa privada' : grupo.nome,
      telefone: W.normalizarTelefone(b.remetente), solicitante: vinculo ? vinculo.nome : '', glpiId: vinculo ? vinculo.glpiId : null,
      categoriaId: ehPrivado ? (categoria ? categoria.categoriaId : null) : grupo.categoriaId, texto, tipo,
    };
    let status = 'pendente';
    let erro = '';
    if (!vinculo) status = 'sem_vinculo';
    else if (ehPrivado && !categoria && (apelido || !TIPOS_SEM_CATEGORIA.has(tipo))) {
      status = 'sem_categoria';
      erro = apelido ? `A categoria "${truncar(apelido, 60)}" não está cadastrada para a conversa privada.` : 'A mensagem não diz a categoria (primeira linha: Categoria Ancore).';
    } else if (cfg.modo === 'observacao') status = 'observado';
    else if (cfg.operacao === 'so_abrir') {
      if (tokenServico) status = 'abrindo'; // o pedido nasce reservado: mensagem repetida não abre o chamado duas vezes
      else {
        status = 'erro';
        erro = 'O token de serviço do GLPI não está configurado neste Hub (HUB_GLPI_TOKEN_SERVICO).';
      }
    }
    const { pedido, novo } = await repo.criarPedido({ ...base, status, ticketId: null, erro });
    const reagir = (st) => (reagirLigado ? W.reacaoDoStatus(st, cfg.reacoes) : null);
    if (!novo) return { status: pedido.status, pedidoId: pedido.id, ticketId: pedido.ticketId, repetida: true, reacao: reagir(pedido.status) };
    if (status !== 'abrindo') return { status, pedidoId: pedido.id, ticketId: null, reacao: reagir(status) };
    try {
      const ticketId = await abrirNoGlpi(pedido, tokenServico);
      await repo.mudarStatus(pedido.id, 'aberto', { ticketId });
      return { status: 'aberto', pedidoId: pedido.id, ticketId, reacao: reagir('aberto') };
    } catch (err) {
      const msg = truncar(limpar(err.message, tokenServico), 300);
      await repo.mudarStatus(pedido.id, 'erro', { erro: msg });
      return { status: 'erro', pedidoId: pedido.id, ticketId: null, reacao: reagir('erro') };
    }
  }

  /**
   * Pedido parado na fila (ninguém estava com o Chamados automático): com o token de serviço o servidor abre o chamado
   * depois de `esperaMs`, para o pedido não depender de um navegador aberto. Um navegador que pega o pedido antes vence
   * (reivindicar é atômico). Devolve quantos chamados abriu.
   */
  async function abrirPendentesAtrasados({ esperaMs = 60000, agora = Date.now() } = {}) {
    if (!tokenServico) return 0;
    let abertos = 0;
    for (const p of await repo.listarPendentes()) {
      if (agora - new Date(p.criadoEm).getTime() < esperaMs) continue;
      const pedido = await repo.reivindicar(p.id);
      if (!pedido) continue;
      try {
        const ticketId = await abrirNoGlpi(pedido, tokenServico);
        await repo.mudarStatus(pedido.id, 'aberto', { ticketId });
        abertos += 1;
      } catch (err) {
        await repo.mudarStatus(pedido.id, 'erro', { erro: truncar(limpar(err.message, tokenServico), 300) });
      }
    }
    return abertos;
  }

  /** Com o token de serviço, confere no GLPI se os chamados abertos pelo robô já foram solucionados. */
  async function verificarAbertos() {
    if (!tokenServico) return 0;
    let concluidos = 0;
    for (const p of await repo.listarAbertos()) {
      try {
        const st = await glpi.statusChamado(tokenServico, p.ticketId);
        if (st >= 5 && (await repo.mudarStatus(p.id, 'concluido', { deSituacoes: ['aberto'] }))) concluidos += 1;
      } catch {
        // GLPI fora do ar um instante ou chamado sem permissão de leitura: tenta de novo na próxima volta
      }
    }
    return concluidos;
  }

  function registrar(app) {
    // ---- robô
    app.get('/api/whatsapp/bot/config', asyncHandler(async (req, res) => {
      exigirBot(req);
      const c = (await admin.configAtual()).whatsapp;
      res.set('Cache-Control', 'no-store');
      res.json({ ativo: c.ativo, modo: c.modo, numeros: c.numeros, reacoes: c.reacoes, privado: { ativo: c.privado.ativo, responder: c.privado.responder, reagir: c.privado.reagir }, grupos: c.grupos.filter((g) => g.ativo).map((g) => ({ id: g.id, nome: g.nome, jid: g.jid, numeroId: g.numeroId, responder: g.responder, reagir: g.reagir })) });
    }));

    app.post('/api/whatsapp/bot/mensagem', asyncHandler(async (req, res) => {
      exigirBot(req);
      res.json(await processarMensagem(req.body && typeof req.body === 'object' ? req.body : {}));
    }));

    app.get('/api/whatsapp/bot/eventos', asyncHandler(async (req, res) => {
      exigirBot(req);
      res.set('Cache-Control', 'no-store');
      if (req.query.desde === 'agora') return res.json({ ultimo: await repo.ultimoEvento(), eventos: [] });
      const desde = Number(req.query.desde);
      if (!Number.isFinite(desde) || desde < 0) throw new ErroHttp(400, 'desde inválido');
      const cfg = (await admin.configAtual()).whatsapp;
      const pedidos = await repo.eventosDesde(desde);
      const eventos = pedidos.map((p) => {
        const grupo = p.grupoId === 'privado' ? cfg.privado : cfg.grupos.find((g) => g.id === p.grupoId);
        return {
          evento: p.evento, pedidoId: p.id, mensagemId: p.mensagemId, grupoJid: p.grupoJid, grupoNome: p.grupoNome, status: p.status, ticketId: p.ticketId,
          reacao: grupo && !grupo.reagir ? null : W.reacaoDoStatus(p.status, cfg.reacoes),
          resposta: p.status === 'concluido' && grupo && grupo.responder ? W.textoResposta(cfg.respostaModelo, { ticketId: p.ticketId, solicitante: p.solicitante, tipo: NOME_TIPO.get(p.tipo) || '' }) : null,
        };
      });
      res.json({ ultimo: pedidos.length ? pedidos[pedidos.length - 1].evento : desde, eventos });
    }));

    app.post('/api/whatsapp/bot/estado', asyncHandler(async (req, res) => {
      exigirBot(req);
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const grupos = Array.isArray(b.grupos) ? b.grupos.slice(0, 300).map((g) => ({ jid: String(g.jid || '').slice(0, 120), nome: String(g.nome || '').slice(0, 120) })).filter((g) => g.jid) : [];
      estadoBot = { conectado: b.conectado === true, numero: String(b.numero || '').slice(0, 40), qr: typeof b.qr === 'string' ? b.qr.slice(0, 20000) : '', grupos, atualizadoEm: new Date().toISOString() };
      res.json({ ok: true });
    }));

    // ---- navegador do Chamados automático
    app.get('/api/whatsapp/fila', asyncHandler(async (req, res) => {
      await admin.identificar(req);
      res.set('Cache-Control', 'no-store');
      res.json((await repo.listarPendentes()).map((p) => ({ id: p.id, grupo: p.grupoNome, solicitante: p.solicitante, tipo: p.tipo, texto: truncar(p.texto, 200) })));
    }));

    app.post('/api/whatsapp/fila/:id/abrir', asyncHandler(async (req, res) => {
      await admin.identificar(req);
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) throw new ErroHttp(400, 'id inválido');
      const token = String(req.get('X-Glpi-Token') || '').trim();
      const pedido = await repo.reivindicar(id);
      if (!pedido) throw new ErroHttp(409, 'Esse pedido já foi aberto por outro computador ou não está mais na fila.');
      try {
        const ticketId = await abrirNoGlpi(pedido, token);
        await repo.mudarStatus(id, 'aberto', { ticketId });
        res.json({ ticketId });
      } catch (err) {
        const msg = truncar(limpar(err.message, token), 300);
        await repo.mudarStatus(id, 'erro', { erro: msg });
        throw new ErroHttp(502, msg);
      }
    }));

    app.post('/api/whatsapp/resultado', asyncHandler(async (req, res) => {
      await admin.identificar(req);
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const ticketId = Number(b.ticketId);
      if (!Number.isSafeInteger(ticketId) || ticketId < 1 || typeof b.ok !== 'boolean') throw new ErroHttp(400, 'informe ticketId e ok');
      const pedido = await repo.pedidoPorChamado(ticketId);
      if (!pedido) return res.json({ atualizado: false }); // chamado que não veio do WhatsApp
      const novo = await repo.mudarStatus(pedido.id, b.ok ? 'concluido' : 'erro', { erro: b.ok ? '' : truncar(String(b.texto || ''), 300), deSituacoes: ['aberto'] });
      res.json({ atualizado: !!novo });
    }));

    // ---- administração
    app.get('/api/admin/whatsapp/painel', asyncHandler(async (req, res) => {
      await admin.exigirAdmin(req);
      res.set('Cache-Control', 'no-store');
      const pedidos = (await repo.listarRecentes(30)).map((p) => ({ id: p.id, grupo: p.grupoNome, solicitante: p.solicitante, tipo: p.tipo, status: p.status, ticketId: p.ticketId, erro: p.erro, texto: truncar(p.texto, 140), criadoEm: p.criadoEm }));
      res.json({
        vinculos: await repo.listarVinculos(),
        pedidos,
        estado: { ...estadoBot, botConfigurado: !!tokenBot },
        disponivel: { so_abrir: !!tokenServico },
      });
    }));

    app.post('/api/admin/whatsapp/vinculos', asyncHandler(async (req, res) => {
      await admin.exigirAdmin(req);
      const v = W.validarVinculo(req.body);
      if (!v.ok) throw new ErroHttp(400, v.error);
      res.status(201).json(await repo.salvarVinculo(v.valor));
    }));

    app.delete('/api/admin/whatsapp/vinculos/:telefone', asyncHandler(async (req, res) => {
      await admin.exigirAdmin(req);
      const tel = W.normalizarTelefone(req.params.telefone);
      if (!tel) throw new ErroHttp(400, 'telefone inválido');
      if (!(await repo.removerVinculo(tel))) throw new ErroHttp(404, 'não encontrado');
      res.status(204).end();
    }));
  }

  return { registrar, processarMensagem, verificarAbertos, abrirPendentesAtrasados };
}

module.exports = { criarRotasWhatsapp };
