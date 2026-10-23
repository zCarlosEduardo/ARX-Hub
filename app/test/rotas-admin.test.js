// Rotas da administração do Hub, com Express de verdade, um repositório em memória e um GLPI de mentira (sem rede, sem banco).
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { criarRotasAdmin } = require('../rotasAdmin');
const { asyncHandler, ErroHttp, erroFinal } = require('../http');

const TOKEN_ADMIN = 'token-do-carlos-0123456789';
const TOKEN_COMUM = 'token-da-maria-9876543210';
const USUARIOS = {
  [TOKEN_ADMIN]: { id: 7, login: 'carlos.alonso', nome: 'Carlos Eduardo de Souza Alonso', nomes: ['CARLOS EDUARDO DE SOUZA ALONSO', 'CARLOS.ALONSO'] },
  [TOKEN_COMUM]: { id: 8, login: 'maria.silva', nome: 'Maria Silva', nomes: ['MARIA SILVA', 'MARIA.SILVA'] },
};

function repoMemoria(adminsIniciais) {
  const estado = { admins: adminsIniciais.map((a, i) => ({ id: i + 1, glpiId: null, login: '', nome: '', criadoEm: 'x', criadoPor: 'instalação', ...a })), config: new Map(), ordem: null, fixados: [] };
  let proximo = estado.admins.length + 1;
  return {
    estado,
    async listarAdmins() { return estado.admins.map((a) => ({ ...a })); },
    async fixarAdmin(id, d) { estado.fixados.push([id, d.glpiId]); const a = estado.admins.find((x) => x.id === id); if (a && a.glpiId == null) a.glpiId = d.glpiId; },
    async criarAdmin(v, por) {
      if (v.glpiId != null && estado.admins.some((a) => a.glpiId === v.glpiId)) return null;
      const novo = { id: proximo++, glpiId: v.glpiId, login: v.login, nome: v.nome, criadoEm: 'x', criadoPor: por };
      estado.admins.push(novo);
      return novo;
    },
    async contarAdmins() { return estado.admins.length; },
    async removerAdmin(id) { const n = estado.admins.length; estado.admins = estado.admins.filter((a) => a.id !== id); return estado.admins.length < n; },
    async lerConfig(chave) { return estado.config.has(chave) ? estado.config.get(chave) : null; },
    async gravarConfig(chave, valor, por) { estado.config.set(chave, valor); estado.ultimoPor = por; },
    async gravarOrdem(ids) { estado.ordem = ids; },
    async registrarHistorico(h) { (estado.historico = estado.historico || []).push({ id: (estado.historico || []).length + 1, ...h }); },
    async listarHistorico({ limite }) { return (estado.historico || []).slice().reverse().slice(0, limite); },
  };
}

async function subir(adminsIniciais = [{ nome: 'Carlos Eduardo de Souza Alonso' }], extra = {}) {
  const repo = repoMemoria(adminsIniciais);
  const chamadasGlpi = [];
  const glpi = {
    async identificarUsuario(token) {
      chamadasGlpi.push(token);
      if (USUARIOS[token]) return USUARIOS[token];
      throw new Error(`GLPI recusou o token ${token}`); // ecoa o token de propósito: a rota precisa esconder
    },
  };
  let ordemMudou = 0;
  const rotas = criarRotasAdmin({ repo, glpi, asyncHandler, ErroHttp, aoMudarOrdem: async () => { ordemMudou += 1; }, ...extra });
  const app = express();
  app.use(express.json());
  rotas.registrar(app);
  app.use(erroFinal(() => {}));
  const servidor = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const chamar = async (metodo, caminho, { token, corpo } = {}) => {
    const r = await fetch(base + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Glpi-Token': token } : {}) }, body: corpo === undefined || metodo === 'GET' || metodo === 'DELETE' ? undefined : JSON.stringify(corpo) });
    const texto = await r.text();
    return { status: r.status, corpo: texto ? JSON.parse(texto) : null, texto };
  };
  return { repo, base, chamar, chamadasGlpi, ordemMudou: () => ordemMudou, fechar: () => new Promise((ok) => servidor.close(ok)) };
}

test('config-publica não exige login e devolve o padrão (cofre ativo, sessão do dia)', async () => {
  const s = await subir();
  try {
    const r = await s.chamar('GET', '/api/config-publica');
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo, {
      cofre: { modo: 'ativo', sessao: 'dia', horas: 8 },
      automacoes: { cadastro: 'admins', endereco: 'mascarado', novaAba: true, marca: '' },
      ia: { ligada: false, automaticoTipos: [], confiancaMinima: 0.8, textoPelaIa: false, repetirErros: false, maxTentativas: 2, reabertos: false, pedirPendencias: false, whatsappModo: 'reagir' },
      extensoes: { mostrar: true, ocultas: [] },
    });
  } finally { await s.fechar(); }
});

