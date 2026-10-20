const test = require('node:test');
const assert = require('node:assert/strict');
const { resumirExecucoes, classificarItem, lerResultado, rotaDeInicio, ehModoTeste, itensDoInicio } = require('../execucoes');

test('classificarItem: valores reais das automações', () => {
  for (const s of ['alterada', 'desbloqueado', 'ja_desbloqueado', 'ativado', 'já estava ativo', 'criada', 'conforme', 'ja_existe', 'cadastrado', 'ja_existia', 'ok', 'parcial', 'finalizar', 'seguir_visto', 'criado', 'conferido (já estava igual)']) assert.equal(classificarItem(s), 'ok', s);
  for (const s of ['erro', 'não encontrado', 'múltiplos encontrados', 'cancelado', 'divergente', 'nao_existe', 'nao_localizado']) assert.equal(classificarItem(s), 'erro', s);
  for (const s of ['teste (não salvou)', 'teste']) assert.equal(classificarItem(s), 'teste', s);
  for (const s of ['pulado (já existia)', 'pendente']) assert.equal(classificarItem(s), 'pulado', s);
});

test('lerResultado: lista results, resultado único, grupos, eventos do SSE, ok e contagens', () => {
  assert.deepEqual(lerResultado({ running: false, results: [{ status: 'alterada' }, { status: 'erro' }, { status: 'pulado (já existia)' }] }), { situacao: 'concluido', itens: 2, concluidos: 1, erros: 1, teste: false });
  assert.deepEqual(lerResultado({ resultado: { status: 'nao_localizado' } }), { situacao: 'concluido', itens: 1, concluidos: 0, erros: 1, teste: false });
  assert.equal(lerResultado({ execucao: { grupos: [{ erro: null }, { erro: 'x' }] } }).concluidos, 1);
  assert.equal(lerResultado({ type: 'done' }, [{ status: 'criado' }, { status: 'criado' }]).concluidos, 2);
  assert.deepEqual(lerResultado({ type: 'done', ok: true, status: 'cadastrado' }), { situacao: 'concluido', itens: 1, concluidos: 1, erros: 0, teste: false });
  assert.deepEqual(lerResultado({ type: 'done', total: 10, salvas: 8 }), { situacao: 'concluido', itens: 10, concluidos: 8, erros: 2, teste: false });
  assert.equal(lerResultado({ type: 'done', error: 'falhou o login' }).situacao, 'erro');
  assert.equal(lerResultado({ type: 'done', parada: true, results: [] }).situacao, 'parado');
  assert.equal(lerResultado({ results: [{ status: 'teste (não salvou)' }] }).teste, true);
});

test('rotaDeInicio, ehModoTeste e itensDoInicio', () => {
  assert.deepEqual(rotaDeInicio('POST', '/api/start'), { tipo: 'job' });
  assert.deepEqual(rotaDeInicio('POST', '/api/associacoes/3/atualizar'), { tipo: 'job' });
  assert.deepEqual(rotaDeInicio('POST', '/api/interno/crm/jobs'), { tipo: 'flask', config: '/api/interno/crm/config' });
  assert.deepEqual(rotaDeInicio('POST', '/api/jobs'), { tipo: 'flask', config: '/api/config' });
  assert.deepEqual(rotaDeInicio('POST', '/api/gerar'), { tipo: 'na-hora' });
  assert.equal(rotaDeInicio('GET', '/api/start'), null);
  assert.equal(rotaDeInicio('POST', '/api/sga/tipos/buscar'), null);
  assert.equal(ehModoTeste({ modoTeste: true }), true);
  assert.equal(ehModoTeste({ dryRun: false }), false);
  assert.equal(ehModoTeste({}), false);
  assert.equal(itensDoInicio({ consultores: ['a', 'b'] }), 2);
  assert.equal(itensDoInicio({ total: 4 }), 4);
  assert.equal(itensDoInicio(null, { 'x-arquivos': '3' }), 3);
  assert.equal(itensDoInicio({}), 1);
});

const LINHAS = [
  { automacaoId: '23', automacaoNome: 'Altera Senha', quem: 'Fulano', quemGlpiId: 7, inicio: '2026-10-01T10:00:00Z', fim: '2026-10-01T10:02:00Z', situacao: 'concluido', itens: 3, concluidos: 2, erros: 1, modoTeste: false },
  { automacaoId: '23', automacaoNome: 'Altera Senha', quem: 'Ciclano', quemGlpiId: 8, inicio: '2026-10-02T10:00:00Z', fim: '2026-10-02T10:04:00Z', situacao: 'concluido', itens: 1, concluidos: 1, erros: 0, modoTeste: false },
  { automacaoId: '15', automacaoNome: 'Relatórios', quem: 'Fulano', quemGlpiId: 7, inicio: '2026-10-03T10:00:00Z', fim: null, situacao: 'rodando', itens: 0, concluidos: 0, erros: 0, modoTeste: false },
  { automacaoId: '23', automacaoNome: 'Altera Senha', quem: 'Fulano', quemGlpiId: 7, inicio: '2026-10-04T10:00:00Z', fim: '2026-10-04T10:01:00Z', situacao: 'concluido', itens: 5, concluidos: 5, erros: 0, modoTeste: true },
];

test('resumirExecucoes: soma itens, tempo economizado só do que concluiu de verdade e separa por automação e pessoa', () => {
  const r = resumirExecucoes(LINHAS, { 23: 4, 15: null });
  assert.deepEqual(r.totais, { execucoes: 3, rodando: 1, itens: 4, concluidos: 3, erros: 1, testes: 0, duracaoMediaSeg: 180 });
  assert.deepEqual(r.tempoEconomizado, { estimativa: true, minutos: 12, horas: 0.2 });
  assert.deepEqual(r.porAutomacao.map((a) => [a.nome, a.execucoes, a.minutosEconomizados, a.minutosPorItem]), [['Altera Senha', 2, 12, 4], ['Relatórios', 1, 0, null]]);
  assert.deepEqual(r.porPessoa.map((p) => [p.nome, p.execucoes]), [['Fulano', 2], ['Ciclano', 1]]);
});

test('resumirExecucoes: modo teste só entra quando pedido e nunca conta tempo economizado', () => {
  const r = resumirExecucoes(LINHAS, { 23: 4 }, { incluirTeste: true });
  assert.equal(r.totais.execucoes, 4);
  assert.equal(r.totais.testes, 1);
  assert.equal(r.tempoEconomizado.minutos, 12);
});

test('resumirExecucoes: sem linhas devolve zeros', () => {
  const r = resumirExecucoes([], {});
  assert.equal(r.totais.execucoes, 0);
  assert.equal(r.totais.duracaoMediaSeg, null);
  assert.deepEqual(r.porAutomacao, []);
});
