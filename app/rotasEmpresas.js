// Administração > Empresas e sistemas: cadastro único do banco-central (associações, sistemas como SGA e PowerCRM, e em
// quais sistemas cada empresa está). Só admin; o Hub repassa com o token de serviço do banco (BANCO_CENTRAL_TOKEN).
// O `mobile` do SGA (token da associação) nunca volta para a tela nem para o histórico: vazio na edição mantém o guardado.
//
//   GET    /api/admin/empresas               empresas (com os sistemas de cada uma) e sistemas
//   POST   /api/admin/empresas               { nome, cnpj? }
//   PUT    /api/admin/empresas/:id           { nome, cnpj?, ativo }
//   DELETE /api/admin/empresas/:id
//   POST   /api/admin/sistemas               { nome }
//   PUT    /api/admin/sistemas/:id           { nome }
//   DELETE /api/admin/sistemas/:id
//   POST   /api/admin/empresas/:id/sistemas  { sistemaId, url, nomeNoSistema?, identificadorNoSistema?, mobile? }
//   PUT    /api/admin/ligacoes/:id           { url, nomeNoSistema?, identificadorNoSistema?, ativo, mobile? }
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
  function endereco(v) {
    const t = texto(v, 'o endereço', 300, true);
    if (!/^https?:\/\/\S+$/i.test(t)) throw new ErroHttp(400, 'O endereço precisa começar com http:// ou https://.');
    return t;
  }
  const semMobile = ({ mobile, ...resto }) => ({ ...resto, mobileDefinido: !!mobile });
  const ligacao = (b, editar) => {
    const v = {
      url: endereco(b.url),
      nomeNoSistema: texto(b.nomeNoSistema, 'o nome no sistema', 120),
      identificadorNoSistema: texto(b.identificadorNoSistema, 'o identificador', 120),
      ativo: b.ativo === undefined ? true : !!b.ativo,
    };
    const mobile = texto(b.mobile, 'o código mobile', 300);
    if (mobile || !editar) v.mobile = mobile || undefined;
    return v;
  };

  function registrar(app) {
    app.get('/api/admin/empresas', asyncHandler(async (req, res) => {
      await exigirAdmin(req);
      const [assocs, sists, ligs] = await Promise.all([chamar('GET', '/associacoes'), chamar('GET', '/sistemas'), chamar('GET', '/associacao-sistemas')]);
      const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
      res.set('Cache-Control', 'no-store');
      res.json({
        empresas: assocs.sort(porNome).map((a) => ({ id: a.id, nome: a.nome, cnpj: a.cnpj, ativo: a.ativo, sistemas: ligs.filter((l) => l.associacaoId === a.id).map(semMobile) })),
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
      const criado = semMobile(await chamar('POST', '/associacao-sistemas', { associacaoId: id(req.params.id), sistemaId: id(b.sistemaId), ...ligacao(b, false) }));
      await anotar(usuario, 'empresa.sistema.adicionar', `associação ${criado.associacaoId}`, null, criado);
      res.status(201).json(criado);
    }));

    app.put('/api/admin/ligacoes/:id', asyncHandler(async (req, res) => {
      const usuario = await exigirAdmin(req);
      const novo = semMobile(await chamar('PUT', `/associacao-sistemas/${id(req.params.id)}`, ligacao(req.body || {}, true)));
      await anotar(usuario, 'empresa.sistema.alterar', `associação ${novo.associacaoId}`, null, novo);
      res.json(novo);
    }));

    app.delete('/api/admin/ligacoes/:id', asyncHandler(async (req, res) => {
      const usuario = await exigirAdmin(req);
      const n = id(req.params.id);
      const antes = (await chamar('GET', '/associacao-sistemas')).find((l) => l.id === n);
      await chamar('DELETE', `/associacao-sistemas/${n}`);
      await anotar(usuario, 'empresa.sistema.remover', antes ? `associação ${antes.associacaoId}` : n, antes ? semMobile(antes) : null, null);
      res.status(204).end();
    }));
  }

  return { registrar };
}

module.exports = { criarRotasEmpresas };