test('extensões: lista as liberadas, baixa o .zip e respeita o que a administração esconde', async () => {
  const s = await subir();
  try {
    const lista = await s.chamar('GET', '/api/extensoes');
    assert.equal(lista.status, 200);
    assert.ok(lista.corpo.find((e) => e.id === 'arx-sga'));
    const zip = await fetch(s.base + '/api/extensoes/arx-sga.zip');
    assert.equal(zip.status, 200);
    assert.match(zip.headers.get('content-type'), /application\/zip/);
    assert.match(zip.headers.get('content-disposition'), /arx-sga-[\d.]+\.zip/);
    assert.equal((await fetch(s.base + '/api/extensoes/nao-existe.zip')).status, 404);
    assert.equal((await fetch(s.base + '/api/extensoes/..%2Fadmin.zip')).status, 404);
    // escondida pela administração: some da lista e do download; com o botão desligado, a lista vem vazia
    s.repo.estado.config.set('extensoes', { mostrar: true, ocultas: ['arx-sga'] });
    assert.equal((await s.chamar('GET', '/api/extensoes')).corpo.find((e) => e.id === 'arx-sga'), undefined);
    assert.equal((await fetch(s.base + '/api/extensoes/arx-sga.zip')).status, 404);
    s.repo.estado.config.set('extensoes', { mostrar: false, ocultas: [] });
    assert.deepEqual((await s.chamar('GET', '/api/extensoes')).corpo, []);
    // a administração enxerga o catálogo inteiro para escolher
    const admin = await s.chamar('GET', '/api/admin/config', { token: TOKEN_ADMIN });
    assert.ok(admin.corpo.opcoes.extensoes.find((e) => e.id === 'arx-sga'));
  } finally { await s.fechar(); }
});

test('config guardada estragada cai no padrão em vez de quebrar a tela', async () => {
  const s = await subir();
  try {
    s.repo.estado.config.set('cofre', { modo: 'quebrado', sessao: 42 });
    assert.deepEqual((await s.chamar('GET', '/api/config-publica')).corpo.cofre, { modo: 'ativo', sessao: 'dia', horas: 8 });
  } finally { await s.fechar(); }
});

test('eu: sem token 401; token inválido 401 sem repetir o token; admin e não admin', async () => {
  const s = await subir();
  try {
    assert.equal((await s.chamar('GET', '/api/admin/eu')).status, 401);
    const ruim = await s.chamar('GET', '/api/admin/eu', { token: 'token-invalido-qualquer' });
    assert.equal(ruim.status, 401);
    assert.ok(!ruim.texto.includes('token-invalido-qualquer'), 'o token não pode voltar na resposta');
    const comum = await s.chamar('GET', '/api/admin/eu', { token: TOKEN_COMUM });
    assert.deepEqual(comum.corpo, { usuario: { id: 8, login: 'maria.silva', nome: 'Maria Silva' }, admin: false });
    const admin = await s.chamar('GET', '/api/admin/eu', { token: TOKEN_ADMIN });
    assert.equal(admin.corpo.admin, true);
    assert.equal(admin.corpo.usuario.nome, 'Carlos Eduardo de Souza Alonso');
  } finally { await s.fechar(); }
});

