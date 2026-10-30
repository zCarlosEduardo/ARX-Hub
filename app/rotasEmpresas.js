// Administração > Empresas e sistemas: cadastro único do banco-central (associações, sistemas como SGA e PowerCRM, e em
// quais sistemas cada empresa está). Só admin; o Hub repassa com o token de serviço do banco (BANCO_CENTRAL_TOKEN).
// O `mobile` e o token da API do SGA (`tokenApi`) nunca voltam para a tela nem para o histórico: vazio na edição mantém o
// guardado; `limparTokenApi` apaga o token (volta a valer o TOKEN_<NOME> do .env.tokens-sga).
//
//   GET    /api/admin/empresas               empresas (com os sistemas de cada uma) e sistemas
//   POST   /api/admin/empresas               { nome, cnpj? }
//   PUT    /api/admin/empresas/:id           { nome, cnpj?, ativo }
//   DELETE /api/admin/empresas/:id
//   POST   /api/admin/sistemas               { nome }
//   PUT    /api/admin/sistemas/:id           { nome }
//   DELETE /api/admin/sistemas/:id
//   POST   /api/admin/empresas/:id/sistemas  { sistemaId, url, urlAcesso?, nomeNoSistema?, identificadorNoSistema?, mobile?, tokenApi? }
//                                            SGA sem chave nas automações (código "sga") ganha uma pelo nome
//   PUT    /api/admin/ligacoes/:id           { url, urlAcesso?, nomeNoSistema?, identificadorNoSistema?, ativo, mobile?, tokenApi?, limparTokenApi? }
//   DELETE /api/admin/ligacoes/:id

