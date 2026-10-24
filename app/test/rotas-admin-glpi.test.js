// Administração > GLPI (produção ou teste): o App-Token nunca volta para a tela nem para o histórico, vazio mantém o
// guardado, o chamados-glpi lê a conexão só com o segredo interno e a troca avisa o servidor. Dados fictícios.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { criarRotasAdmin } = require('../rotasAdmin');
const { asyncHandler, ErroHttp, erroFinal } = require('../http');

const TOKEN_ADMIN = 'token-do-carlos-0123456789';
const USUARIO = { id: 7, login: 'carlos.alonso', nome: 'Carlos Eduardo de Souza Alonso', nomes: ['CARLOS EDUARDO DE SOUZA ALONSO'] };

async function subir() {
  const config = new Map();
  const historico = [];
  const repo = {
    async listarAdmins() { return [{ id: 1, glpiId: 7, login: 'carlos.alonso', nome: 'Carlos Eduardo de Souza Alonso' }]; },
    async fixarAdmin() {},
    async lerConfig(c) { return config.has(c) ? config.get(c) : null; },
    async gravarConfig(c, v) { config.set(c, v); },
    async registrarHistorico(h) { historico.push(h); },
  };
  const mudancas = [];
  const testes = [];
  const glpi = {
    async identificarUsuario(t) { if (t === TOKEN_ADMIN) return USUARIO; throw new Error('recusado'); },
    async testarConexao(conexao, t) { testes.push({ conexao, t }); if (conexao.appToken === 'app-ruim') throw new Error(`App-Token recusado ${t}`); return USUARIO; },
  };
  const rotas = criarRotasAdmin({ repo, glpi, asyncHandler, ErroHttp, tokenInterno: 'segredo-interno', aoMudarConfig: async (s, v) => mudancas.push([s, v]) });
  const app = express();
  app.use(express.json());
  rotas.registrar(app);
  app.use(erroFinal(() => {}));
  const srv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const chamar = async (metodo, caminho, { corpo, headers = { 'X-Glpi-Token': TOKEN_ADMIN } } = {}) => {
    const r = await fetch(base + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    return { status: r.status, corpo: await r.json().catch(() => null) };
  };
  return { chamar, config, historico, mudancas, testes, fechar: () => srv.close() };
}

const TESTE = { url: 'http://glpi-teste/api.php/v1', site: 'http://localhost:8090', entidadeId: 3, entidades: 'Sistemas' };

test('GLPI: salva o teste sem devolver o App-Token, vazio mantém o guardado e a troca avisa o servidor', async () => {
  const s = await subir();
  try {
    assert.equal((await s.chamar('PUT', '/api/admin/config/glpi', { corpo: { ambiente: 'teste', teste: { ...TESTE, appToken: '' } } })).status, 400, 'teste sem App-Token não pode ficar ativo');
    const r = await s.chamar('PUT', '/api/admin/config/glpi', { corpo: { ambiente: 'teste', teste: { ...TESTE, appToken: 'app-teste-secreto' } } });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo.teste.appToken, '');
    assert.equal(r.corpo.teste.appTokenDefinido, true);
    assert.equal(s.config.get('glpi').teste.appToken, 'app-teste-secreto', 'guardado de verdade');
    assert.equal(s.mudancas.at(-1)[1].ambiente, 'teste');
    assert.ok(!JSON.stringify(s.historico).includes('app-teste-secreto'), 'o histórico não guarda o App-Token');
    const cfg = await s.chamar('GET', '/api/admin/config');
    assert.ok(!JSON.stringify(cfg.corpo).includes('app-teste-secreto'), 'a tela não recebe o App-Token');
    // salvar de novo com o campo vazio mantém o guardado
    await s.chamar('PUT', '/api/admin/config/glpi', { corpo: { ambiente: 'teste', teste: { ...TESTE, entidades: 'Sistemas, Cobrança', appToken: '' } } });
    assert.equal(s.config.get('glpi').teste.appToken, 'app-teste-secreto');
    assert.equal(s.config.get('glpi').teste.entidades, 'Sistemas, Cobrança');
    const pub = await s.chamar('GET', '/api/config-publica', { headers: {} });
    assert.deepEqual(pub.corpo.glpi, { ambiente: 'teste', site: 'http://localhost:8090' });
  } finally {
    s.fechar();
  }
});