test('o admin da instalação (só pelo nome) fica preso ao id do GLPI na primeira vez; depois só o id vale', async () => {
  const s = await subir();
  try {
    await s.chamar('GET', '/api/admin/eu', { token: TOKEN_ADMIN });
    assert.deepEqual(s.repo.estado.fixados, [[1, 7]]);
    assert.equal(s.repo.estado.admins[0].glpiId, 7);
    // um homônimo com id diferente não passa mais
    USUARIOS['token-homonimo-00000000'] = { id: 99, login: 'outro', nome: 'Carlos Eduardo de Souza Alonso', nomes: ['CARLOS EDUARDO DE SOUZA ALONSO'] };
    const h = await s.chamar('GET', '/api/admin/eu', { token: 'token-homonimo-00000000' });
    assert.equal(h.corpo.admin, false);
    delete USUARIOS['token-homonimo-00000000'];
  } finally { await s.fechar(); }
});

test('rotas de admin: 401 sem token, 403 para quem não é admin, 200 para admin', async () => {
  const s = await subir();
  try {
    for (const [metodo, caminho] of [['GET', '/api/admin/config'], ['GET', '/api/admin/admins'], ['PUT', '/api/admin/config/cofre'], ['POST', '/api/admin/admins'], ['DELETE', '/api/admin/admins/1'], ['PUT', '/api/admin/automations/ordem']]) {
      assert.equal((await s.chamar(metodo, caminho, { corpo: {} })).status, 401, `${metodo} ${caminho} sem token`);
      assert.equal((await s.chamar(metodo, caminho, { token: TOKEN_COMUM, corpo: {} })).status, 403, `${metodo} ${caminho} não admin`);
    }
    const ok = await s.chamar('GET', '/api/admin/config', { token: TOKEN_ADMIN });
    assert.equal(ok.status, 200);
    assert.ok(ok.corpo.opcoes.tipos.length >= 10);
    assert.deepEqual(ok.corpo.config.whatsapp.ativo, false);
  } finally { await s.fechar(); }
});

test('gravar configuração: valida, guarda quem alterou e a rota pública passa a refletir', async () => {
  const s = await subir();
  try {
    const ruim = await s.chamar('PUT', '/api/admin/config/cofre', { token: TOKEN_ADMIN, corpo: { modo: 'talvez' } });
    assert.equal(ruim.status, 400);
    assert.match(ruim.corpo.error, /cofre\.modo/);
    assert.equal((await s.chamar('PUT', '/api/admin/config/outra', { token: TOKEN_ADMIN, corpo: {} })).status, 404);
    const ok = await s.chamar('PUT', '/api/admin/config/cofre', { token: TOKEN_ADMIN, corpo: { modo: 'ativo', sessao: 'horas', horas: 10 } });
    assert.equal(ok.status, 200);
    assert.equal(s.repo.estado.ultimoPor, 'Carlos Eduardo de Souza Alonso');
    assert.deepEqual((await s.chamar('GET', '/api/config-publica')).corpo.cofre, { modo: 'ativo', sessao: 'horas', horas: 10 });
    const w = await s.chamar('PUT', '/api/admin/config/whatsapp', { token: TOKEN_ADMIN, corpo: { ativo: false, modo: 'observacao', numeros: [{ id: 'principal', rotulo: 'Chip', telefone: '' }], grupos: [{ id: 'g1', nome: 'Cadastros', numeroId: 'principal', tipos: ['cadastro_consultor'] }] } });
    assert.equal(w.status, 200);
    assert.equal((await s.chamar('GET', '/api/admin/config', { token: TOKEN_ADMIN })).corpo.config.whatsapp.grupos[0].nome, 'Cadastros');
  } finally { await s.fechar(); }
});

