// Administração > Empresas e sistemas: só admin, repassa ao banco central com o token de serviço, valida a entrada, o
// código mobile do SGA nunca volta para a tela nem para o histórico e o erro do banco (409) chega com a mensagem. Dados fictícios.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { criarRotasEmpresas } = require('../rotasEmpresas');
const { asyncHandler, ErroHttp, erroFinal } = require('../http');

const ADMIN = 'token-admin-0123456789';

/** Banco central falso: as mesmas rotas usadas pelo Hub, em memória. */
function bancoFalso() {
  const t = { associacoes: [{ id: 1, nome: 'EMPRESA TESTE', cnpj: null, ativo: true }], sistemas: [{ id: 1, nome: 'SGA' }, { id: 2, nome: 'PowerCRM' }], ligs: [] };
  const pedidos = [];
  let seq = 10;
  const resp = (status, corpo) => ({ ok: status < 400, status, json: async () => corpo });
  async function buscar(url, { method, headers, body }) {
    const corpo = body ? JSON.parse(body) : undefined;
    pedidos.push({ url, method, headers, corpo });
    const [, recurso, idTxt] = new URL(url).pathname.match(/^\/api\/([a-z-]+)\/?(\d+)?$/);
    const lista = { associacoes: t.associacoes, sistemas: t.sistemas, 'associacao-sistemas': t.ligs }[recurso];
    const id = Number(idTxt);
    if (method === 'GET') return resp(200, lista);
    if (method === 'POST') {
      if (recurso !== 'associacao-sistemas' && lista.some((x) => x.nome === corpo.nome)) return resp(409, { error: 'Já existe um sistema com esse nome.' });
      const novo = { id: (seq += 1), ativo: true, ...corpo };
      lista.push(novo);
      return resp(201, novo);
    }
    const i = lista.findIndex((x) => x.id === id);
    if (i < 0) return resp(404, { error: 'não encontrado' });
    if (method === 'PUT') {
      for (const [k, v] of Object.entries(corpo)) if (v !== undefined) lista[i][k] = v;
      return resp(200, lista[i]);
    }
    if (recurso === 'sistemas' && t.ligs.some((l) => l.sistemaId === id)) return resp(409, { error: 'O sistema ainda tem associações ligadas a ele.' });
    lista.splice(i, 1);
    return resp(204, null);
  }
  return { t, pedidos, buscar };
}

