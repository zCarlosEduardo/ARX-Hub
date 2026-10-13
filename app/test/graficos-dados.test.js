const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../public/graficos-dados.js');

test('topoEixo arredonda para um valor redondo e nunca fica abaixo de 4', () => {
  assert.equal(G.topoEixo(0), 4);
  assert.equal(G.topoEixo(3), 4);
  assert.equal(G.topoEixo(5), 5);
  assert.equal(G.topoEixo(7), 10);
  assert.equal(G.topoEixo(11), 20);
  assert.equal(G.topoEixo(21), 25);
  assert.equal(G.topoEixo(26), 50);
  assert.equal(G.topoEixo(101), 200);
  assert.equal(G.topoEixo(230), 250);
  assert.equal(G.topoEixo(NaN), 4);
  assert.equal(G.topoEixo(-3), 4);
});

test('ticksEixo devolve divisões inteiras de 0 até o topo', () => {
  assert.deepEqual(G.ticksEixo(4), [0, 1, 2, 3, 4]);
  assert.deepEqual(G.ticksEixo(5), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(G.ticksEixo(10), [0, 2, 4, 6, 8, 10]);
  assert.deepEqual(G.ticksEixo(20), [0, 5, 10, 15, 20]);
  assert.deepEqual(G.ticksEixo(250), [0, 50, 100, 150, 200, 250]);
  for (const topo of [4, 5, 10, 20, 25, 50, 100, 200, 250, 500]) {
    assert.ok(G.ticksEixo(topo).every(Number.isInteger), `topo ${topo}`);
  }
});

test('topoPercentual e ticksPercentual', () => {
  assert.equal(G.topoPercentual(0), 0.1);
  assert.equal(G.topoPercentual(0.08), 0.1);
  assert.equal(G.topoPercentual(0.15), 0.2);
  assert.equal(G.topoPercentual(0.3), 0.4);
  assert.equal(G.topoPercentual(0.45), 0.5);
  assert.equal(G.topoPercentual(0.7), 1);
  assert.equal(G.topoPercentual(1), 1);
  assert.equal(G.topoPercentual(null), 0.1);
  assert.deepEqual(G.ticksPercentual(0.1), [0, 0.05, 0.1]);
  assert.deepEqual(G.ticksPercentual(1), [0, 0.25, 0.5, 0.75, 1]);
});

test('fracao e formatarPct', () => {
  assert.equal(G.fracao(1, 4), 0.25);
  assert.equal(G.fracao(0, 4), 0);
  assert.equal(G.fracao(1, 0), null);
  assert.equal(G.fracao(undefined, 4), 0);
  assert.equal(G.formatarPct(0.125), '12,5%');
  assert.equal(G.formatarPct(0), '0%');
  assert.equal(G.formatarPct(1), '100%');
  assert.equal(G.formatarPct(null), 'Sem dados');
  assert.equal(G.formatarPct(undefined), 'Sem dados');
});

test('datas: dataCurta, dataBr e fimDaSemana', () => {
  assert.equal(G.dataCurta('2026-09-28'), '28/09');
  assert.equal(G.dataBr('2026-09-28'), '28/09/2026');
  assert.equal(G.dataCurta(''), '');
  assert.equal(G.fimDaSemana('2026-09-28'), '2026-10-04');
  assert.equal(G.fimDaSemana('2026-12-28'), '2027-01-03');
});

test('pontosSemanas calcula finalizadas, taxa de erro e rótulos', () => {
  const pontos = G.pontosSemanas([
    { semana: '2026-09-21', total: 10, concluido: 6, erro: 2, executando: 2 },
    { semana: '2026-09-28', total: 0, concluido: 0, erro: 0, executando: 0 },
  ]);
  assert.equal(pontos.length, 2);
  assert.equal(pontos[0].rotulo, '21/09');
  assert.equal(pontos[0].periodo, '21/09/2026 a 27/09/2026');
  assert.equal(pontos[0].finalizadas, 8);
  assert.equal(pontos[0].taxaErro, 0.25);
  assert.equal(pontos[0].soma, 10);
  assert.equal(pontos[1].taxaErro, null);
  assert.equal(pontos[1].soma, 0);
  assert.deepEqual(G.pontosSemanas(null), []);
});

test('pontosSemanas tolera campos ausentes', () => {
  const [p] = G.pontosSemanas([{ semana: '2026-09-21' }]);
  assert.equal(p.concluido, 0);
  assert.equal(p.erro, 0);
  assert.equal(p.executando, 0);
  assert.equal(p.taxaErro, null);
});

test('resumoSemanas', () => {
  const pontos = G.pontosSemanas([
    { semana: '2026-09-14', concluido: 3, erro: 1, executando: 0 },
    { semana: '2026-09-21', concluido: 6, erro: 2, executando: 1 },
    { semana: '2026-09-28', concluido: 0, erro: 0, executando: 0 },
  ]);
  const r = G.resumoSemanas(pontos);
  assert.equal(r.semanas, 3);
  assert.equal(r.concluido, 9);
  assert.equal(r.erro, 3);
  assert.equal(r.executando, 1);
  assert.equal(r.inicio, '14/09');
  assert.equal(r.fim, '28/09');
  assert.equal(r.maior.rotulo, '21/09');
  assert.equal(r.maior.soma, 9);
  assert.equal(G.resumoSemanas([]).semanas, 0);
});

test('passoRotulos evita rótulos sobrepostos', () => {
  assert.equal(G.passoRotulos(12, 600, 44), 1);
  assert.equal(G.passoRotulos(26, 600, 44), 2);
  assert.equal(G.passoRotulos(26, 300, 44), 4);
  assert.equal(G.passoRotulos(4, 0, 44), 1);
  assert.equal(G.passoRotulos(0, 600, 44), 1);
});

test('empilhar posiciona segmentos de baixo para cima com 2px de vão', () => {
  const series = [{ chave: 'concluido' }, { chave: 'erro' }];
  const segs = G.empilhar({ concluido: 6, erro: 2 }, series, 10, 100, 100, 2);
  assert.equal(segs.length, 2);
  assert.deepEqual({ y: segs[0].y, h: segs[0].h }, { y: 42, h: 58 });
  assert.deepEqual({ y: segs[1].y, h: segs[1].h }, { y: 20, h: 20 });
  assert.equal(segs[0].topo, false);
  assert.equal(segs[1].topo, true);
});

test('empilhar ignora zeros, garante altura mínima e marca o topo', () => {
  const series = [{ chave: 'concluido' }, { chave: 'erro' }, { chave: 'executando' }];
  const segs = G.empilhar({ concluido: 100, erro: 0, executando: 0 }, series, 1000, 100, 100, 2);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].chave, 'concluido');
  assert.equal(segs[0].topo, true);
  assert.equal(segs[0].h, 10);
  const minimo = G.empilhar({ concluido: 1 }, [{ chave: 'concluido' }], 1000, 100, 100, 2);
  assert.equal(minimo[0].h, 3);
  assert.deepEqual(G.empilhar({}, series, 10, 100, 100, 2), []);
});