test('admins: lista, acrescenta, recusa repetido, não remove o último e remove quando há outro', async () => {
  const s = await subir();
  try {
    assert.equal((await s.chamar('GET', '/api/admin/admins', { token: TOKEN_ADMIN })).corpo.length, 1);
    assert.equal((await s.chamar('POST', '/api/admin/admins', { token: TOKEN_ADMIN, corpo: {} })).status, 400);
    const novo = await s.chamar('POST', '/api/admin/admins', { token: TOKEN_ADMIN, corpo: { glpiId: 8, nome: 'Maria Silva' } });
    assert.equal(novo.status, 201);
    assert.equal(novo.corpo.criadoPor, 'Carlos Eduardo de Souza Alonso');
    assert.equal((await s.chamar('POST', '/api/admin/admins', { token: TOKEN_ADMIN, corpo: { glpiId: 8 } })).status, 409);
    // a Maria agora é admin
    assert.equal((await s.chamar('GET', '/api/admin/eu', { token: TOKEN_COMUM })).corpo.admin, true);
    assert.equal((await s.chamar('DELETE', '/api/admin/admins/abc', { token: TOKEN_ADMIN })).status, 400);
    assert.equal((await s.chamar('DELETE', '/api/admin/admins/999', { token: TOKEN_ADMIN })).status, 404);
    assert.equal((await s.chamar('DELETE', `/api/admin/admins/${novo.corpo.id}`, { token: TOKEN_ADMIN })).status, 204);
    const ultimo = await s.chamar('DELETE', '/api/admin/admins/1', { token: TOKEN_ADMIN });
    assert.equal(ultimo.status, 409);
    assert.match(ultimo.corpo.error, /último/);
  } finally { await s.fechar(); }
});

test('ordem das automações: valida, grava e avisa quem precisa atualizar a lista', async () => {
  const s = await subir();
  try {
    assert.equal((await s.chamar('PUT', '/api/admin/automations/ordem', { token: TOKEN_ADMIN, corpo: { ids: [1, 1] } })).status, 400);
    const ok = await s.chamar('PUT', '/api/admin/automations/ordem', { token: TOKEN_ADMIN, corpo: { ids: ['3', 1, 2] } });
    assert.equal(ok.status, 200);
    assert.deepEqual(s.repo.estado.ordem, [3, 1, 2]);
    assert.equal(s.ordemMudou(), 1);
  } finally { await s.fechar(); }
});

test('a identidade fica em cache por um tempo (não bate no GLPI a cada clique) e depois consulta de novo', async () => {
  let agora = 1000;
  const s = await subir([{ nome: 'Carlos Eduardo de Souza Alonso' }], { agora: () => agora, ttlMs: 60000 });
  try {
    await s.chamar('GET', '/api/admin/config', { token: TOKEN_ADMIN });
    await s.chamar('GET', '/api/admin/admins', { token: TOKEN_ADMIN });
    assert.equal(s.chamadasGlpi.length, 1);
    agora += 61000;
    await s.chamar('GET', '/api/admin/admins', { token: TOKEN_ADMIN });
    assert.equal(s.chamadasGlpi.length, 2);
  } finally { await s.fechar(); }
});