async function subir() {
  const banco = bancoFalso();
  const historico = [];
  const exigirAdmin = async (req) => {
    if (req.get('X-Glpi-Token') !== ADMIN) throw new ErroHttp(403, 'Só administradores do Hub podem fazer isso.');
    return { id: 7, nome: 'Admin Teste' };
  };
  const app = express();
  app.use(express.json());
  criarRotasEmpresas({ exigirAdmin, anotar: async (u, acao, alvo, antes, depois) => historico.push({ acao, alvo, antes, depois }), asyncHandler, ErroHttp, banco: { url: 'http://banco:4000/', token: 'token-banco', fetch: banco.buscar } }).registrar(app);
  app.use(erroFinal(() => {}));
  const srv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const chamar = async (metodo, caminho, corpo, token = ADMIN) => {
    const r = await fetch(base + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', 'X-Glpi-Token': token }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    return { status: r.status, corpo: await r.json().catch(() => null) };
  };
  return { chamar, banco, historico, fechar: () => srv.close() };
}

test('empresas: só admin; cria, edita, liga sistema sem devolver o mobile e remove', async () => {
  const s = await subir();
  try {
    assert.equal((await s.chamar('GET', '/api/admin/empresas', undefined, 'outro')).status, 403);
    assert.equal(s.banco.pedidos.length, 0, 'quem não é admin nem chega ao banco');

    assert.equal((await s.chamar('POST', '/api/admin/empresas', { nome: '   ' })).status, 400);
    const criada = await s.chamar('POST', '/api/admin/empresas', { nome: '  Nova Proteção ', cnpj: '' });
    assert.equal(criada.status, 201);
    assert.deepEqual([criada.corpo.nome, criada.corpo.cnpj], ['Nova Proteção', null]);
    assert.equal(s.banco.pedidos.at(-1).headers.Authorization, 'Bearer token-banco');
    assert.equal(s.banco.pedidos.at(-1).url, 'http://banco:4000/api/associacoes');

    const ed = await s.chamar('PUT', `/api/admin/empresas/${criada.corpo.id}`, { nome: 'Nova Proteção', cnpj: '00.000.000/0001-00', ativo: false });
    assert.equal(ed.corpo.ativo, false);

    assert.equal((await s.chamar('POST', `/api/admin/empresas/${criada.corpo.id}/sistemas`, { sistemaId: 1, url: 'ftp://x' })).status, 400, 'endereço precisa ser http(s)');
    const lig = await s.chamar('POST', `/api/admin/empresas/${criada.corpo.id}/sistemas`, { sistemaId: 1, url: 'https://sga.exemplo/sgav4_nova', mobile: 'mobile-secreto', identificadorNoSistema: '' });
    assert.equal(lig.status, 201);
    assert.equal(lig.corpo.mobile, undefined);
    assert.equal(lig.corpo.mobileDefinido, true);
    assert.equal(s.banco.t.ligs[0].identificadorNoSistema, null, 'vazio vira null (campo único no banco)');

    // editar sem mobile mantém o guardado
    await s.chamar('PUT', `/api/admin/ligacoes/${lig.corpo.id}`, { url: 'https://sga.exemplo/sgav4_nova2', ativo: false, mobile: '' });
    assert.equal(s.banco.t.ligs[0].mobile, 'mobile-secreto');
    assert.equal(s.banco.t.ligs[0].ativo, false);

    // trocar o mobile e o token da API; depois editar sem os dois mantém; limparTokenApi apaga só o token
    const troca = await s.chamar('PUT', `/api/admin/ligacoes/${lig.corpo.id}`, { url: 'https://sga.exemplo/sgav4_nova2', mobile: 'mobile-novo', tokenApi: 'token-api-secreto' });
    assert.deepEqual([troca.corpo.mobile, troca.corpo.tokenApi, troca.corpo.tokenApiDefinido], [undefined, undefined, true]);
    assert.deepEqual([s.banco.t.ligs[0].mobile, s.banco.t.ligs[0].tokenApi], ['mobile-novo', 'token-api-secreto']);
    await s.chamar('PUT', `/api/admin/ligacoes/${lig.corpo.id}`, { url: 'https://sga.exemplo/sgav4_nova2', mobile: '', tokenApi: '' });
    assert.deepEqual([s.banco.t.ligs[0].mobile, s.banco.t.ligs[0].tokenApi], ['mobile-novo', 'token-api-secreto']);
    const limpo = await s.chamar('PUT', `/api/admin/ligacoes/${lig.corpo.id}`, { url: 'https://sga.exemplo/sgav4_nova2', limparTokenApi: true });
    assert.equal(limpo.corpo.tokenApiDefinido, false);
    assert.deepEqual([s.banco.t.ligs[0].mobile, s.banco.t.ligs[0].tokenApi], ['mobile-novo', null]);
    await s.chamar('PUT', `/api/admin/ligacoes/${lig.corpo.id}`, { url: 'https://sga.exemplo/sgav4_nova2', tokenApi: 'token-api-secreto' });

    const lista = await s.chamar('GET', '/api/admin/empresas');
    assert.deepEqual(lista.corpo.empresas.map((x) => x.nome), ['EMPRESA TESTE', 'Nova Proteção'], 'ordem alfabética');
    assert.equal(lista.corpo.sistemas.find((x) => x.nome === 'SGA').total, 1);
    assert.ok(!/mobile-secreto|mobile-novo|token-api-secreto/.test(JSON.stringify(lista.corpo)), 'a tela nunca recebe o mobile nem o token');

    // sistema em uso: o 409 do banco chega com a mensagem
    const emUso = await s.chamar('DELETE', '/api/admin/sistemas/1');
    assert.equal(emUso.status, 409);
    assert.match(emUso.corpo.error, /associações ligadas/);

    assert.equal((await s.chamar('DELETE', `/api/admin/ligacoes/${lig.corpo.id}`)).status, 204);
    assert.equal((await s.chamar('DELETE', '/api/admin/sistemas/1')).status, 204);
    assert.equal((await s.chamar('DELETE', `/api/admin/empresas/${criada.corpo.id}`)).status, 204);
    assert.equal((await s.chamar('DELETE', '/api/admin/empresas/abc')).status, 400);

    assert.ok(!/mobile-secreto|mobile-novo|token-api-secreto/.test(JSON.stringify(s.historico)), 'o histórico não guarda o mobile nem o token');
    assert.deepEqual(s.historico.map((h) => h.acao), ['empresa.adicionar', 'empresa.alterar', 'empresa.sistema.adicionar', ...Array(5).fill('empresa.sistema.alterar'), 'empresa.sistema.remover', 'sistema.remover', 'empresa.remover']);
  } finally {
    s.fechar();
  }
});

test('sistemas: nome repetido volta 409 e sem token do banco a resposta explica', async () => {
  const s = await subir();
  try {
    const dup = await s.chamar('POST', '/api/admin/sistemas', { nome: 'SGA' });
    assert.equal(dup.status, 409);
    assert.equal((await s.chamar('POST', '/api/admin/sistemas', { nome: 'Novo Sistema' })).status, 201);
  } finally {
    s.fechar();
  }
  const app = express();
  criarRotasEmpresas({ exigirAdmin: async () => ({}), anotar: async () => {}, asyncHandler, ErroHttp, banco: { url: 'http://banco:4000', token: '' } }).registrar(app);
  app.use(erroFinal(() => {}));
  const srv = await new Promise((ok) => { const x = app.listen(0, '127.0.0.1', () => ok(x)); });
  try {
    const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/admin/empresas`);
    assert.equal(r.status, 424);
    assert.match((await r.json()).error, /BANCO_CENTRAL_TOKEN/);
  } finally {
    srv.close();
  }
});