test('caminhoColuna gera um caminho fechado sem NaN e limita o raio', () => {
  const c = G.caminhoColuna(10, 20, 16, 50, 4);
  assert.match(c, /^M/);
  assert.match(c, /Z$/);
  assert.ok(!/NaN|undefined/.test(c));
  const baixa = G.caminhoColuna(0, 0, 10, 2, 4);
  assert.ok(!/NaN|undefined/.test(baixa));
  const reta = G.caminhoColuna(0, 0, 10, 10, 0);
  assert.ok(!/Q/.test(reta));
});

test('mediaSemanalAnterior usa as semanas segunda a domingo do período', () => {
  const r = G.mediaSemanalAnterior({
    periodo: { desde: '2026-09-01', ate: '2026-09-28' },
    totais: { concluido: 40, erro: 10 },
  });
  assert.equal(r.semanas, 5);
  assert.equal(r.total, 50);
  assert.equal(r.media, 10);
});

test('mediaSemanalAnterior devolve null sem dados', () => {
  assert.equal(G.mediaSemanalAnterior(undefined), null);
  assert.equal(G.mediaSemanalAnterior(null), null);
  assert.equal(G.mediaSemanalAnterior({ periodo: { desde: '2026-09-01', ate: '2026-09-28' }, totais: { concluido: 0, erro: 0 } }), null);
  assert.equal(G.mediaSemanalAnterior({ totais: { concluido: 3, erro: 1 } }), null);
});

test('ordenarTipos ordena por total e calcula taxa e participação', () => {
  const r = G.ordenarTipos(
    [
      { tipo: 'a', total: 2, concluido: 2, erro: 0, executando: 0, taxaErro: 0 },
      { tipo: 'b', total: 8, concluido: 6, erro: 2, executando: 0, taxaErro: 0.25 },
      { tipo: 'c', total: 1, concluido: 0, erro: 0, executando: 1, taxaErro: null },
    ],
    { b: 'Tipo B' }
  );
  assert.deepEqual(r.map((x) => x.tipo), ['b', 'a', 'c']);
  assert.equal(r[0].nome, 'Tipo B');
  assert.equal(r[1].nome, 'a');
  assert.equal(r[0].pctDoTotal, 8 / 11);
  assert.equal(r[0].taxaErro, 0.25);
  assert.equal(r[2].taxaErro, null);
  assert.equal(r[2].finalizadas, 0);
  assert.deepEqual(G.ordenarTipos(null), []);
});

