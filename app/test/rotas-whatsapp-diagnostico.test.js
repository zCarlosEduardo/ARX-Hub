// O robô explica na conversa o que faltou (privado) e o Hub guarda o motivo de CADA mensagem recebida, inclusive as ignoradas.
const test = require('node:test');
const assert = require('node:assert/strict');
const { subir } = require('./_base-rotas-whatsapp');
const { configPadrao, validarSecao } = require('../admin');

const CAT = { apelido: 'Ancore', categoriaId: 3, categoriaLabel: 'Ancore' };
const privado = (mud = {}) => ({ ativo: true, tipos: [], responder: false, reagir: true, explicarDuvida: true, categorias: [CAT], ...mud });
const pv = (s, extra = {}) => s.comoBot('POST', '/api/whatsapp/bot/mensagem', { mensagemId: `pv${Math.random()}`, privado: true, grupoJid: '5531988887777@s.whatsapp.net', grupoNome: '', remetente: '5531988887777@s.whatsapp.net', texto: 'Alterar a senha do SGA do Fulano de Tal', ...extra });
const painel = async (s) => (await s.comoAdmin('GET', '/api/admin/whatsapp/painel')).json;

test('privado sem categoria: reação de dúvida E explicação na conversa, com exemplo', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir', privado: privado() });
  const r = (await pv(s)).json;
  assert.equal(r.status, 'sem_categoria');
  assert.equal(r.reacao, '❓');
  assert.match(r.resposta, /Categoria Ancore/);
  assert.ok(!/[—–]| - /.test(r.resposta));
  s.fechar();
});

test('categoria que não existe: a explicação cita o que a pessoa escreveu e as categorias disponíveis', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir', privado: privado({ categorias: [CAT, { apelido: 'Tech Protege', categoriaId: 45, categoriaLabel: 'Tech' }] }) });
  const r = (await pv(s, { texto: 'Categoria Valle\nAlterar a senha do SGA do Fulano' })).json;
  assert.match(r.resposta, /"Valle"/);
  assert.match(r.resposta, /Ancore/);
  assert.match(r.resposta, /Tech Protege/);
  s.fechar();
});

test('nenhuma categoria cadastrada: a explicação manda procurar um administrador', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir', privado: privado({ categorias: [] }) });
  const r = (await pv(s, { texto: 'Categoria Ancore\nAlterar a senha do SGA do Fulano' })).json;
  assert.match(r.resposta, /administrador/);
  s.fechar();
});

test('explicarDuvida desligado: só a reação, sem texto', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir', privado: privado({ explicarDuvida: false }) });
  const r = (await pv(s)).json;
  assert.equal(r.status, 'sem_categoria');
  assert.equal(r.resposta, undefined);
  s.fechar();
});

test('pedido que deu certo não traz explicação', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir', privado: privado() });
  const r = (await pv(s, { texto: 'Categoria Ancore\nAlterar a senha do SGA do Fulano' })).json;
  assert.equal(r.status, 'aberto');
  assert.equal(r.resposta, undefined);
  s.fechar();
});

test('registro de mensagens: guarda cada decisão (inclusive ignoradas) com o motivo, mais nova primeiro', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir', privado: privado() });
  await pv(s, { texto: 'bom dia, tudo bem?' }); // ignorada: não é pedido
  await pv(s, { remetente: '5511900000000@s.whatsapp.net', texto: 'Categoria Ancore\nAlterar a senha do SGA do Fulano' }); // ignorada: sem vínculo
  await pv(s); // sem categoria
  await pv(s, { texto: 'Categoria Ancore\nAlterar a senha do SGA do CPF 11122233344' }); // aberta
  const m = (await painel(s)).mensagens;
  assert.equal(m.length, 4);
  assert.deepEqual(m.map((x) => x.resultado), ['aberto', 'sem_categoria', 'ignorado', 'ignorado']);
  assert.match(m[1].motivo, /categoria/i);
  assert.match(m[2].motivo, /vínculo/i);
  assert.match(m[3].motivo, /pedido/i);
  assert.equal(m[0].onde, 'Conversa privada');
  assert.equal(m[0].remetente, '***7777');
  assert.ok(!/11122233344/.test(JSON.stringify(m)), 'CPF no texto sai mascarado');
  s.fechar();
});

test('registro: motivos de ignorar (automação desligada, grupo desconhecido, fora da lista de autorizados)', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ ativo: false });
  await s.mensagem();
  await s.configurar({});
  await s.mensagem({ grupoJid: 'outro@g.us', grupoNome: 'Outro' });
  await s.configurar({ remetentesAutorizados: ['11977776666'] });
  await s.mensagem({ mensagemId: 'z' });
  const m = (await painel(s)).mensagens;
  assert.match(m[2].motivo, /desligada/);
  assert.match(m[1].motivo, /grupo/i);
  assert.match(m[0].motivo, /autorizados/);
  s.fechar();
});

test('registro: guarda só as últimas 100', async () => {
  const s = await subir();
  await s.configurar({});
  for (let i = 0; i < 105; i++) await s.mensagem({ mensagemId: `m${i}`, texto: 'oi' });
  assert.equal((await painel(s)).mensagens.length, 100);
  s.fechar();
});

test('configuração: explicarDuvida existe, vem ligada por padrão e só aceita verdadeiro ou falso', () => {
  assert.equal(configPadrao().whatsapp.privado.explicarDuvida, true);
  const base = configPadrao().whatsapp;
  assert.equal(validarSecao('whatsapp', { ...base, privado: { explicarDuvida: false } }).valor.privado.explicarDuvida, false);
  assert.equal(validarSecao('whatsapp', { ...base, privado: { explicarDuvida: 'sim' } }).ok, false);
  const antigo = { ...base, privado: { ativo: true } };
  assert.equal(validarSecao('whatsapp', antigo).valor.privado.explicarDuvida, true, 'configuração antiga sem o campo fica ligada');
});