async function subirCadastroAutomacoes() {
  const repo = repoMemoria([{ nome: 'Carlos Eduardo de Souza Alonso' }]);
  const glpi = { async identificarUsuario(token) { if (USUARIOS[token]) return USUARIOS[token]; throw new Error('token inválido'); } };
  const rotas = criarRotasAdmin({ repo, glpi, asyncHandler, ErroHttp });
  const app = express();
  app.use(express.json());
  rotas.registrar(app);
  // como o server.js: remove e anota no histórico com quem chamou
  app.delete('/api/automations/:id', rotas.podeGerenciarAutomacoes, async (req, res) => {
    await rotas.anotar(req.quemHub, 'automacao.remover', 'Automação de teste', { name: 'Automação de teste' }, null);
    res.status(204).end();
  });
  app.use(erroFinal(() => {}));
  const servidor = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const apagar = (token) => fetch(`${base}/api/automations/1`, { method: 'DELETE', headers: token ? { 'X-Glpi-Token': token } : {} }).then((r) => r.status);
  const configurar = (token, corpo) => fetch(`${base}/api/admin/config/automacoes`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Glpi-Token': token }, body: JSON.stringify(corpo) }).then((r) => r.status);
  const historico = (token) => fetch(`${base}/api/admin/historico`, { headers: token ? { 'X-Glpi-Token': token } : {} }).then(async (r) => ({ status: r.status, corpo: await r.json() }));
  return { repo, apagar, configurar, historico, fechar: () => new Promise((ok) => servidor.close(ok)) };
}

test('histórico: grava quem mudou a configuração (antes e depois) e quem removeu; só admin lê', async () => {
  const s = await subirCadastroAutomacoes();
  try {
    assert.equal(await s.configurar(TOKEN_ADMIN, { cadastro: 'todos' }), 200);
    assert.equal(await s.apagar(), 204); // liberado para todos e sem token: entra como "Sem identificação"
    assert.equal(await s.apagar(TOKEN_ADMIN), 204);
    assert.equal((await s.historico(TOKEN_COMUM)).status, 403);
    const { status, corpo } = await s.historico(TOKEN_ADMIN);
    assert.equal(status, 200);
    assert.deepEqual(corpo.map((h) => [h.acao, h.quem]), [
      ['automacao.remover', 'Carlos Eduardo de Souza Alonso'],
      ['automacao.remover', 'Sem identificação'],
      ['config.alterar', 'Carlos Eduardo de Souza Alonso'],
    ]);
    const config = corpo[2];
    assert.equal(config.alvo, 'automacoes');
    assert.equal(config.antes.cadastro, 'admins');
    assert.equal(config.depois.cadastro, 'todos');
    assert.equal(config.quemGlpiId, 7);
  } finally { await s.fechar(); }
});

test('histórico: falha ao gravar não bloqueia a mudança', async () => {
  const s = await subirCadastroAutomacoes();
  const erroOriginal = console.error;
  console.error = () => {}; // o erro esperado vai para o log; aqui não precisa aparecer
  s.repo.registrarHistorico = async () => { throw new Error('banco fora'); };
  try {
    assert.equal(await s.configurar(TOKEN_ADMIN, { cadastro: 'todos' }), 200);
  } finally { console.error = erroOriginal; await s.fechar(); }
});

test('cadastro de automação: por padrão só admin (sem token 401, comum 403)', async () => {
  const s = await subirCadastroAutomacoes();
  try {
    assert.equal(await s.apagar(), 401);
    assert.equal(await s.apagar(TOKEN_COMUM), 403);
    assert.equal(await s.apagar(TOKEN_ADMIN), 204);
  } finally { await s.fechar(); }
});

test('cadastro de automação: o admin libera para todos e só admin muda essa regra', async () => {
  const s = await subirCadastroAutomacoes();
  try {
    assert.equal(await s.configurar(TOKEN_COMUM, { cadastro: 'todos' }), 403);
    assert.equal(await s.configurar(TOKEN_ADMIN, { cadastro: 'todos', endereco: 'oculto', novaAba: false }), 200);
    assert.equal(await s.apagar(), 204);
    assert.equal(await s.apagar(TOKEN_COMUM), 204);
    assert.equal(await s.configurar(TOKEN_ADMIN, { cadastro: 'admins' }), 200);
    assert.equal(await s.apagar(TOKEN_COMUM), 403);
  } finally { await s.fechar(); }
});
