// Tipos que não dependem de associação (foto de perfil, senha de sistemas) não precisam de "Categoria X" no privado.
const test = require('node:test');
const assert = require('node:assert/strict');
const { subir } = require('./_base-rotas-whatsapp');

const privado = (mud = {}) => ({ ativo: true, tipos: [], responder: true, reagir: true, categorias: [{ apelido: 'Ancore', categoriaId: 3, categoriaLabel: 'Ancore' }], ...mud });
const mensagemPv = (s, extra = {}) => s.comoBot('POST', '/api/whatsapp/bot/mensagem', { mensagemId: 'pv1', privado: true, grupoJid: '5531988887777@s.whatsapp.net', grupoNome: '', remetente: '5531988887777@s.whatsapp.net', texto: 'Foto de perfil para o Fulano de Tal', ...extra });

test('privado: foto de perfil sem "Categoria" abre o chamado sem categoria', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir', privado: privado() });
  const r = (await mensagemPv(s)).json;
  assert.equal(r.status, 'aberto');
  assert.equal(r.reacao, '🔍');
  assert.equal(s.abertos[0].categoriaId, null);
  assert.equal(s.abertos[0].requerenteId, 12);
  s.fechar();
});

test('privado: foto de perfil com categoria conhecida usa a categoria; desconhecida continua sendo dúvida', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir', privado: privado() });
  await mensagemPv(s, { mensagemId: 'a', texto: 'Categoria Ancore\nFoto de perfil para o Fulano' });
  assert.equal(s.abertos[0].categoriaId, 3);
  const desconhecida = (await mensagemPv(s, { mensagemId: 'b', texto: 'Categoria Valle\nFoto de perfil para o Fulano' })).json;
  assert.equal(desconhecida.status, 'sem_categoria');
  assert.equal(s.abertos.length, 1);
  s.fechar();
});

test('privado: tipo que depende da associação (alterar senha do SGA) continua exigindo a categoria', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir', privado: privado() });
  const r = (await mensagemPv(s, { texto: 'Alterar a senha do SGA do Fulano de Tal' })).json;
  assert.equal(r.status, 'sem_categoria');
  assert.equal(s.abertos.length, 0);
  s.fechar();
});
