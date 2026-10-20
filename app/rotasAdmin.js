// Rotas da administração do Hub. O Hub não tem login próprio: quem chama manda o token do GLPI no cabeçalho
// `X-Glpi-Token`, o GLPI diz quem é a pessoa e só quem está em `hub_admins` passa. O token não é guardado nem logado.
//
//   GET    /api/config-publica            (sem login) política do cofre que todo navegador precisa ler
//   GET    /api/admin/eu                  quem sou e se sou admin (para mostrar ou esconder o painel)
//   GET    /api/admin/config              configurações e as opções para montar a tela
//   PUT    /api/admin/config/:secao       grava uma seção (cofre ou whatsapp)
//   GET    /api/admin/admins              lista de admins
//   POST   /api/admin/admins              acrescenta um admin
//   DELETE /api/admin/admins/:id          tira um admin (nunca o último)
//   PUT    /api/admin/automations/ordem   nova ordem das automações
// `soAdmin` protege também o cadastro de automações (criar, editar, remover, testar conexão) no server.js.
const crypto = require('crypto');
const { adminCorrespondente, configPadrao, validarSecao, validarNovoAdmin, validarOrdem, TIPOS_SOLICITACAO, SESSOES_COFRE, MODOS_WHATSAPP } = require('./admin');

const SECOES = ['cofre', 'whatsapp'];
const TTL_PADRAO_MS = 60000;

/**
 * @param {{repo: object, glpi: {identificarUsuario: Function}, asyncHandler: Function, ErroHttp: Function,
 *          aoMudarOrdem?: Function, agora?: () => number, ttlMs?: number}} deps
 */
function criarRotasAdmin(deps) {
  const { repo, glpi, asyncHandler, ErroHttp } = deps;
  const agora = deps.agora || Date.now;
  const ttlMs = deps.ttlMs === undefined ? TTL_PADRAO_MS : deps.ttlMs;
  const cache = new Map(); // sha256(token) -> { usuario, ate }: evita bater no GLPI a cada clique

  async function identificar(req) {
    const token = String(req.get('X-Glpi-Token') || '').trim();
    if (!token) throw new ErroHttp(401, 'Informe o token do GLPI para usar a administração.');
    const chave = crypto.createHash('sha256').update(token).digest('hex');
    const guardado = cache.get(chave);
    if (guardado && guardado.ate > agora()) return guardado.usuario;
    let usuario;
    try {
      usuario = await glpi.identificarUsuario(token);
    } catch (err) {
      // o token é uma credencial pessoal: se alguma mensagem de erro o repetir, sai escondido
      throw new ErroHttp(401, String((err && err.message) || 'Não consegui confirmar quem você é no GLPI.').split(token).join('[oculto]'));
    }
    cache.set(chave, { usuario, ate: agora() + ttlMs });
    if (cache.size > 200) for (const [k, v] of cache) if (v.ate <= agora()) cache.delete(k);
    return usuario;
  }

  /** Quem chama e a entrada de admin que casou (null = não é admin). Grava o id do GLPI na primeira vez. */
  async function quemE(req) {
    const usuario = await identificar(req);
    const admins = await repo.listarAdmins();
    const achado = adminCorrespondente(usuario, admins);
    if (achado && !achado.porId && usuario.id != null) {
      await repo.fixarAdmin(achado.admin.id, { glpiId: usuario.id, login: usuario.login, nome: usuario.nome });
    }
    return { usuario, admin: achado ? achado.admin : null };
  }

  async function exigirAdmin(req) {
    const r = await quemE(req);
    if (!r.admin) throw new ErroHttp(403, 'Só administradores do Hub podem fazer isso.');
    return r.usuario;
  }

  async function configAtual() {
    const padrao = configPadrao();
    const saida = {};
    for (const secao of SECOES) {
      const guardada = await repo.lerConfig(secao);
      // o que está guardado passa pela validação de novo: dado antigo ou estragado cai no padrão em vez de quebrar a tela
      const v = validarSecao(secao, guardada || padrao[secao]);
      saida[secao] = v.ok ? v.valor : padrao[secao];
    }
    return saida;
  }

  /** Middleware para rotas de fora deste arquivo: só admin passa. */
  const soAdmin = asyncHandler(async (req, res, next) => {
    await exigirAdmin(req);
    next();
  });

  function registrar(app) {
    app.get('/api/config-publica', asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json({ cofre: (await configAtual()).cofre });
    }));

    app.get('/api/admin/eu', asyncHandler(async (req, res) => {
      const { usuario, admin } = await quemE(req);
      res.set('Cache-Control', 'no-store');
      res.json({ usuario: { id: usuario.id, login: usuario.login, nome: usuario.nome }, admin: !!admin });
    }));

    app.get('/api/admin/config', asyncHandler(async (req, res) => {
      await exigirAdmin(req);
      res.set('Cache-Control', 'no-store');
      res.json({ config: await configAtual(), opcoes: { tipos: TIPOS_SOLICITACAO, sessoes: SESSOES_COFRE, modosWhatsapp: MODOS_WHATSAPP } });
    }));

    app.put('/api/admin/config/:secao', asyncHandler(async (req, res) => {
      const usuario = await exigirAdmin(req);
      const secao = req.params.secao;
      if (!SECOES.includes(secao)) throw new ErroHttp(404, 'seção de configuração desconhecida');
      const v = validarSecao(secao, req.body);
      if (!v.ok) throw new ErroHttp(400, v.error);
      await repo.gravarConfig(secao, v.valor, usuario.nome || usuario.login);
      res.json(v.valor);
    }));

    app.get('/api/admin/admins', asyncHandler(async (req, res) => {
      await exigirAdmin(req);
      res.set('Cache-Control', 'no-store');
      res.json(await repo.listarAdmins());
    }));

    app.post('/api/admin/admins', asyncHandler(async (req, res) => {
      const usuario = await exigirAdmin(req);
      const v = validarNovoAdmin(req.body);
      if (!v.ok) throw new ErroHttp(400, v.error);
      const criado = await repo.criarAdmin(v.valor, usuario.nome || usuario.login);
      if (!criado) throw new ErroHttp(409, 'Essa pessoa já é administradora.');
      res.status(201).json(criado);
    }));

    app.delete('/api/admin/admins/:id', asyncHandler(async (req, res) => {
      await exigirAdmin(req);
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) throw new ErroHttp(400, 'id inválido');
      if ((await repo.contarAdmins()) <= 1) throw new ErroHttp(409, 'Não dá para remover o último administrador.');
      if (!(await repo.removerAdmin(id))) throw new ErroHttp(404, 'não encontrado');
      res.status(204).end();
    }));

    app.put('/api/admin/automations/ordem', asyncHandler(async (req, res) => {
      await exigirAdmin(req);
      const v = validarOrdem(req.body);
      if (!v.ok) throw new ErroHttp(400, v.error);
      await repo.gravarOrdem(v.valor);
      if (deps.aoMudarOrdem) await deps.aoMudarOrdem();
      res.json({ ids: v.valor });
    }));
  }

  return { registrar, configAtual, quemE, identificar, exigirAdmin, soAdmin };
}

module.exports = { criarRotasAdmin };
