// Rotas da Administração > IA com admin, repositório e serviços (controle, IA, chamados-glpi) falsos.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { criarRotasIa } = require('../rotasIa');
const { asyncHandler, ErroHttp, erroFinal } = require('../http');

async function subir({ ehAdmin = true, respostas = {} } = {}) {
  const pedidos = [];
  const anotados = [];
  const gravados = [];
  const usuario = { id: 7, nome: 'Fulano' };
  const admin = {
    soAdmin: (req, res, next) => (ehAdmin ? next() : next(new ErroHttp(403, 'Só administradores do Hub podem fazer isso.'))),
    exigirAdmin: async () => usuario,
    configAtual: async () => ({ ia: { ligada: false, automaticoTipos: [] } }),
    anotar: async (...a) => anotados.push(a),
  };
  const repo = { gravarConfig: async (s, v) => gravados.push([s, v]), lerConfig: async () => null };
  const buscar = async (url, op) => {
    pedidos.push({ url, metodo: op.method, cab: op.headers, corpo: op.body && JSON.parse(op.body) });
    const chave = Object.keys(respostas).find((k) => url.endsWith(k));
    const [status, corpo] = chave ? respostas[chave] : [200, {}];
    return { ok: status < 400, status, json: async () => corpo };
  };
  const env = { IA_TOKEN: 'tok-ia', IA_CONTROLE_TOKEN: 'tok-ctl', IA_URL: 'http://ia', IA_CONTROLE_URL: 'http://ctl', CHAMADOS_GLPI_URL: 'http://cham' };
  const app = express();
  app.use(express.json());
  criarRotasIa({ admin, repo, asyncHandler, ErroHttp, env, buscar }).registrar(app);
  app.use(erroFinal(() => {}));
  const srv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const chamar = (m, p, cab = {}) => fetch(base + p, { method: m, headers: cab }).then(async (r) => ({ status: r.status, corpo: await r.json() }));
  return { chamar, pedidos, anotados, gravados, fechar: () => new Promise((ok) => srv.close(ok)) };
}

test('ligar: chama o controle com o token dele, grava ia.ligada e anota no histórico', async () => {
  const s = await subir({ respostas: { '/api/ligar': [200, { ligada: true }] } });
  try {
    const r = await s.chamar('POST', '/api/admin/ia/ligar');
    assert.equal(r.status, 200);
    assert.equal(s.pedidos[0].url, 'http://ctl/api/ligar');
    assert.equal(s.pedidos[0].cab['X-IA-Controle-Token'], 'tok-ctl');
    assert.deepEqual(s.gravados[0], ['ia', { ligada: true, automaticoTipos: [] }]);
    assert.equal(s.anotados[0][1], 'ia.ligar');
  } finally { await s.fechar(); }
});

test('controle fora do ar: 424 com o motivo e nada gravado', async () => {
  const s = await subir({ respostas: { '/api/desligar': [502, { error: 'Docker não respondeu.' }] } });
  try {
    const r = await s.chamar('POST', '/api/admin/ia/desligar');
    assert.equal(r.status, 424);
    assert.match(r.corpo.error, /Docker/);
    assert.equal(s.gravados.length, 0);
  } finally { await s.fechar(); }
});

test('exportar: repassa o token do admin só no corpo do pedido ao chamados-glpi', async () => {
  const s = await subir({ respostas: { '/api/ia/exportar': [200, { iniciada: true }] } });
  try {
    const r = await s.chamar('POST', '/api/admin/ia/exportar', { 'X-Glpi-Token': 'token-do-admin' });
    assert.equal(r.status, 200);
    assert.equal(s.pedidos[0].url, 'http://cham/api/ia/exportar');
    assert.deepEqual(s.pedidos[0].corpo, { glpi: { userToken: 'token-do-admin' } });
  } finally { await s.fechar(); }
});

test('quem não é admin não usa nenhuma rota da IA', async () => {
  const s = await subir({ ehAdmin: false });
  try {
    for (const [m, p] of [['GET', '/api/admin/ia/estado'], ['POST', '/api/admin/ia/ligar'], ['POST', '/api/admin/ia/exportar'], ['GET', '/api/admin/ia/auditoria']]) {
      assert.equal((await s.chamar(m, p)).status, 403, p);
    }
    assert.equal(s.pedidos.length, 0);
  } finally { await s.fechar(); }
});

test('auditoria pública: só agregados (nenhum chamado ou texto) e cópia guardada para quando a IA estiver desligada', async () => {
  const auditoria = {
    estado: { treinado: true, exemplos: 10, modelos: { texto: 'q', embed: 'b' }, treino: { etapa: 'pronto', rodando: false } },
    metricas: { total: 10, acertoIa: 90, acertoRegras: 80, porTipo: {}, distribuicao: {} },
    modelos: [{ nome: 'bge-m3', tamanhoMb: 1200, modificadoEm: 'x' }],
    eventos: [{ quando: 't', tipo: 'treino.fim', exemplos: 10, detalheGrande: { x: 1 } }],
    decisoes: [{ chamado: '123', tipoRegra: 'a', tipoIa: 'a', concorda: true, origem: 'classificador' }, { chamado: '456', concorda: false, origem: 'modelo de texto' }],
  };
  const s = await subir({ respostas: { '/api/auditoria': [200, auditoria] } });
  try {
    const r = await s.chamar('GET', '/api/ia/auditoria-publica');
    assert.equal(r.status, 200);
    assert.equal(r.corpo.aoVivo, true);
    assert.deepEqual(r.corpo.decisoes, { total: 2, concorda: 1, discorda: 1, porOrigem: { classificador: 1, 'modelo de texto': 1 } });
    assert.ok(!JSON.stringify(r.corpo).includes('"123"'), 'não pode sair o número do chamado');
    assert.deepEqual(r.corpo.eventos[0], { quando: 't', tipo: 'treino.fim', exemplos: 10 });
    assert.equal(s.gravados[0][0], 'ia_auditoria');
  } finally { await s.fechar(); }
});