test('ordenarTipos prefere o nome já presente no item', () => {
  const r = G.ordenarTipos([{ tipo: 'x', nome: 'Nome do servidor', total: 1, concluido: 1, erro: 0 }], { x: 'Outro' });
  assert.equal(r[0].nome, 'Nome do servidor');
});

test('rankingAssociacoes limita, ordena por erros e volume e conta o restante', () => {
  const assoc = [];
  for (let i = 0; i < 10; i++) assoc.push({ nome: 'A' + i, total: 10 + i, concluido: 10 + i - i, erro: i });
  assoc.push({ nome: 'Vazia', total: 0, concluido: 0, erro: 0 });
  const r = G.rankingAssociacoes(assoc, 8);
  assert.equal(r.itens.length, 8);
  assert.equal(r.itens[0].nome, 'A9');
  assert.equal(r.itens[7].nome, 'A2');
  assert.equal(r.restantes, 2);
  assert.equal(r.total, 10);
  assert.equal(r.itens[0].taxaErro, 9 / (9 + 10 + 9 - 9));
});

test('rankingAssociacoes desempata por volume e depois por nome', () => {
  const r = G.rankingAssociacoes(
    [
      { nome: 'B', total: 5, concluido: 4, erro: 1 },
      { nome: 'A', total: 5, concluido: 4, erro: 1 },
      { nome: 'C', total: 9, concluido: 8, erro: 1 },
    ],
    8
  );
  assert.deepEqual(r.itens.map((x) => x.nome), ['C', 'A', 'B']);
  assert.equal(r.restantes, 0);
  assert.deepEqual(G.rankingAssociacoes(null).itens, []);
});

test('motivosComPercentual usa o total de erros do período como base', () => {
  const r = G.motivosComPercentual([{ motivo: 'X', total: 3 }, { motivo: 'Y', total: 1 }], 8);
  assert.equal(r[0].pct, 3 / 8);
  assert.equal(r[1].pct, 1 / 8);
  const semBase = G.motivosComPercentual([{ motivo: 'X', total: 3 }, { motivo: 'Y', total: 1 }], 0);
  assert.equal(semBase[0].pct, 0.75);
  const limitado = G.motivosComPercentual([{ motivo: 'X', total: 5 }], 3);
  assert.equal(limitado[0].pct, 1);
  assert.deepEqual(G.motivosComPercentual(null, 3), []);
});

test('formatarDuracaoCurta para rótulos de eixo', () => {
  assert.equal(G.formatarDuracaoCurta(0), '0');
  assert.equal(G.formatarDuracaoCurta(30), '30 s');
  assert.equal(G.formatarDuracaoCurta(600), '10 min');
  assert.equal(G.formatarDuracaoCurta(3600), '1 h');
  assert.equal(G.formatarDuracaoCurta(5400), '1,5 h');
  assert.equal(G.formatarDuracaoCurta(86400), '24 h');
  assert.equal(G.formatarDuracaoCurta(null), 'Sem dados');
});

test('escalaDuracao escolhe minutos ou horas com topo redondo', () => {
  const vazio = G.escalaDuracao(0);
  assert.equal(vazio.topo, 240);
  assert.deepEqual(vazio.ticks, [0, 60, 120, 180, 240]);
  const min = G.escalaDuracao(500);
  assert.equal(min.topo, 600);
  assert.deepEqual(min.ticks, [0, 120, 240, 360, 480, 600]);
  const horas = G.escalaDuracao(7000);
  assert.equal(horas.topo, 4 * 3600);
  assert.equal(horas.ticks[horas.ticks.length - 1], horas.topo);
});

test('duracaoLonga para textos de tooltip', () => {
  assert.equal(G.duracaoLonga(45), '45 s');
  assert.equal(G.duracaoLonga(600), '10 min');
  assert.equal(G.duracaoLonga(5400), '1 h 30 min');
  assert.equal(G.duracaoLonga(7200), '2 h');
  assert.equal(G.duracaoLonga(null), 'Sem dados');
});

test('plural', () => {
  assert.equal(G.plural(1, 'queda', 'quedas'), '1 queda');
  assert.equal(G.plural(0, 'queda', 'quedas'), '0 quedas');
  assert.equal(G.plural(1234, 'queda', 'quedas'), '1.234 quedas');
});
