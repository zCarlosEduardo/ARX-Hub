// Tela de Resultados do Hub de exemplo: execuções FICTÍCIAS (exemplo-dados.js), nada vem do banco-central.
(function () {
  const e = React.createElement;
  const { useState } = React;
  const { Icon } = window.Icons;
  const D = window.ExemploDados;

  const PERIODOS = { 7: '7 dias', 30: '30 dias', 84: '12 semanas' };
  const num = (n) => n.toLocaleString('pt-BR');
  const pct = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  const dia = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  function resumo(dias, assoc) {
    const ex = dias.flatMap((d) => d.execucoes).filter((x) => !assoc || x.associacao === assoc);
    const erros = ex.filter((x) => x.erro).length;
    const ok = ex.length - erros;
    const minutos = ex.filter((x) => !x.erro).reduce((s, x) => s + D.TIPOS[x.tipo].minutos, 0);
    const segundos = ex.length ? Math.round(ex.reduce((s, x) => s + x.segundos, 0) / ex.length) : 0;
    return { ex, ok, erros, taxa: ex.length ? (erros / ex.length) * 100 : 0, horas: minutos / 60, segundos };
  }

  // colunas: por dia até 30 dias, por semana nas 12 semanas
  function colunas(dias, assoc) {
    const grupos = [];
    const passo = dias.length > 31 ? 7 : 1;
    for (let i = 0; i < dias.length; i += passo) grupos.push(dias.slice(i, i + passo));
    return grupos.map((g) => {
      const r = resumo(g, assoc);
      return { rotulo: passo === 1 ? dia(g[0].data) : 'Sem. ' + dia(g[0].data), ok: r.ok, erros: r.erros, total: r.ex.length };
    });
  }

  function Spark({ valores, cor }) {
    const max = Math.max(1, ...valores);
    const pts = valores.map((v, i) => (i / Math.max(1, valores.length - 1)) * 100 + ',' + (26 - (v / max) * 24)).join(' ');
    return e('svg', { className: 'exr-spark', viewBox: '0 0 100 28', preserveAspectRatio: 'none', 'aria-hidden': 'true' },
      e('polyline', { points: pts, fill: 'none', stroke: cor, strokeWidth: 2, vectorEffect: 'non-scaling-stroke', strokeLinejoin: 'round', strokeLinecap: 'round' }));
  }

  function Delta({ atual, anterior, menorMelhor, sufixo }) {
    if (anterior == null || !isFinite(anterior) || anterior === 0) return null;
    const v = ((atual - anterior) / anterior) * 100;
    const bom = menorMelhor ? v <= 0 : v >= 0;
    return e('span', { className: 'exu-delta ' + (bom ? 'bom' : 'ruim') }, (v >= 0 ? '▲ ' : '▼ ') + pct(Math.abs(v)) + (sufixo || ''));
  }

  function Grafico({ cols }) {
    const [foco, setFoco] = useState(null);
    const max = Math.max(4, ...cols.map((c) => c.total));
    const topo = Math.ceil(max / 4) * 4;
    const passoRotulo = Math.ceil(cols.length / 10);
    return e('div', null, [
      e('div', { key: 'g', className: 'exr-grafico', role: 'img', 'aria-label': 'Chamados resolvidos e com erro por período' }, [
        ...[0, 1, 2, 3, 4].map((i) => e('div', { key: 'l' + i, className: 'exr-grade', style: { bottom: (i / 4) * 100 + '%' } }, e('span', null, num((topo / 4) * i)))),
        e('div', { key: 'c', className: 'exr-colunas' }, cols.map((c, i) => e('div', {
          key: i, className: 'exr-coluna', onMouseEnter: () => setFoco(i), onMouseLeave: () => setFoco(null),
          tabIndex: 0, onFocus: () => setFoco(i), onBlur: () => setFoco(null), 'aria-label': c.rotulo + ': ' + c.ok + ' resolvidos, ' + c.erros + ' com erro',
        }, [
          c.erros ? e('div', { key: 'e', className: 'exr-seg erro topo', style: { height: (c.erros / topo) * 100 + '%' } }) : null,
          c.ok ? e('div', { key: 'o', className: 'exr-seg ok' + (c.erros ? '' : ' topo'), style: { height: (c.ok / topo) * 100 + '%' } }) : null,
          foco === i ? e('div', { key: 'd', className: 'exr-dica' }, [
            e('b', { key: 'b' }, c.rotulo),
            e('div', { key: 'o' }, 'Resolvidos: ' + num(c.ok)), e('div', { key: 'e' }, 'Com erro: ' + num(c.erros)),
            e('div', { key: 't', style: { color: 'var(--muted)' } }, 'Taxa de erro: ' + (c.total ? pct((c.erros / c.total) * 100) : 'Sem dados')),
          ]) : null,
        ]))),
      ]),
      e('div', { key: 'x', className: 'exr-eixo', 'aria-hidden': 'true' }, cols.map((c, i) => e('span', { key: i }, i % passoRotulo === 0 ? c.rotulo.replace('Sem. ', '') : ''))),
    ]);
  }

  function Tabela({ cols }) {
    return e('table', { className: 'exr-tab' }, [
      e('thead', { key: 'h' }, e('tr', null, [e('th', { key: 'p' }, 'Período'), e('th', { key: 'o', className: 'num' }, 'Resolvidos'), e('th', { key: 'e', className: 'num' }, 'Com erro'), e('th', { key: 't', className: 'num' }, 'Taxa de erro')])),
      e('tbody', { key: 'b' }, cols.map((c, i) => e('tr', { key: i }, [
        e('td', { key: 'p' }, c.rotulo), e('td', { key: 'o', className: 'num' }, num(c.ok)), e('td', { key: 'e', className: 'num' }, num(c.erros)),
        e('td', { key: 't', className: 'num' }, c.total ? pct((c.erros / c.total) * 100) : 'Sem dados'),
      ]))),
    ]);
  }

  function ExemploResultados() {
    const [periodo, setPeriodo] = useState(30);
    const [assoc, setAssoc] = useState('');
    const [modo, setModo] = useState('grafico');
    const dias = D.porDia.slice(-periodo);
    const antes = periodo < 84 ? D.porDia.slice(-periodo * 2, -periodo) : null;
    const r = resumo(dias, assoc);
    const ra = antes && antes.length === periodo ? resumo(antes, assoc) : null;
    const cols = colunas(dias, assoc);
    const serieOk = cols.map((c) => c.ok);
    const serieTaxa = cols.map((c) => (c.total ? c.erros / c.total : 0));

    const porTipo = Object.keys(D.TIPOS).map((t) => {
      const ex = r.ex.filter((x) => x.tipo === t);
      const erros = ex.filter((x) => x.erro).length;
      return { t, total: ex.length, erros, ok: ex.length - erros };
    }).filter((x) => x.total).sort((a, b) => b.total - a.total);
    const maxTipo = Math.max(1, ...porTipo.map((x) => x.total));
    const porAssoc = D.ASSOCIACOES.map((a) => {
      const ex = r.ex.filter((x) => x.associacao === a);
      const erros = ex.filter((x) => x.erro).length;
      return { a, total: ex.length, erros, taxa: ex.length ? (erros / ex.length) * 100 : 0 };
    }).filter((x) => x.total).sort((a, b) => b.taxa - a.taxa);

    const kpi = (k, rot, val, det, spark) => e('div', { key: k, className: 'exu-kpi' }, [
      e('div', { key: 'r', className: 'exu-kpi-rot' }, rot), e('div', { key: 'v', className: 'exu-kpi-val' }, val),
      e('div', { key: 'd', className: 'exu-kpi-det' }, det), spark || null,
    ]);
    const comparacao = ra ? 'contra os ' + PERIODOS[periodo] + ' anteriores' : 'sem período anterior para comparar';

    return e('div', { className: 'exu-tela' }, [
      e('header', { key: 'cab', className: 'exu-cab' }, [
        e('div', { key: 't' }, [
          e('h2', { key: 'h' }, 'Resultados'),
          e('p', { key: 'p' }, 'Chamados atendidos pelas automações de ' + dia(dias[0].data) + ' a ' + dia(dias[dias.length - 1].data) + ' · dados fictícios'),
        ]),
        e('div', { key: 'a', className: 'exu-acoes' }, [
          e('select', { key: 's', className: 'exu-select', value: assoc, onChange: (ev) => setAssoc(ev.target.value), 'aria-label': 'Associação' }, [
            e('option', { key: '', value: '' }, 'Todas as associações'), ...D.ASSOCIACOES.map((a) => e('option', { key: a, value: a }, a)),
          ]),
          e('div', { key: 'p', className: 'exu-seg', role: 'group', 'aria-label': 'Período' }, Object.keys(PERIODOS).map((p) => e('button', {
            key: p, type: 'button', 'aria-pressed': periodo === Number(p) ? 'true' : 'false', onClick: () => setPeriodo(Number(p)),
          }, PERIODOS[p]))),
        ]),
      ]),

      e('div', { key: 'k', className: 'exu-kpis' }, [
        kpi('ok', 'Chamados resolvidos', num(r.ok), [e(Delta, { key: 'd', atual: r.ok, anterior: ra && ra.ok }), comparacao], e(Spark, { key: 's', valores: serieOk, cor: 'var(--accent)' })),
        kpi('taxa', 'Taxa de erro', pct(r.taxa), [e(Delta, { key: 'd', atual: r.taxa, anterior: ra && ra.taxa, menorMelhor: true }), num(r.erros) + ' com erro'], e(Spark, { key: 's', valores: serieTaxa, cor: 'var(--error)' })),
        kpi('h', 'Tempo economizado', num(Math.round(r.horas)) + ' h', [e(Delta, { key: 'd', atual: r.horas, anterior: ra && ra.horas }), 'se fossem feitos à mão']),
        kpi('s', 'Tempo médio por chamado', r.segundos >= 60 ? Math.floor(r.segundos / 60) + ' min ' + (r.segundos % 60) + ' s' : r.segundos + ' s', [e(Delta, { key: 'd', atual: r.segundos, anterior: ra && ra.segundos, menorMelhor: true }), 'da automação, do início ao fim']),
      ]),

      e('section', { key: 'g', className: 'exu-cartao' }, [
        e('div', { key: 'c', className: 'exu-cartao-cab' }, [
          e('div', { key: 't' }, [e('h3', { key: 'h' }, periodo > 31 ? 'Resolvidos por semana' : 'Resolvidos por dia'), e('p', { key: 'p' }, 'Passe o mouse em uma coluna para ver os números.')]),
          e('div', { key: 'm', className: 'exu-seg', role: 'group', 'aria-label': 'Ver como' }, [
            e('button', { key: 'g', type: 'button', 'aria-pressed': modo === 'grafico' ? 'true' : 'false', onClick: () => setModo('grafico') }, 'Gráfico'),
            e('button', { key: 't', type: 'button', 'aria-pressed': modo === 'tabela' ? 'true' : 'false', onClick: () => setModo('tabela') }, 'Tabela'),
          ]),
        ]),
        e('div', { key: 'b', className: 'exu-cartao-corpo' }, modo === 'grafico' ? [
          e('div', { key: 'l', className: 'exr-legenda' }, [e('span', { key: 'o' }, [e('i', { key: 'i', className: 'ok' }), 'Resolvidos']), e('span', { key: 'e' }, [e('i', { key: 'i', className: 'erro' }), 'Com erro'])]),
          e(Grafico, { key: 'g', cols }),
        ] : e('div', { style: { maxHeight: 320, overflowY: 'auto' } }, e(Tabela, { cols }))),
      ]),

      e('div', { key: 'd', className: 'exr-duas' }, [
        e('section', { key: 't', className: 'exu-cartao' }, [
          e('div', { key: 'c', className: 'exu-cartao-cab' }, e('div', null, [e('h3', { key: 'h' }, 'Por tipo de chamado'), e('p', { key: 'p' }, 'Do mais atendido para o menos atendido.')])),
          e('div', { key: 'b', className: 'exu-cartao-corpo exr-barras' }, porTipo.map((x) => e('div', { key: x.t }, [
            e('div', { key: 'r', className: 'exr-barra-rot' }, [e('span', { key: 'n' }, D.TIPOS[x.t].nome), e('span', { key: 'v' }, num(x.total) + ' · ' + pct((x.erros / x.total) * 100) + ' de erro')]),
            e('div', { key: 't', className: 'exr-trilho', style: { width: (x.total / maxTipo) * 100 + '%' }, title: num(x.ok) + ' resolvidos, ' + num(x.erros) + ' com erro' }, [
              x.ok ? e('div', { key: 'o', style: { flex: x.ok, background: 'var(--accent)' } }) : null,
              x.erros ? e('div', { key: 'e', className: 'exr-seg erro', style: { flex: x.erros, maxWidth: 'none', margin: 0 } }) : null,
            ]),
          ]))),
        ]),
        e('section', { key: 'a', className: 'exu-cartao' }, [
          e('div', { key: 'c', className: 'exu-cartao-cab' }, e('div', null, [e('h3', { key: 'h' }, 'Associações'), e('p', { key: 'p' }, 'Ordenadas pela taxa de erro, a maior primeiro.')])),
          e('div', { key: 'b', className: 'exu-cartao-corpo' }, e('table', { className: 'exr-tab' }, [
            e('thead', { key: 'h' }, e('tr', null, [e('th', { key: 'a' }, 'Associação'), e('th', { key: 't', className: 'num' }, 'Chamados'), e('th', { key: 'e', className: 'num' }, 'Com erro'), e('th', { key: 'x', className: 'num' }, 'Taxa')])),
            e('tbody', { key: 'b' }, porAssoc.map((x) => e('tr', { key: x.a }, [
              e('td', { key: 'a' }, x.a), e('td', { key: 't', className: 'num' }, num(x.total)), e('td', { key: 'e', className: 'num' }, num(x.erros)),
              e('td', { key: 'x', className: 'num' }, e('span', { className: 'exu-sit ' + (x.taxa >= 10 ? 'erro' : x.taxa >= 6 ? 'pendencia' : 'concluido') }, [e('i', { key: 'i' }), pct(x.taxa)])),
            ]))),
          ])),
        ]),
      ]),

      e('section', { key: 'u', className: 'exu-cartao' }, [
        e('div', { key: 'c', className: 'exu-cartao-cab' }, e('div', null, [e('h3', { key: 'h' }, 'Últimas execuções'), e('p', { key: 'p' }, 'As 8 mais recentes do período.')])),
        e('div', { key: 'b', className: 'exu-cartao-corpo', style: { overflowX: 'auto' } }, e('table', { className: 'exr-tab' }, [
          e('thead', { key: 'h' }, e('tr', null, [e('th', { key: 'q' }, 'Quando'), e('th', { key: 't' }, 'Tipo'), e('th', { key: 'a' }, 'Associação'), e('th', { key: 'd', className: 'num' }, 'Duração'), e('th', { key: 's' }, 'Situação')])),
          e('tbody', { key: 'b' }, dias.slice().reverse().flatMap((d) => d.execucoes.filter((x) => !assoc || x.associacao === assoc).map((x) => ({ x, d: d.data }))).slice(0, 8).map(({ x, d }, i) => e('tr', { key: i }, [
            e('td', { key: 'q' }, dia(d)), e('td', { key: 't' }, D.TIPOS[x.tipo].nome), e('td', { key: 'a' }, x.associacao),
            e('td', { key: 'd', className: 'num' }, x.segundos + ' s'),
            e('td', { key: 's' }, e('span', { className: 'exu-sit ' + (x.erro ? 'erro' : 'concluido') }, [e('i', { key: 'i' }), x.erro ? 'Erro' : 'Solucionado'])),
          ]))),
        ])),
      ]),
      e('p', { key: 'n', style: { margin: 0, fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 } }, [Icon('AlertCircle', 13, 'currentColor'), 'Tempo economizado: cada chamado resolvido conta os minutos que levaria à mão naquele tipo.']),
    ]);
  }

  window.ExemploResultados = ExemploResultados;
})();
