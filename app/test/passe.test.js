const test = require('node:test');
const assert = require('node:assert/strict');
const { criarPasses } = require('../passe');

test('passe: vale para a automação certa e devolve quem abriu', () => {
  const p = criarPasses();
  const passe = p.emitir({ automacaoId: '23', usuario: { id: 7, nome: 'Fulano de Tal' } });
  assert.deepEqual(p.ler(passe, 23), { usuario: { id: 7, nome: 'Fulano de Tal' } });
  assert.equal(p.ler(passe, 24), null);
});

test('passe: recusa adulterado, de outra chave, vencido e lixo', () => {
  let agora = 1000;
  const p = criarPasses({ agora: () => agora });
  const passe = p.emitir({ automacaoId: 1, usuario: null });
  const [dados, assinatura] = passe.split('.');
  const outro = Buffer.from(JSON.stringify({ a: '2', u: null, exp: 9e15 })).toString('base64url');
  assert.equal(p.ler(`${outro}.${assinatura}`, 2), null);
  assert.equal(p.ler(`${dados}.${assinatura.slice(1)}x`, 1), null);
  assert.equal(criarPasses().ler(passe, 1), null);
  assert.equal(p.ler('', 1), null);
  assert.equal(p.ler(undefined, 1), null);
  assert.deepEqual(p.ler(passe, 1), { usuario: null });
  agora += p.VALIDADE_MS + 1;
  assert.equal(p.ler(passe, 1), null);
});