function criarRotasEmpresas({ exigirAdmin, anotar, asyncHandler, ErroHttp, banco }) {
  const url = String((banco && banco.url) || '').replace(/\/+$/, '');
  const token = (banco && banco.token) || '';
  const buscar = (banco && banco.fetch) || fetch;

  async function chamar(metodo, caminho, corpo) {
    if (!url || !token) throw new ErroHttp(424, 'O Hub não está ligado ao banco central (BANCO_CENTRAL_URL e BANCO_CENTRAL_TOKEN no .env).');
    let r;
    try {
      r = await buscar(`${url}/api${caminho}`, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new ErroHttp(424, 'O banco central não respondeu.');
    }
    const dados = r.status === 204 ? null : await r.json().catch(() => ({}));
    if (!r.ok) throw new ErroHttp([400, 404, 409].includes(r.status) ? r.status : 424, (dados && dados.error) || `O banco central recusou (${r.status}).`);
    return dados;
  }

  const id = (v) => {
    const n = Number(v);
    if (!Number.isSafeInteger(n) || n < 1) throw new ErroHttp(400, 'id inválido');
    return n;
  };
  /** Texto aparado; vazio vira null (os campos únicos do banco não podem repetir ''). */
  function texto(v, rotulo, max, obrigatorio = false) {
    const t = v == null ? '' : String(v).trim();
    if (obrigatorio && !t) throw new ErroHttp(400, `Informe ${rotulo}.`);
    if (t.length > max) throw new ErroHttp(400, `${rotulo[0].toUpperCase()}${rotulo.slice(1)} passa de ${max} caracteres.`);
    return t || null;
  }
  function endereco(v, rotulo = 'o endereço', obrigatorio = true) {
    const t = texto(v, rotulo, 300, obrigatorio);
    if (t && !/^https?:\/\/\S+$/i.test(t)) throw new ErroHttp(400, `${rotulo[0].toUpperCase()}${rotulo.slice(1)} precisa começar com http:// ou https://.`);
    return t;
  }
  /** Chave da empresa nas automações do SGA (e nos acessos guardados no Hub): letras e números, sem acento. */
  const chaveDe = (nome) => String(nome).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const semSegredo = ({ mobile, tokenApi, ...resto }) => ({ ...resto, mobileDefinido: !!mobile, tokenApiDefinido: !!tokenApi });
  const ligacao = (b, editar) => {
    const v = {
      url: endereco(b.url),
      urlAcesso: endereco(b.urlAcesso, 'o endereço de acesso', false),
      nomeNoSistema: texto(b.nomeNoSistema, 'o nome no sistema', 120),
      identificadorNoSistema: texto(b.identificadorNoSistema, 'o identificador', 120),
      ativo: b.ativo === undefined ? true : !!b.ativo,
    };
    const mobile = texto(b.mobile, 'o código mobile', 300);
    if (mobile || !editar) v.mobile = mobile || undefined;
    const tokenApi = texto(b.tokenApi, 'o token da API', 500);
    if (tokenApi) v.tokenApi = tokenApi;
    else if (editar && b.limparTokenApi === true) v.tokenApi = null;
    return v;
  };

  /** SGA ligado a empresa sem chave nas automações: cria a chave pelo nome (é ela que o Hub guarda nos acessos). */
  async function garantirChaveSga(associacaoId, sistemaId) {
    const sistema = (await chamar('GET', '/sistemas')).find((s) => s.id === sistemaId);
    if (!sistema || sistema.nome !== 'SGA') return;
    const codigos = await chamar('GET', '/associacao-codigos?contexto=sga');
    if (codigos.some((c) => c.associacaoId === associacaoId)) return;
    const empresa = (await chamar('GET', '/associacoes')).find((a) => a.id === associacaoId);
    const base = chaveDe(empresa ? empresa.nome : '') || 'empresa';
    const chave = codigos.some((c) => c.codigo === base) ? base + associacaoId : base;
    await chamar('POST', '/associacao-codigos', { associacaoId, contexto: 'sga', codigo: chave, nome: empresa ? empresa.nome : null });
  }

  function registrar(app) {
    // Nomes dos sistemas para os selos e o formulário de automação do painel (sem login, como o resto do painel; só nomes)
    app.get('/api/sistemas', asyncHandler(async (req, res) => {
      const sists = await chamar('GET', '/sistemas');
      res.set('Cache-Control', 'no-store');
      res.json(sists.map((s) => s.nome).sort((a, b) => a.localeCompare(b, 'pt-BR')));
    }));

    app.get('/api/admin/empresas', asyncHandler(async (req, res) => {
      await exigirAdmin(req);
      const [assocs, sists, ligs, cods] = await Promise.all([chamar('GET', '/associacoes'), chamar('GET', '/sistemas'), chamar('GET', '/associacao-sistemas'), chamar('GET', '/associacao-codigos?contexto=sga')]);
      const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
      res.set('Cache-Control', 'no-store');
      res.json({
        empresas: assocs.sort(porNome).map((a) => ({ id: a.id, nome: a.nome, cnpj: a.cnpj, ativo: a.ativo, chaveSga: (cods.find((c) => c.associacaoId === a.id) || {}).codigo || null, sistemas: ligs.filter((l) => l.associacaoId === a.id).map(semSegredo) })),
        sistemas: sists.sort(porNome).map((s) => ({ ...s, total: ligs.filter((l) => l.sistemaId === s.id).length })),
      });
    }));

    app.post('/api/admin/empresas', asyncHandler(async (req, res) => {
      const usuario = await exigirAdmin(req);
      const b = req.body || {};
      const criado = await chamar('POST', '/associacoes', { nome: texto(b.nome, 'o nome', 120, true), cnpj: texto(b.cnpj, 'o CNPJ', 18) });
      await anotar(usuario, 'empresa.adicionar', criado.nome, null, criado);
      res.status(201).json(criado);
    }));

    app.put('/api/admin/empresas/:id', asyncHandler(async (req, res) => {
      const usuario = await exigirAdmin(req);
      const b = req.body || {};
      const novo = await chamar('PUT', `/associacoes/${id(req.params.id)}`, { nome: texto(b.nome, 'o nome', 120, true), cnpj: texto(b.cnpj, 'o CNPJ', 18), ativo: b.ativo === undefined ? true : !!b.ativo });
      await anotar(usuario, 'empresa.alterar', novo.nome, null, novo);
      res.json(novo);
    }));

    app.delete('/api/admin/empresas/:id', asyncHandler(async (req, res) => {
      const usuario = await exigirAdmin(req);
      const n = id(req.params.id);
      const antes = (await chamar('GET', '/associacoes')).find((a) => a.id === n) || null;
      await chamar('DELETE', `/associacoes/${n}`);
      await anotar(usuario, 'empresa.remover', antes ? antes.nome : n, antes, null);
      res.status(204).end();
    }));

    app.post('/api/admin/sistemas', asyncHandler(async (req, res) => {
      const usuario = await exigirAdmin(req);
      const criado = await chamar('POST', '/sistemas', { nome: texto((req.body || {}).nome, 'o nome', 60, true) });
      await anotar(usuario, 'sistema.adicionar', criado.nome, null, criado);
      res.status(201).json(criado);
    }));

    app.put('/api/admin/sistemas/:id', asyncHandler(async (req, res) => {
      const usuario = await exigirAdmin(req);
      const novo = await chamar('PUT', `/sistemas/${id(req.params.id)}`, { nome: texto((req.body || {}).nome, 'o nome', 60, true) });
      await anotar(usuario, 'sistema.alterar', novo.nome, null, novo);
      res.json(novo);
    }));

    app.delete('/api/admin/sistemas/:id', asyncHandler(async (req, res) => {
      const usuario = await exigirAdmin(req);
      const n = id(req.params.id);
      const antes = (await chamar('GET', '/sistemas')).find((s) => s.id === n) || null;
      await chamar('DELETE', `/sistemas/${n}`);
      await anotar(usuario, 'sistema.remover', antes ? antes.nome : n, antes, null);
      res.status(204).end();
    }));

    app.post('/api/admin/empresas/:id/sistemas', asyncHandler(async (req, res) => {
      const usuario = await exigirAdmin(req);
      const b = req.body || {};
      const associacaoId = id(req.params.id);
      const sistemaId = id(b.sistemaId);
      const criado = semSegredo(await chamar('POST', '/associacao-sistemas', { associacaoId, sistemaId, ...ligacao(b, false) }));
      await garantirChaveSga(associacaoId, sistemaId);
      await anotar(usuario, 'empresa.sistema.adicionar', `associação ${criado.associacaoId}`, null, criado);
      res.status(201).json(criado);
    }));

    app.put('/api/admin/ligacoes/:id', asyncHandler(async (req, res) => {
      const usuario = await exigirAdmin(req);
      const novo = semSegredo(await chamar('PUT', `/associacao-sistemas/${id(req.params.id)}`, ligacao(req.body || {}, true)));
      await anotar(usuario, 'empresa.sistema.alterar', `associação ${novo.associacaoId}`, null, novo);
      res.json(novo);
    }));

    app.delete('/api/admin/ligacoes/:id', asyncHandler(async (req, res) => {
      const usuario = await exigirAdmin(req);
      const n = id(req.params.id);
      const antes = (await chamar('GET', '/associacao-sistemas')).find((l) => l.id === n);
      await chamar('DELETE', `/associacao-sistemas/${n}`);
      await anotar(usuario, 'empresa.sistema.remover', antes ? `associação ${antes.associacaoId}` : n, antes ? semSegredo(antes) : null, null);
      res.status(204).end();
    }));
  }

  return { registrar };
}

module.exports = { criarRotasEmpresas };