test('GLPI: rota interna só com o segredo, devolve a conexão em uso; testar conexão usa o token de quem pede', async () => {
  const s = await subir();
  try {
    await s.chamar('PUT', '/api/admin/config/glpi', { corpo: { ambiente: 'teste', teste: { ...TESTE, appToken: 'app-teste-secreto' } } });
    assert.equal((await s.chamar('GET', '/api/interno/glpi', { headers: {} })).status, 401);
    assert.equal((await s.chamar('GET', '/api/interno/glpi', { headers: { 'X-Servico-Token': 'errado' } })).status, 401);
    const r = await s.chamar('GET', '/api/interno/glpi', { headers: { 'X-Servico-Token': 'segredo-interno' } });
    assert.deepEqual(r.corpo, { ambiente: 'teste', ...TESTE, appToken: 'app-teste-secreto' });
    const ok = await s.chamar('POST', '/api/admin/glpi/testar', { corpo: { ambiente: 'teste' } });
    assert.deepEqual(ok.corpo, { ok: true, usuario: 'Carlos Eduardo de Souza Alonso' });
    assert.equal(s.testes[0].t, TOKEN_ADMIN);
    await s.chamar('PUT', '/api/admin/config/glpi', { corpo: { ambiente: 'teste', teste: { ...TESTE, appToken: 'app-ruim' } } });
    const ruim = await s.chamar('POST', '/api/admin/glpi/testar', { corpo: { ambiente: 'teste' } });
    assert.equal(ruim.corpo.ok, false);
    assert.ok(!ruim.corpo.erro.includes(TOKEN_ADMIN), 'o token de quem pede não volta no erro');
    assert.equal((await s.chamar('POST', '/api/admin/glpi/testar', { corpo: { ambiente: 'teste' }, headers: { 'X-Glpi-Token': 'outro' } })).status, 401);
  } finally {
    s.fechar();
  }
});

test('glpi.configurar troca a conexão na hora: link do chamado pelo site (ou pela raiz da API)', () => {
  const glpi = require('../glpi');
  try {
    glpi.configurar({ url: 'http://glpi-teste/api.php/v1', site: 'http://localhost:8090', appToken: 'x' });
    assert.equal(glpi.ticketUrl(5), 'http://localhost:8090/front/ticket.form.php?id=5');
    glpi.configurar({ url: 'https://suporte.exemplo.com/api.php/v1/', appToken: 'x' });
    assert.equal(glpi.ticketUrl(6), 'https://suporte.exemplo.com/front/ticket.form.php?id=6');
  } finally {
    glpi.configurar({ url: process.env.GLPI_BASE_URL, appToken: process.env.GLPI_APP_TOKEN });
  }
});

test('IA: onde a IA escreve a resposta (solução, devolutiva) e em quais tipos', () => {
  const { validarSecao } = require('../admin');
  const ok = validarSecao('ia', { textoPelaIa: true, textoSituacoes: ['devolutiva', 'devolutiva'], textoTipos: ['foto_perfil'] });
  assert.equal(ok.ok, true);
  assert.deepEqual([ok.valor.textoSituacoes, ok.valor.textoTipos], [['devolutiva'], ['foto_perfil']]);
  assert.deepEqual(validarSecao('ia', {}).valor.textoSituacoes, ['solucao', 'devolutiva'], 'padrão: as duas, como antes');
  assert.equal(validarSecao('ia', { textoSituacoes: ['outra'] }).ok, false);
  assert.equal(validarSecao('ia', { textoTipos: ['inventado'] }).ok, false);
});
