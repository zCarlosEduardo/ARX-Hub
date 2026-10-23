// Regras da extensão ARX SGA: empresa pela URL, login da empresa, erro de cookies e cofre cifrado (dados fictícios).
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../extensoes/arx-sga/regras');
const { EMPRESAS_SGA } = require('../extensoes/arx-sga/empresasSga');

test('base e empresa a partir de qualquer página do SGA', () => {
  assert.equal(R.baseDaUrl('https://sga.hinova.com.br/sga/sgav4_valle/v5/login.php?x=1'), 'https://sga.hinova.com.br/sga/sgav4_valle');
  assert.equal(R.baseDaUrl('https://saturno.hinova.com.br/sga/sgav4_br_truck/v5/Associado/listar'), 'https://saturno.hinova.com.br/sga/sgav4_br_truck');
  assert.equal(R.baseDaUrl('http://sga.hinova.com.br/sga/sgav4_valle/'), null); // só https
  assert.equal(R.baseDaUrl('https://exemplo.com/outra'), null);
  assert.equal(R.empresaDaBase('https://SGA.hinova.com.br/sga/sgav4_ancore', EMPRESAS_SGA), 'ancore');
  assert.equal(R.empresaDaBase('https://sga.hinova.com.br/sga/sgav4_naoexiste', EMPRESAS_SGA), null);
});

test('login da empresa: o primeiro que a tem marcada e está completo', () => {
  const logins = [{ usuario: 'a', senha: '', empresas: ['valle'] }, { usuario: 'b', senha: 'x', empresas: ['valle', 'unik'] }, { usuario: 'c', senha: 'y', empresas: ['ancore'] }];
  assert.equal(R.loginDaEmpresa(logins, 'valle').usuario, 'b');
  assert.equal(R.loginDaEmpresa(logins, 'ancore').usuario, 'c');
  assert.equal(R.loginDaEmpresa(logins, 'speed'), null);
});

test('reconhece a página de erro de cookies e não confunde com outras', () => {
  assert.ok(R.ehErroDeCookies({ titulo: '400 Request Header Or Cookie Too Large', texto: '' }));
  assert.ok(R.ehErroDeCookies({ titulo: '400 Bad Request', texto: 'Request Header Or Cookie Too Large nginx' }));
  assert.ok(R.ehErroDeCookies({ titulo: '400 Bad Request', texto: 'nginx' }));
  assert.ok(!R.ehErroDeCookies({ titulo: 'SGA - Associados', texto: 'Lista de associados' }));
  assert.ok(!R.ehErroDeCookies({ titulo: '400 Bad Request', texto: 'x'.repeat(5000) }));
});

test('cofre: cifra, abre com a senha certa e recusa a errada', async () => {
  const { chave, pacote: vazio } = await R.criarCofre('senha-ficticia-1');
  const pacote = await R.cifrar(chave, R.deB64(vazio.sal), [{ usuario: 'login.teste', senha: 'segredo', empresas: ['valle'] }]);
  assert.doesNotMatch(JSON.stringify(pacote), /segredo|login\.teste/);
  const aberto = await R.abrirCofre('senha-ficticia-1', pacote);
  assert.equal(aberto.logins[0].senha, 'segredo');
  await assert.rejects(R.abrirCofre('outra-senha', pacote), /Senha mestra incorreta/);
  await assert.rejects(R.criarCofre('curta'), /8 caracteres/);
  // a chave guardada na sessão volta a funcionar depois de exportada
  const de = await R.importarChave(await R.exportarChave(aberto.chave));
  assert.equal((await R.decifrar(de, pacote))[0].usuario, 'login.teste');
});
