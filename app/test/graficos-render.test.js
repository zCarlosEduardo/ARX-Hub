// Renderiza os componentes de gráfico (graficos.js, resultados.js, disponibilidade.js) para texto HTML/SVG,
// com um React mínimo (sem DOM, sem react-dom/server) e confere estrutura, rótulos de acessibilidade e textos.
// Não valida o visual (layout, cores, sobreposição): isso exige abrir a tela no navegador.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUBLIC = path.join(__dirname, '..', 'public');

// ---------- React mínimo ----------
const NOOP = () => {};
const React = {
  createElement(tipo, props, ...filhos) {
    const p = { ...(props || {}) };
    if (filhos.length) p.children = filhos.length === 1 ? filhos[0] : filhos;
    return { tipo, props: p };
  },
  useState(init) {
    if (init && typeof init === 'object' && 'carregando' in init && globalThis.__dadosForcados) {
      return [{ carregando: false, dados: globalThis.__dadosForcados, erro: null, em: null }, NOOP];
    }
    if (init === null && globalThis.__focoForcado !== undefined) return [globalThis.__focoForcado, NOOP];
    return [typeof init === 'function' ? init() : init, NOOP];
  },
  cloneElement: (el, props) => ({ tipo: el.tipo, props: { ...el.props, ...(props || {}) } }),
  useRef: () => ({ current: null }),
  useEffect: NOOP,
  useCallback: (fn) => fn,
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const SEM_UNIDADE = new Set(['fontWeight', 'opacity', 'lineHeight', 'flex', 'zIndex', 'strokeWidth', 'strokeOpacity', 'flexGrow', 'flexShrink']);
const valorCss = (k, v) => (typeof v === 'number' && v !== 0 && !SEM_UNIDADE.has(k) ? v + 'px' : v);
const paraCss = (o) => Object.entries(o).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${valorCss(k, v)}`).join(';');

function html(no) {
  if (no === null || no === undefined || no === false || no === true) return '';
  if (Array.isArray(no)) return no.map(html).join('');
  if (typeof no !== 'object') return esc(no);
  const { tipo, props } = no;
  if (typeof tipo === 'function') return html(tipo(props));
  const attrs = Object.entries(props)
    .filter(([k, v]) => k !== 'children' && k !== 'key' && k !== 'ref' && typeof v !== 'function' && v !== null && v !== undefined && v !== false)
    .map(([k, v]) => ` ${k === 'className' ? 'class' : k}="${esc(k === 'style' ? paraCss(v) : v)}"`)
    .join('');
  return `<${tipo}${attrs}>${html(props.children)}</${tipo}>`;
}

// ---------- carrega os arquivos do front num ambiente de navegador falso ----------
function carregar(...arquivos) {
  globalThis.window = globalThis;
  globalThis.React = React;
  globalThis.location = { protocol: 'http:', hostname: 'localhost' };
  globalThis.localStorage = { getItem: () => null, setItem: NOOP };
  for (const a of arquivos) vm.runInThisContext(fs.readFileSync(path.join(PUBLIC, a), 'utf8'), { filename: a });
}
carregar('graficos-dados.js', 'icons.js', 'graficos.js', 'disponibilidade.js', 'resultados.js');
const { GraficoSemanas, BarrasHorizontais, GraficoColunas } = window.Graficos;

const PROIBIDO = /NaN|undefined|\[object|—|–| - |\(s\)|\(ões\)|\(ns\)|>null</;
const confere = (texto, nome) => assert.ok(!PROIBIDO.test(texto), `${nome}: texto proibido em ${(texto.match(PROIBIDO) || [])[0]}`);
const contar = (texto, re) => (texto.match(re) || []).length;

const SEMANAS = [
  { semana: '2026-09-14', total: 12, concluido: 9, erro: 2, executando: 1 },
  { semana: '2026-09-21', total: 20, concluido: 14, erro: 6, executando: 0 },
  { semana: '2026-09-28', total: 0, concluido: 0, erro: 0, executando: 0 },
  { semana: '2026-10-05', total: 7, concluido: 7, erro: 0, executando: 0 },
];
const ANTERIOR = { periodo: { desde: '2026-08-17', ate: '2026-09-13' }, totais: { total: 40, concluido: 30, erro: 10, executando: 0, taxaErro: 0.25 } };

test('GraficoSemanas: eixos, legenda, taxa de erro, referência e rótulos acessíveis', () => {
  const h = html(e(GraficoSemanas, { semanas: SEMANAS, anterior: ANTERIOR }));
  confere(h, 'semanas');
  assert.equal(contar(h, /role="img"/g), 2, 'dois SVGs com role=img');
  assert.match(h, /aria-label="Gráfico de colunas empilhadas por semana, de 14\/09 a 05\/10 \(4 semanas\)\./);
  assert.match(h, /aria-label="Gráfico de linha da taxa de erro por semana, de 14\/09 a 05\/10\./);
  assert.match(h, /Média semanal do período anterior: 10/);
  assert.ok(h.includes('class="gfx-ref"'), 'linha de referência do período anterior');
  assert.ok(h.includes('Taxa de erro por semana'));
  assert.ok(h.includes('<pattern'), 'hachura do erro');
  assert.ok(h.includes('>14/09<') && h.includes('>05/10<'), 'rótulos dd/mm no eixo X');
  assert.ok(h.includes('>0<'), 'eixo Y começa em 0');
  assert.equal(contar(h, /class="gfx-hit"/g), 8, 'uma área focável por semana em cada gráfico');
  assert.ok(contar(h, /tabIndex="0"/g) === 8);
  assert.match(h, /aria-label="Semana de 14\/09\/2026 a 20\/09\/2026: 9 concluídas, 2 com erro, 1 em execução\. Taxa de erro: 18,2%\./);
  assert.match(h, /aria-label="Semana de 28\/09\/2026 a 04\/10\/2026: 0 concluídas, 0 com erro\. Taxa de erro: Sem dados\./);
  assert.ok(h.includes('Concluído') && h.includes('Erro') && h.includes('Em execução'), 'legenda com os três estados');
  assert.ok(!h.includes('res-tip'), 'sem tooltip quando nada está em foco');
  // semana sem execuções finalizadas não vira ponto na linha: 3 pontos para 4 semanas
  assert.equal(contar(h, /class="gfx-ponto"/g), 3);
});

test('GraficoSemanas: sem período anterior não desenha referência nem legenda dela', () => {
  const h = html(e(GraficoSemanas, { semanas: SEMANAS, anterior: undefined }));
  confere(h, 'sem anterior');
  assert.ok(!h.includes('gfx-ref'));
  assert.ok(!h.includes('período anterior'));
});

test('GraficoSemanas: tooltip da semana em foco traz os números', () => {
  globalThis.__focoForcado = 1;
  try {
    const h = html(e(GraficoSemanas, { semanas: SEMANAS, anterior: ANTERIOR }));
    confere(h, 'tooltip');
    assert.match(h, /class="res-tip"[^>]*>.*21\/09\/2026 a 27\/09\/2026/);
    assert.match(h, /14 concluídos/);
    assert.match(h, /6 com erro/);
    assert.match(h, /Taxa de erro: 30%/);
    assert.ok(h.includes('class="gfx-foco"'));
  } finally {
    delete globalThis.__focoForcado;
  }
});

test('GraficoSemanas: estado vazio', () => {
  const h = html(e(GraficoSemanas, { semanas: [{ semana: '2026-09-14', total: 0, concluido: 0, erro: 0, executando: 0 }], anterior: ANTERIOR }));
  assert.ok(h.includes('Nenhuma execução no período.'));
  assert.ok(!h.includes('<svg'));
  confere(h, 'vazio');
});

test('GraficoSemanas: muitas semanas (26) mantém rótulos legíveis e sem NaN', () => {
  const semanas = [];
  for (let i = 0; i < 26; i++) {
    const d = new Date(Date.UTC(2026, 3, 6 + i * 7)).toISOString().slice(0, 10);
    semanas.push({ semana: d, total: i, concluido: i, erro: i % 3, executando: 0 });
  }
  const h = html(e(GraficoSemanas, { semanas, anterior: ANTERIOR }));
  confere(h, '26 semanas');
  assert.equal(contar(h, /class="gfx-hit"/g), 52);
});

test('BarrasHorizontais: lista com valores em texto e rótulo acessível por barra', () => {
  const h = html(e(BarrasHorizontais, {
    itens: [
      { chave: 'a', rotulo: 'Fechamento', valores: { concluido: 8, erro: 2 }, total: 10, detalhe: '10 · 20% de erro' },
      { chave: 'b', rotulo: 'Cadastro', valores: { concluido: 0, erro: 3 }, total: 3, detalhe: '3 · 100% de erro' },
    ],
    ariaLabel: 'Barras por tipo.',
    vazio: 'Nada.',
  }));
  confere(h, 'barras');
  assert.match(h, /<ul class="gfx-hbar" aria-label="Barras por tipo\.">/);
  assert.match(h, /aria-label="Fechamento: 8 concluídos, 2 com erro"/);
  assert.match(h, /aria-label="Cadastro: 0 concluídos, 3 com erro"/);
  assert.ok(h.includes('10 · 20% de erro'));
  assert.match(h, /width:80%/);
  assert.match(h, /width:20%[^"]*margin-left:2px/, 'vão de 2px entre os segmentos');
  assert.match(h, /width:30%/, 'a escala é comum: 3 de 10 = 30%');
  assert.ok(!h.includes('NaN'));
});

test('BarrasHorizontais: estado vazio', () => {
  const h = html(e(BarrasHorizontais, { itens: [], ariaLabel: 'x', vazio: 'Nenhum dado.' }));
  assert.ok(h.includes('Nenhum dado.'));
});

test('Disponibilidade: gráficos por dia têm eixos, rótulos acessíveis e estado vazio', () => {
  const { GraficoQuedasDias, GraficoTempoDias } = window.DisponibilidadeGraficos;
  const dias = [
    { dia: '2026-10-01', quedas: 0, tempoForaSeg: 0 },
    { dia: '2026-10-02', quedas: 3, tempoForaSeg: 5400 },
    { dia: '2026-10-03', quedas: 1, tempoForaSeg: 300 },
  ];
  const q = html(e(GraficoQuedasDias, { dias }));
  confere(q, 'quedas');
  assert.match(q, /role="img"/);
  assert.match(q, /aria-label="Gráfico de colunas das quedas por dia, de 01\/10 a 03\/10 \(3 dias\)\. Total: 4 quedas\./);
  assert.match(q, /aria-label="02\/10\/2026: 3 quedas, 1 h 30 min fora do ar\."/);
  assert.match(q, /aria-label="01\/10\/2026: 0 quedas\."/);
  assert.equal(contar(q, /class="gfx-hit"/g), 3);
  const t = html(e(GraficoTempoDias, { dias }));
  confere(t, 'tempo');
  assert.match(t, /Gráfico de colunas do tempo fora do ar por dia/);
  assert.match(t, />2 h</, 'eixo em horas');
  const vazio = html(e(GraficoQuedasDias, { dias: dias.map((d) => ({ ...d, quedas: 0, tempoForaSeg: 0 })) }));
  assert.ok(vazio.includes('Nenhuma queda no período.'));
});

test('GraficoColunas: valores zerados em todas as séries mostram o texto de vazio', () => {
  const h = html(e(GraficoColunas, { pontos: [{ chave: 'a', rotulo: '01/01', valores: { x: 0 }, aria: 'a' }], series: [{ chave: 'x', cor: 'var(--accent)' }], escala: { topo: 4, ticks: [0, 4] }, formatarTick: String, ariaLabel: 'x', vazio: 'Sem nada.' }));
  assert.ok(h.includes('Sem nada.'));
});

// ---------- tela inteira de Resultados com um payload realista ----------
const PAYLOAD = {
  periodo: { desde: '2026-09-14', ate: '2026-10-11' },
  totais: { total: 39, chamados: 35, concluido: 30, erro: 8, executando: 1, executandoParado: 0, testes: 2, taxaErro: 8 / 38, duracaoMediaSeg: 240, duracaoMedianaSeg: 120 },
  nomesTipos: { fechamento: 'Fechamento p/ cobrança', cadastro_usuario: 'Cadastro de usuário' },
  tempoEconomizado: { estimativa: true, minutos: 300, horas: 5, minutosManuais: { fechamento: 10, cadastro_usuario: 6 } },
  semanas: SEMANAS,
  tipos: [
    { tipo: 'fechamento', nome: 'Fechamento p/ cobrança', total: 25, concluido: 18, erro: 6, executando: 1, taxaErro: 0.25, duracaoMediaSeg: 300, minutosManuais: 10, minutosEconomizados: 180 },
    { tipo: 'cadastro_usuario', nome: 'Cadastro de usuário', total: 14, concluido: 12, erro: 2, executando: 0, taxaErro: 2 / 14, duracaoMediaSeg: null, minutosManuais: 6, minutosEconomizados: 72 },
  ],
  associacoes: Array.from({ length: 12 }, (_, i) => ({ associacaoId: i + 1, nome: 'Associação ' + (i + 1), total: 5 + i, concluido: 4 + i - (i % 3), erro: 1 + (i % 3), taxaErro: (1 + (i % 3)) / (5 + i) })),
  aprovadores: [{ nome: 'Pessoa A', id: 1, total: 20, concluido: 17, erro: 3 }],
  motivosErro: [{ motivo: 'Cooperativa não encontrada', total: 5, tipos: ['fechamento'], exemplos: [{ id: 1, glpiTicketId: 1234, categoria: 'X', criadoEm: '2026-10-01T10:00:00', resultado: 'texto' }] }, { motivo: 'Outro motivo', total: 3, tipos: ['cadastro_usuario'], exemplos: [] }],
  falhas: [{ associacaoId: 1, nome: 'Associação 1', tipo: 'fechamento', erro: 4, exemplo: { id: 1, glpiTicketId: 1234, categoria: 'X', criadoEm: '2026-10-01T10:00:00', resultado: 'texto' } }],
  anterior: ANTERIOR,
  variacao: {
    resolvidos: { atual: 30, anterior: 30, diferenca: 0, percentual: 0 },
    taxaErro: { atual: 8 / 38, anterior: 0.25, pontosPercentuais: -4 },
    tempoEconomizado: { atualMin: 300, anteriorMin: 250, diferencaMin: 50, percentual: 0.2 },
    duracaoMediaSeg: { atual: 240, anterior: null, diferencaSeg: null, percentual: null },
  },
};

test('Resultados: tela completa com gráficos novos, sem textos proibidos', () => {
  globalThis.__dadosForcados = PAYLOAD;
  try {
    const h = html(e(window.ResultadosView, {}));
    confere(h, 'resultados');
    for (const t of ['Resolvidos por semana', 'Distribuição por tipo', 'Associações com mais erros', 'Motivos de erro', 'Por associação', 'Taxa de erro por semana']) assert.ok(h.includes(t), t);
    assert.match(h, /Exibindo 8 de 12 associações/);
    assert.ok(h.includes('Ver todas (12)'));
    assert.equal(contar(h, /<svg[^>]*role="img"[^>]*aria-label="[^"]+"/g) >= 2, true);
    assert.match(h, /aria-label="Fechamento p\/ cobrança: 18 concluídos, 6 com erro"/);
    assert.ok(h.includes('Sem dados'), 'métrica sem valor mostra "Sem dados"');
    assert.match(h, /12 chamados distintos|35 chamados distintos/);
    assert.match(h, /63%|>26%</, 'percentual do motivo (5 de 8 erros = 63%)');
  } finally {
    delete globalThis.__dadosForcados;
  }
});

function e(tipo, props) {
  return React.createElement(tipo, props);
}
