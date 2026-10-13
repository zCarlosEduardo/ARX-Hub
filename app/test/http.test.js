const test = require('node:test');
const assert = require('node:assert/strict');
const { asyncHandler, ErroHttp, erroFinal } = require('../http');

function fakeRes() {
  return { headersSent: false, statusCode: null, corpo: null,
    status(c) { this.statusCode = c; return this; }, json(o) { this.corpo = o; return this; } };
}

test('asyncHandler encaminha rejeição para next', async () => {
  const erro = new Error('falhou');
  let recebido;
  await asyncHandler(async () => { throw erro; })({}, {}, (e) => { recebido = e; });
  assert.equal(recebido, erro);
});

test('erroFinal: 5xx não vaza detalhe e loga', () => {
  const logs = [];
  const res = fakeRes();
  erroFinal((...a) => logs.push(a))(new Error('senha=123 stack'), { method: 'GET', path: '/x' }, res, () => {});
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.corpo, { error: 'Erro interno do servidor.' });
  assert.equal(logs.length, 1);
});

test('erroFinal: ErroHttp 4xx expõe a mensagem', () => {
  const res = fakeRes();
  erroFinal(() => {})(new ErroHttp(404, 'não encontrado'), { method: 'GET', path: '/x' }, res, () => {});
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.corpo, { error: 'não encontrado' });
});

test('erroFinal: erro de body-parser (status 400) responde 400', () => {
  const res = fakeRes();
  const e = Object.assign(new SyntaxError('JSON inválido'), { status: 400, expose: true });
  erroFinal(() => {})(e, { method: 'POST', path: '/x' }, res, () => {});
  assert.equal(res.statusCode, 400);
});
