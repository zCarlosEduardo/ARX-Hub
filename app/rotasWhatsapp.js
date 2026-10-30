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
const { SITUACOES_COM_CHAMADO } = require('./repoWhatsapp');

// tipos que não dependem de associação: no privado não precisam de "Categoria X" (quem diz a associação é a categoria do GLPI)
const TIPOS_SEM_CATEGORIA = new Set(['foto_perfil', 'senha_sistemas']);
// tipos com categoria fixa no GLPI, em grupo ou no privado (a foto de perfil sempre vai para "ARX - Demandas internas")
const CATEGORIA_FIXA = { foto_perfil: W.CATEGORIA_INTERNA_ID };
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
    const id = await glpi.criarChamado(token, { titulo, descricao, categoriaId: CATEGORIA_FIXA[pedido.tipo] || pedido.categoriaId, requerenteId: pedido.glpiId });
    if (deps.registrarHistorico) await deps.registrarHistorico({ id, titulo, descricao, pedido }).catch(() => {});
    return id;
  }

  // Registro das últimas mensagens que o robô entregou ao Hub e o que foi decidido de cada uma (inclusive as ignoradas, com o
  // motivo), só em memória: é o que a tela "Conexão e pedidos" mostra para a pessoa entender uma reação ou um silêncio.
  const decisoes = [];
  const mascararTelefone = (t) => {
    const d = W.normalizarTelefone(t);
    return d ? `***${d.slice(-4)}` : 'Não informado';
  };
  const trecho = (t) => truncar(String(t || '').replace(/\s+/g, ' ').replace(/\d{6,}/g, '***').trim(), 70);
  function registrarDecisao(b, r) {
    decisoes.unshift({
      quando: new Date().toISOString(),
      onde: b.privado === true ? 'Conversa privada' : (b.grupoNome || 'Grupo'),
      remetente: mascararTelefone(b.remetente),
      trecho: trecho(b.texto),
      resultado: r.status,
      motivo: r.motivo || '',
      // análise da IA local e a resposta que ela daria (aparece mesmo no modo só reagir, para conferir)
      ia: r.ia ? { tipo: r.ia.tipo, confianca: r.ia.confianca, motivo: truncar(r.ia.motivo || '', 200), resposta: truncar(r.ia.resposta || '', 300), tipoRegra: r.ia.tipoRegra } : null,
    });
    if (decisoes.length > 100) decisoes.length = 100;
  }

  const ignorar = (motivo) => ({ status: 'ignorado', motivo });

  /** O que o robô responde na conversa privada quando faltou a categoria (só se "explicar dúvida" estiver ligado). */
  function explicacaoDaCategoria(cfg, apelido) {
    const nomes = cfg.privado.categorias.map((c) => c.apelido);
    if (!nomes.length) return 'Ainda não há categorias cadastradas para a conversa privada. Peça a um administrador para cadastrar na Administração do Hub.';
    const lista = `Categorias disponíveis: ${nomes.join(', ')}.`;
    if (apelido) return `Não encontrei a categoria "${truncar(apelido, 60)}". ${lista} Escreva na primeira linha, por exemplo: Categoria ${nomes[0]}.`;
    return `Não consegui identificar a categoria. Escreva na primeira linha, por exemplo: Categoria ${nomes[0]}. ${lista}`;
  }

  /**
   * Decide o que fazer com uma mensagem (de grupo ou da conversa privada). Devolve { status, motivo, pedidoId?, ticketId?,
   * reacao?, resposta? }. Na conversa privada (b.privado) não há grupo: a categoria do GLPI vem da linha "Categoria X" da mensagem.
   */
  async function decidir(b) {
    const cfg = (await admin.configAtual()).whatsapp;
    if (!cfg.ativo) return ignorar('Automação do WhatsApp desligada na Administração.');
    const bruto = typeof b.texto === 'string' ? b.texto.trim().slice(0, 5000) : '';
    const mensagemId = typeof b.mensagemId === 'string' ? b.mensagemId.slice(0, 200) : '';
    if (!bruto || !mensagemId) return ignorar('Mensagem sem texto.');
    const ehPrivado = b.privado === true;
    let grupo = null;
    if (ehPrivado) {
      if (!cfg.privado.ativo) return ignorar('Atender no privado está desligado.');
    } else {
      grupo = cfg.grupos.find((g) => g.ativo && ((g.jid && g.jid === b.grupoJid) || (!g.jid && sem(g.nome) === sem(b.grupoNome))));
      if (!grupo) return ignorar('Grupo não configurado ou desligado.');
    }
    if (cfg.remetentesAutorizados.length && !cfg.remetentesAutorizados.some((t) => W.mesmoTelefone(t, b.remetente))) return ignorar('Telefone fora da lista de autorizados.');

    const { apelido, texto } = ehPrivado ? W.extrairCategoria(bruto) : { apelido: '', texto: bruto };
    const { tipo: tipoRegra } = await classificar(texto);
    // IA local ligada: valida o tipo pelo contexto e diz a resposta que daria (sempre registrada para conferir)
    const cfgIa = (await admin.configAtual()).ia || {};
    // mensagens anteriores da mesma pessoa (o robô manda quando guarda a conversa): a IA lê junto para pegar o que faltou
    const contexto = Array.isArray(b.contexto) ? b.contexto.filter((x) => typeof x === 'string').slice(-6).map((x) => x.slice(0, 1000)) : [];
    const analiseIa = cfgIa.ligada && deps.ia ? await deps.ia.whatsapp({ mensagem: texto, contexto, tipoRegra }).catch(() => null) : null;
    const { tipo } = W.tipoComIa({ tipoRegra, ia: analiseIa, cfg: cfgIa });
    const comIa = (r) => (analiseIa ? { ...r, ia: { tipo: analiseIa.tipo, confianca: analiseIa.confianca, motivo: analiseIa.motivo, resposta: analiseIa.resposta, tipoRegra } } : r);
    const respostaIa = cfgIa.whatsappModo === 'responder' && analiseIa && analiseIa.resposta ? analiseIa.resposta : null;
    const tiposLiberados = ehPrivado ? cfg.privado.tipos : grupo.tipos;
    // conversa solta ou pedido que não é deste grupo: o robô fica quieto
    if (!tipo) return comIa(ignorar(analiseIa && tipoRegra ? 'A IA avaliou que não é um pedido atendido.' : 'Não parece um pedido de nenhum tipo atendido.'));
    if (tiposLiberados.length && !tiposLiberados.includes(tipo)) return comIa(ignorar(`O tipo "${NOME_TIPO.get(tipo) || tipo}" não está liberado ${ehPrivado ? 'na conversa privada' : 'neste grupo'}.`));

    const vinculo = W.acharVinculo(await repo.listarVinculos(), b.remetente);
    // no privado qualquer pessoa pode escrever para o chip: quem não tem vínculo é ignorado em silêncio (nos grupos continua a dúvida)
    if (ehPrivado && !vinculo) return comIa(ignorar('Telefone sem vínculo com usuário do GLPI (ignorado no privado).'));
    const categoriaFixa = CATEGORIA_FIXA[tipo] || null;
    const categoria = ehPrivado && !categoriaFixa ? W.acharCategoria(cfg.privado.categorias, apelido) : null;
    const reagirLigado = ehPrivado ? cfg.privado.reagir : grupo.reagir;
    const base = {
      mensagemId, grupoId: ehPrivado ? 'privado' : grupo.id, grupoJid: String(b.grupoJid || ''), grupoNome: ehPrivado ? 'Conversa privada' : grupo.nome,
      telefone: W.normalizarTelefone(b.remetente), solicitante: vinculo ? vinculo.nome : '', glpiId: vinculo ? vinculo.glpiId : null,
      categoriaId: categoriaFixa || (ehPrivado ? (categoria ? categoria.categoriaId : null) : grupo.categoriaId), texto, tipo,
    };
    let status = 'pendente';
    let erro = '';
    let resposta;
    if (!vinculo) {
      status = 'sem_vinculo';
      erro = 'Telefone sem vínculo com usuário do GLPI (aba Vínculos do WhatsApp).';
    } else if (ehPrivado && !categoriaFixa && !categoria && (apelido || !TIPOS_SEM_CATEGORIA.has(tipo))) {
      status = 'sem_categoria';
      erro = apelido ? `A categoria "${truncar(apelido, 60)}" não está cadastrada para a conversa privada.` : 'A mensagem não diz a categoria (primeira linha: Categoria Ancore).';
      if (cfg.privado.explicarDuvida !== false) resposta = explicacaoDaCategoria(cfg, apelido);
    } else if (cfg.modo === 'observacao') {
      status = 'observado';
      erro = 'Modo Observação: o pedido foi entendido, mas nada foi aberto.';
    } else if (cfg.operacao === 'so_abrir') {
      if (tokenServico) status = 'abrindo'; // o pedido nasce reservado: mensagem repetida não abre o chamado duas vezes
      else {
        status = 'erro';
        erro = 'O token de serviço do GLPI não está configurado neste Hub (HUB_GLPI_TOKEN_SERVICO).';
      }
    } else {
      erro = 'Na fila: espera o Chamados automático de alguém (ou o token de serviço) abrir o chamado.';
    }
    const { pedido, novo } = await repo.criarPedido({ ...base, status, ticketId: null, erro: status === 'pendente' || status === 'observado' ? '' : erro });
    const reagir = (st) => (reagirLigado ? W.reacaoDoStatus(st, cfg.reacoes) : null);
    // modo "responder" da IA: o texto dela vai para o grupo junto da reação (no modo Observação nada é enviado)
    if (!resposta && respostaIa && cfg.modo !== 'observacao' && (status === 'pendente' || status === 'abrindo')) resposta = respostaIa;
    if (!novo) return comIa({ status: pedido.status, motivo: 'Mensagem repetida: o robô já tinha tratado.', pedidoId: pedido.id, ticketId: pedido.ticketId, repetida: true, reacao: reagir(pedido.status) });
    if (status !== 'abrindo') return comIa({ status, motivo: erro, pedidoId: pedido.id, ticketId: null, reacao: reagir(status), ...(resposta ? { resposta } : {}) });
    try {
      const ticketId = await abrirNoGlpi(pedido, tokenServico);
      await repo.mudarStatus(pedido.id, 'aberto', { ticketId });
      return comIa({ status: 'aberto', motivo: `Chamado ${ticketId} aberto.`, pedidoId: pedido.id, ticketId, reacao: reagir('aberto'), ...(resposta ? { resposta } : {}) });
    } catch (err) {
      const msg = truncar(limpar(err.message, tokenServico), 300);
      await repo.mudarStatus(pedido.id, 'erro', { erro: msg });
      return comIa({ status: 'erro', motivo: msg, pedidoId: pedido.id, ticketId: null, reacao: reagir('erro') });
    }
  }

  async function processarMensagem(b) {
    const r = await decidir(b);
    registrarDecisao(b, r);
    return r;
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
        if (st >= 5 && (await repo.mudarStatus(p.id, 'concluido', { deSituacoes: SITUACOES_COM_CHAMADO }))) concluidos += 1;
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
      res.json({ ativo: c.ativo, modo: c.modo, numeros: c.numeros, reacoes: c.reacoes, conversas: c.conversas, privado: { ativo: c.privado.ativo, responder: c.privado.responder, reagir: c.privado.reagir }, grupos: c.grupos.filter((g) => g.ativo).map((g) => ({ id: g.id, nome: g.nome, jid: g.jid, numeroId: g.numeroId, responder: g.responder, reagir: g.reagir })) });
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
      // depois de um erro o chamado pode ser finalizado numa nova execução: erro -> concluído troca a reação no WhatsApp
      const novo = await repo.mudarStatus(pedido.id, b.ok ? 'concluido' : 'erro', { erro: b.ok ? '' : truncar(String(b.texto || ''), 300), deSituacoes: SITUACOES_COM_CHAMADO });
      res.json({ atualizado: !!novo });
    }));

    // ---- Conversas: ler as conversas guardadas pelo robô, responder e abrir chamado com as mensagens marcadas. Ligadas e com
    // quem pode ver na Administração (só administradores, administradores e grupos do GLPI marcados, ou todos com token).
    const podeConversas = (cfg, usuario, ehAdmin) => cfg.conversas.ativo && (ehAdmin || cfg.conversas.quem === 'todos'
      || (cfg.conversas.quem === 'grupos' && ((usuario && usuario.grupos) || []).some((g) => cfg.conversas.grupos.includes(g))));
    async function exigirConversas(req) {
      const { usuario, admin: ehAdmin } = await admin.quemE(req);
      const cfg = (await admin.configAtual()).whatsapp;
      if (!cfg.conversas.ativo) throw new ErroHttp(403, 'As Conversas estão desligadas. Ligue em Administração > WhatsApp > Conversas e respostas.');
      if (!podeConversas(cfg, usuario, !!ehAdmin)) throw new ErroHttp(403, 'Você não tem acesso às Conversas do WhatsApp.');
      return cfg;
    }

    // a aba só aparece para quem pode ver; sem token ou com token recusado, simplesmente não aparece
    app.get('/api/whatsapp/conversas/acesso', asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store');
      let r;
      try {
        r = await admin.quemE(req);
      } catch {
        return res.json({ pode: false });
      }
      res.json({ pode: podeConversas((await admin.configAtual()).whatsapp, r.usuario, !!r.admin) });
    }));

    const exigirRobo = () => {
      if (!deps.robo) throw new ErroHttp(503, 'O robô do WhatsApp não está configurado neste Hub.');
      return deps.robo;
    };
    const jidValido = (j) => (typeof j === 'string' && /^[0-9A-Za-z.:_-]{3,100}@(g\.us|s\.whatsapp\.net|lid)$/.test(j) ? j : null);
    const erroRobo = (err) => new ErroHttp(502, `O robô do WhatsApp não respondeu: ${truncar(err.message, 200)}`);

    app.get('/api/whatsapp/conversas', asyncHandler(async (req, res) => {
      const cfg = await exigirConversas(req);
      res.set('Cache-Control', 'no-store');
      const lista = await exigirRobo().conversas().catch((err) => { throw erroRobo(err); });
      // tipos e respostas vão junto: quem vê as Conversas pode não ser administrador (não lê a configuração)
      res.json({ ativo: true, conversas: lista, respostas: cfg.respostas, tipos: TIPOS_SOLICITACAO.map((t) => ({ chave: t.chave, nome: t.nome })) });
    }));

    app.post('/api/whatsapp/conversas/sugerir', asyncHandler(async (req, res) => {
      const cfg = await exigirConversas(req);
      const cfgIa = (await admin.configAtual()).ia || {};
      if (!cfgIa.ligada || !deps.ia || !deps.ia.sugerirChamado) throw new ErroHttp(503, 'A IA local está desligada. Ligue em Administração > IA local.');
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const jid = jidValido(b.jid);
      const ids = Array.isArray(b.ids) ? b.ids.filter((x) => typeof x === 'string').slice(0, 30) : [];
      if (!jid || !ids.length) throw new ErroHttp(400, 'Marque ao menos uma mensagem.');
      const marcadas = (await exigirRobo().mensagens(jid, 0, 300).catch((err) => { throw erroRobo(err); })).filter((m) => ids.includes(m.id)).sort((x, y) => x.quando - y.quando);
      const textos = marcadas.map((m) => m.texto).filter(Boolean);
      if (!textos.length) throw new ErroHttp(400, 'As mensagens marcadas não têm texto para a IA ler (áudio e imagem sem legenda não contam).');
      const { tipo: tipoRegra } = await classificar(textos.join('\n')).catch(() => ({ tipo: null }));
      const conversa = typeof b.conversa === 'string' ? b.conversa.slice(0, 120) : '';
      // categorias do GLPI com o token de quem pede (a categoria é a associação); sem elas fica só a interna
      const token = String(req.get('X-Glpi-Token') || '').trim();
      const categorias = glpi.fetchLookup ? ((await glpi.fetchLookup(token).catch(() => null)) || {}).categories || [] : [];
      const associacoes = categorias.filter((c) => c.id !== W.CATEGORIA_INTERNA_ID).map((c) => W.curtoCategoria(c.label)).filter(Boolean);
      let s;
      try {
        s = await deps.ia.sugerirChamado({ mensagens: textos, tipoRegra, associacoes, conversa });
      } catch (err) {
        throw new ErroHttp(502, `A IA local não respondeu: ${truncar(err.message, 200)}`);
      }
      if (!s) throw new ErroHttp(502, 'A IA local não respondeu.');
      const grupo = cfg.grupos.find((g) => g.jid === jid && g.categoriaId);
      const categoria = W.categoriaSugerida({ categorias, grupoCategoriaId: grupo ? grupo.categoriaId : null, grupoCategoriaNome: grupo ? grupo.categoriaLabel : '', texto: textos.join('\n'), conversa, associacaoIa: s.associacao || '' });
      const tipo = s.tipo && NOME_TIPO.has(s.tipo) ? s.tipo : null;
      res.json({
        titulo: s.titulo || '', tipo, tipoNome: tipo ? NOME_TIPO.get(tipo) : 'Sem automação', confianca: s.confianca || 0, motivo: s.motivo || '',
        categoria, parecidos: Array.isArray(s.parecidos) ? s.parecidos.slice(0, 3) : [],
      });
    }));

    app.get('/api/whatsapp/conversas/mensagens', asyncHandler(async (req, res) => {
      await exigirConversas(req);
      const jid = jidValido(req.query.jid);
      if (!jid) throw new ErroHttp(400, 'conversa inválida');
      const antesDe = Number(req.query.antesDe) || 0;
      const lista = await exigirRobo().mensagens(jid, antesDe).catch((err) => { throw erroRobo(err); });
      // quem tem vínculo com usuário do GLPI já vem com ele: é o requerente sugerido ao abrir o chamado
      const vinculos = await repo.listarVinculos();
      res.set('Cache-Control', 'no-store');
      res.json(lista.map((m) => {
        const v = m.deMim ? null : W.acharVinculo(vinculos, m.remetente);
        return { ...m, remetente: m.deMim ? '' : mascararTelefone(m.remetente), vinculo: v ? { glpiId: v.glpiId, nome: v.nome } : null };
      }));
    }));

    app.get('/api/whatsapp/midia/:id', asyncHandler(async (req, res) => {
      await exigirConversas(req);
      if (!/^[A-Za-z0-9_-]{4,80}$/.test(req.params.id)) throw new ErroHttp(400, 'id inválido');
      const m = await exigirRobo().midia(req.params.id).catch((err) => { throw erroRobo(err); });
      if (!m) throw new ErroHttp(404, 'Mídia não encontrada (pode ter passado do prazo de guarda).');
      res.set({ 'Content-Type': m.mime || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" });
      res.send(m.conteudo);
    }));

    app.post('/api/whatsapp/conversas/responder', asyncHandler(async (req, res) => {
      await exigirConversas(req);
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const jid = jidValido(b.jid);
      const texto = typeof b.texto === 'string' ? b.texto.trim() : '';
      if (!jid || !texto || texto.length > 2000) throw new ErroHttp(400, 'Informe a conversa e um texto de até 2000 caracteres.');
      res.json(await exigirRobo().enviar(jid, texto).catch((err) => { throw erroRobo(err); }));
    }));

    app.post('/api/whatsapp/conversas/chamado', asyncHandler(async (req, res) => {
      await exigirConversas(req);
      const token = String(req.get('X-Glpi-Token') || '').trim();
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const jid = jidValido(b.jid);
      const ids = Array.isArray(b.ids) ? [...new Set(b.ids.filter((x) => typeof x === 'string'))].slice(0, 100) : [];
      const titulo = typeof b.titulo === 'string' ? b.titulo.trim().slice(0, 250) : '';
      const categoriaId = Number(b.categoriaId);
      const requerenteId = b.requerenteId == null || b.requerenteId === '' ? null : Number(b.requerenteId);
      const resposta = typeof b.resposta === 'string' ? b.resposta.trim().slice(0, 2000) : '';
      if (!jid || !ids.length) throw new ErroHttp(400, 'Marque ao menos uma mensagem.');
      if (!titulo) throw new ErroHttp(400, 'Informe o título do chamado.');
      if (!Number.isInteger(categoriaId) || categoriaId < 1) throw new ErroHttp(400, 'Escolha a categoria do chamado.');
      if (requerenteId !== null && (!Number.isInteger(requerenteId) || requerenteId < 1)) throw new ErroHttp(400, 'Requerente inválido.');
      if (b.tipo && !NOME_TIPO.has(b.tipo)) throw new ErroHttp(400, 'Tipo de solicitação inválido.');
      const robo = exigirRobo();
      const todas = await robo.mensagens(jid, 0, 300).catch((err) => { throw erroRobo(err); });
      const marcadas = todas.filter((m) => ids.includes(m.id));
      if (!marcadas.length) throw new ErroHttp(404, 'As mensagens marcadas não estão mais guardadas.');
      const anexos = [];
      let total = 0;
      for (const m of marcadas.filter((x) => x.midia && x.midia.disponivel)) {
        const arq = await robo.midia(m.id).catch(() => null);
        if (!arq || total + arq.conteudo.length > 25 * 1024 * 1024) continue; // o que não couber fica citado só no texto
        total += arq.conteudo.length;
        anexos.push({ nome: W.nomeAnexo(m), tipo: (arq.mime || 'application/octet-stream').split(';')[0], conteudo: arq.conteudo });
      }
      const descricao = W.descricaoConversa(marcadas, { conversa: typeof b.conversa === 'string' ? b.conversa.slice(0, 120) : '' });
      let r;
      try {
        r = await glpi.createTicketComAnexos(token, { titulo, descricao, categoriaId, requerenteId }, anexos);
      } catch (err) {
        throw new ErroHttp(502, truncar(limpar(err.message, token), 300));
      }
      if (deps.registrarHistorico) await deps.registrarHistorico({ id: r.id, titulo, descricao, pedido: { solicitante: '' } }).catch(() => {});
      let respondido = false;
      let erroResposta = '';
      if (resposta) {
        try {
          await robo.enviar(jid, W.textoResposta(resposta, { ticketId: r.id, solicitante: typeof b.solicitante === 'string' ? b.solicitante.slice(0, 120) : '', tipo: NOME_TIPO.get(b.tipo) || '' }));
          respondido = true;
        } catch (err) {
          erroResposta = truncar(err.message, 200);
        }
      }
      res.json({ ticketId: r.id, falhas: r.falhas || [], respondido, erroResposta });
    }));

    // ---- administração
    app.get('/api/admin/whatsapp/painel', asyncHandler(async (req, res) => {
      await admin.exigirAdmin(req);
      res.set('Cache-Control', 'no-store');
      const pedidos = (await repo.listarRecentes(30)).map((p) => ({ id: p.id, grupo: p.grupoNome, solicitante: p.solicitante, tipo: p.tipo, status: p.status, ticketId: p.ticketId, erro: p.erro, texto: truncar(p.texto, 140), criadoEm: p.criadoEm }));
      res.json({
        vinculos: await repo.listarVinculos(),
        pedidos,
        mensagens: decisoes,
        reacoes: (await admin.configAtual()).whatsapp.reacoes,
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

    // troca de número: o robô sai do WhatsApp, apaga a sessão e volta a mostrar o QR code (fica no histórico)
    app.post('/api/admin/whatsapp/desconectar', asyncHandler(async (req, res) => {
      const usuario = await admin.exigirAdmin(req);
      const antes = estadoBot.numero || '';
      await exigirRobo().desconectar().catch((err) => { throw erroRobo(err); });
      estadoBot = { ...estadoBot, conectado: false, numero: '', qr: '' };
      if (admin.anotar) await admin.anotar(usuario, 'whatsapp.desconectar', 'Robô do WhatsApp', { numero: antes ? `***${antes.slice(-4)}` : '' }, { numero: '' });
      res.json({ ok: true });
    }));
  }

  return { registrar, processarMensagem, verificarAbertos, abrirPendentesAtrasados };
}

module.exports = { criarRotasWhatsapp };
