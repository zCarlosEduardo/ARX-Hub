// Foto de perfil tem categoria fixa no GLPI ("ARX - Demandas internas", id 2), em grupo ou no privado, e não pede "Categoria X".
const test = require('node:test');
const assert = require('node:assert/strict');
const { subir } = require('./_base-rotas-whatsapp');

const privado = (mud = {}) => ({ ativo: true, tipos: [], responder: true, reagir: true, categorias: [{ apelido: 'Ancore', categoriaId: 3, categoriaLabel: 'Ancore' }], ...mud });
const mensagemPv = (s, extra = {}) => s.comoBot('POST', '/api/whatsapp/bot/mensagem', { mensagemId: 'pv1', privado: true, grupoJid: '5531988887777@s.whatsapp.net', grupoNome: '', remetente: '5531988887777@s.whatsapp.net', texto: 'Foto de perfil para o Fulano de Tal', ...extra });
const mensagemGrupo = (s, extra = {}) => s.comoBot('POST', '/api/whatsapp/bot/mensagem', { mensagemId: 'g1', grupoJid: '1203@g.us', grupoNome: 'Grupo Tech', remetente: '553188887777@s.whatsapp.net', texto: 'Foto de perfil para o Fulano de Tal', ...extra });

test('privado: foto de perfil sem "Categoria" abre o chamado na categoria fixa (id 2)', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir', privado: privado() });
  const r = (await mensagemPv(s)).json;
  assert.equal(r.status, 'aberto');
  assert.equal(r.reacao, '🔍');
  assert.equal(s.abertos[0].categoriaId, 2);
  assert.equal(s.abertos[0].requerenteId, 12);
  s.fechar();
});

test('privado: foto de perfil ignora a linha Categoria (sempre id 2), mesmo conhecida ou desconhecida, e a linha sai do texto', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir', privado: privado() });
  await mensagemPv(s, { mensagemId: 'a', texto: 'Categoria Ancore\nFoto de perfil para o Fulano' });
  const desconhecida = (await mensagemPv(s, { mensagemId: 'b', texto: 'Categoria Valle\nFoto de perfil para o Fulano' })).json;
  assert.equal(desconhecida.status, 'aberto');
  assert.deepEqual(s.abertos.map((a) => a.categoriaId), [2, 2]);
  assert.ok(s.abertos.every((a) => !/Categoria/.test(a.descricao.split('\n\n')[0])));
  s.fechar();
});

test('grupo: foto de perfil usa a categoria fixa mesmo que o grupo tenha outra categoria configurada', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir' }); // o grupo de teste usa a categoria 45
  const r = (await mensagemGrupo(s)).json;
  assert.equal(r.status, 'aberto');
  assert.equal(s.abertos[0].categoriaId, 2);
  s.fechar();
});

test('grupo: os outros tipos continuam com a categoria do grupo', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir' });
  await mensagemGrupo(s, { texto: 'Alterar a senha do SGA do Fulano de Tal' });
  assert.equal(s.abertos[0].categoriaId, 45);
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
