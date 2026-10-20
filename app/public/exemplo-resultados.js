// Tela de Resultados do Hub de exemplo: execuções e quedas FICTÍCIAS (exemplo-dados.js), nada vem do banco-central.
(function () {
  const e = React.createElement;
  const { useState, useEffect, useRef } = React;
  const { Icon } = window.Icons;
  const D = window.ExemploDados;
  const DIA = 86400000;

  const num = (n) => Math.round(n).toLocaleString('pt-BR');
  const pct = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  const dia = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const diaLongo = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const deIso = (s) => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
  const duracao = (min) => (min < 60 ? Math.round(min) + ' min' : Math.floor(min / 60) + ' h ' + String(Math.round(min % 60)).padStart(2, '0') + ' min');
  const ler = (k, p) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : p; } catch (err) { return p; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (err) { /* sem armazenamento: vale só nesta aba */ } };

  const HOJE = D.porDia[D.porDia.length - 1].data;
  const PRIMEIRO = D.porDia[0].data;
  const ATALHOS = [
    ['hoje', 'Hoje', () => [HOJE, HOJE]],
    ['ontem', 'Ontem', () => [new Date(HOJE - DIA), new Date(HOJE - DIA)]],
    ['7', 'Últimos 7 dias', () => [new Date(HOJE - 6 * DIA), HOJE]],
    ['30', 'Últimos 30 dias', () => [new Date(HOJE - 29 * DIA), HOJE]],
    ['mes', 'Este mês', () => [new Date(HOJE.getFullYear(), HOJE.getMonth(), 1), HOJE]],
    ['mes_passado', 'Mês passado', () => [new Date(HOJE.getFullYear(), HOJE.getMonth() - 1, 1), new Date(HOJE.getFullYear(), HOJE.getMonth(), 0)]],
    ['84', 'Últimas 12 semanas', () => [new Date(HOJE - 83 * DIA), HOJE]],
  ];
  const intervalo = (p) => (p.chave === 'custom' ? [deIso(p.de), deIso(p.ate)] : ATALHOS.find((a) => a[0] === p.chave)[2]());
  const rotuloPeriodo = (p) => (p.chave === 'custom' ? dia(deIso(p.de)) + ' a ' + dia(deIso(p.ate)) : ATALHOS.find((a) => a[0] === p.chave)[1]);
  const diasEntre = (de, ate) => D.porDia.filter((d) => d.data >= de && d.data <= ate);

  function filtrar(dias, f) {
    return dias.flatMap((d) => d.execucoes.map((x) => Object.assign({ data: d.data }, x)))
      .filter((x) => (!f.assoc || x.associacao === f.assoc) && (!f.tipo || x.tipo === f.tipo) && (!f.origem || x.origem === f.origem));
  }
  function resumo(ex, nDias) {
    const erros = ex.filter((x) => x.erro).length;
    const ok = ex.length - erros;
    const minutos = ex.filter((x) => !x.erro).reduce((s, x) => s + D.TIPOS[x.tipo].minutos, 0);
    return {
      ok, erros, total: ex.length, taxa: ex.length ? (erros / ex.length) * 100 : 0, horas: minutos / 60,
      segundos: ex.length ? Math.round(ex.reduce((s, x) => s + x.segundos, 0) / ex.length) : 0,
      auto: ex.length ? (ex.filter((x) => x.origem === 'automatico').length / ex.length) * 100 : 0,
      porDia: nDias ? ex.length / nDias : 0,
    };
  }
  const contar = (ex) => { const erros = ex.filter((x) => x.erro).length; return { ok: ex.length - erros, erros, total: ex.length }; };
  // um dia: por hora; até 31 dias: por dia; mais: por semana
  function colunas(dias, ex) {
    if (dias.length === 1) return Array.from({ length: 11 }, (_, i) => Object.assign({ rotulo: (8 + i) + 'h' }, contar(ex.filter((x) => x.hora === 8 + i))));
    const passo = dias.length > 31 ? 7 : 1;
    const out = [];
    for (let i = 0; i < dias.length; i += passo) {
      const g = dias.slice(i, i + passo);
      out.push(Object.assign({ rotulo: (passo === 1 ? '' : 'Sem. ') + dia(g[0].data) }, contar(ex.filter((x) => x.data >= g[0].data && x.data <= g[g.length - 1].data))));
    }
    return out;
  }

  function Spark({ valores, cor }) {
    if (valores.length < 2) return null;
    const max = Math.max(1e-9, ...valores);
    const pts = valores.map((v, i) => (i / (valores.length - 1)) * 100 + ',' + (26 - (v / max) * 24)).join(' ');
    return e('svg', { className: 'exr-spark', viewBox: '0 0 100 28', preserveAspectRatio: 'none', 'aria-hidden': 'true' },
      e('polyline', { points: pts, fill: 'none', stroke: cor, strokeWidth: 2, vectorEffect: 'non-scaling-stroke', strokeLinejoin: 'round', strokeLinecap: 'round' }));
  }
  function Delta({ atual, anterior, menorMelhor }) {
    if (anterior == null || !isFinite(anterior) || anterior === 0) return null;
    const v = ((atual - anterior) / anterior) * 100;
    const bom = menorMelhor ? v <= 0 : v >= 0;
    return e('span', { className: 'exu-delta ' + (bom ? 'bom' : 'ruim') }, (v >= 0 ? '▲ ' : '▼ ') + pct(Math.abs(v)));
  }
  const Sit = ({ tipo, texto }) => e('span', { className: 'exu-sit ' + tipo }, [e('i', { key: 'i' }), texto]);

  function Grafico({ cols, altura }) {
    const [foco, setFoco] = useState(null);
    const topo = Math.ceil(Math.max(4, ...cols.map((c) => c.total)) / 4) * 4;
    const passoRotulo = Math.ceil(cols.length / 12);
    return e('div', null, [
      e('div', { key: 'g', className: 'exr-grafico', style: altura ? { height: altura } : null, role: 'img', 'aria-label': 'Resolvidos e com erro' }, [
        ...[0, 1, 2, 3, 4].map((i) => e('div', { key: 'l' + i, className: 'exr-grade', style: { bottom: (i / 4) * 100 + '%' } }, e('span', null, num((topo / 4) * i)))),
        e('div', { key: 'c', className: 'exr-colunas' }, cols.map((c, i) => e('div', {
          key: i, className: 'exr-coluna', tabIndex: 0, 'aria-label': c.rotulo + ': ' + c.ok + ' resolvidos, ' + c.erros + ' com erro',
          onMouseEnter: () => setFoco(i), onMouseLeave: () => setFoco(null), onFocus: () => setFoco(i), onBlur: () => setFoco(null),
        }, [
          c.erros ? e('div', { key: 'e', className: 'exr-seg erro topo', style: { height: (c.erros / topo) * 100 + '%' } }) : null,
          c.ok ? e('div', { key: 'o', className: 'exr-seg ok' + (c.erros ? '' : ' topo'), style: { height: (c.ok / topo) * 100 + '%' } }) : null,
          foco === i ? e('div', { key: 'd', className: 'exr-dica' + (i < cols.length / 4 ? ' esq' : i > (cols.length * 3) / 4 ? ' dir' : '') }, [
            e('b', { key: 'b' }, c.rotulo), e('div', { key: 'o' }, 'Resolvidos: ' + num(c.ok)), e('div', { key: 'e' }, 'Com erro: ' + num(c.erros)),
            e('div', { key: 't', style: { color: 'var(--muted)' } }, 'Taxa de erro: ' + (c.total ? pct((c.erros / c.total) * 100) : 'Sem dados')),
          ]) : null,
        ]))),
      ]),
      e('div', { key: 'x', className: 'exr-eixo', 'aria-hidden': 'true' }, cols.map((c, i) => e('span', { key: i }, i % passoRotulo === 0 ? c.rotulo.replace('Sem. ', '') : ''))),
    ]);
  }
  const Legenda = () => e('div', { className: 'exr-legenda' }, [e('span', { key: 'o' }, [e('i', { key: 'i', className: 'ok' }), 'Resolvidos']), e('span', { key: 'e' }, [e('i', { key: 'i', className: 'erro' }), 'Com erro'])]);
  function TabelaCols({ cols }) {
    return e('table', { className: 'exr-tab' }, [
      e('thead', { key: 'h' }, e('tr', null, [e('th', { key: 'p' }, 'Período'), e('th', { key: 'o', className: 'num' }, 'Resolvidos'), e('th', { key: 'e', className: 'num' }, 'Com erro'), e('th', { key: 't', className: 'num' }, 'Taxa de erro')])),
      e('tbody', { key: 'b' }, cols.map((c, i) => e('tr', { key: i }, [e('td', { key: 'p' }, c.rotulo), e('td', { key: 'o', className: 'num' }, num(c.ok)), e('td', { key: 'e', className: 'num' }, num(c.erros)), e('td', { key: 't', className: 'num' }, c.total ? pct((c.erros / c.total) * 100) : 'Sem dados')]))),
    ]);
  }
  const Cartao = ({ titulo, sub, acao, children, estilo }) => e('section', { className: 'exu-cartao', style: estilo }, [
    e('div', { key: 'c', className: 'exu-cartao-cab' }, [e('div', { key: 't' }, [e('h3', { key: 'h' }, titulo), sub ? e('p', { key: 'p' }, sub) : null]), acao || null]),
    e('div', { key: 'b', className: 'exu-cartao-corpo' }, children),
  ]);
  const Seg = ({ valor, opcoes, mudar, rotulo }) => e('div', { className: 'exu-seg', role: 'group', 'aria-label': rotulo }, opcoes.map(([v, t]) => e('button', { key: v, type: 'button', 'aria-pressed': valor === v ? 'true' : 'false', onClick: () => mudar(v) }, t)));
  const Barras = ({ itens, max }) => e('div', { className: 'exr-barras' }, itens.map((x) => e('div', { key: x.nome }, [
    e('div', { key: 'r', className: 'exr-barra-rot' }, [e('span', { key: 'n' }, x.nome), e('span', { key: 'v' }, x.texto)]),
    e('div', { key: 't', className: 'exr-trilho', style: { width: Math.max(2, (x.total / max) * 100) + '%' }, title: x.titulo }, [
      x.ok ? e('div', { key: 'o', style: { flex: x.ok, background: 'var(--accent)' } }) : null,
      x.erros ? e('div', { key: 'e', className: 'exr-seg erro', style: { flex: x.erros, maxWidth: 'none', margin: 0 } }) : null,
    ]),
  ])));

  // Seletor de período no padrão de painéis de análise: atalhos à esquerda, datas à direita, comparação opcional.
  function SeletorPeriodo({ periodo, mudar }) {
    const [aberto, setAberto] = useState(false);
    const [de, ate] = intervalo(periodo);
    const [rascunho, setRascunho] = useState({ de: iso(de), ate: iso(ate) });
    const caixa = useRef(null);
    useEffect(() => {
      if (!aberto) return undefined;
      setRascunho({ de: iso(de), ate: iso(ate) });
      const fora = (ev) => { if (caixa.current && !caixa.current.contains(ev.target)) setAberto(false); };
      const esc = (ev) => { if (ev.key === 'Escape') setAberto(false); };
      document.addEventListener('mousedown', fora);
      document.addEventListener('keydown', esc);
      return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
    }, [aberto]);
    const valido = rascunho.de && rascunho.ate && rascunho.de <= rascunho.ate;
    return e('div', { ref: caixa, className: 'exr-periodo' }, [
      e('button', { key: 'b', type: 'button', className: 'exu-btn', onClick: () => setAberto(!aberto), 'aria-expanded': aberto ? 'true' : 'false' }, [
        Icon('History', 14, 'currentColor'), rotuloPeriodo(periodo), e('span', { key: 'd', style: { color: 'var(--muted)', fontWeight: 400 } }, de.getTime() === ate.getTime() ? dia(de) : dia(de) + ' a ' + dia(ate)), Icon('ChevronDown', 14, 'currentColor'),
      ]),
      aberto ? e('div', { key: 'p', className: 'exr-periodo-pop', role: 'dialog', 'aria-label': 'Escolher período' }, [
        e('div', { key: 'a', className: 'exr-atalhos' }, ATALHOS.map(([k, t]) => e('button', {
          key: k, type: 'button', 'aria-pressed': periodo.chave === k ? 'true' : 'false', onClick: () => { mudar(Object.assign({}, periodo, { chave: k })); setAberto(false); },
        }, t))),
        e('div', { key: 'd', className: 'exr-datas' }, [
          e('b', { key: 't', style: { fontSize: 13 } }, 'Personalizado'),
          e('label', { key: 'de' }, ['De', e('input', { key: 'i', type: 'date', value: rascunho.de, min: iso(PRIMEIRO), max: iso(HOJE), onChange: (ev) => setRascunho(Object.assign({}, rascunho, { de: ev.target.value })) })]),
          e('label', { key: 'ate' }, ['Até', e('input', { key: 'i', type: 'date', value: rascunho.ate, min: iso(PRIMEIRO), max: iso(HOJE), onChange: (ev) => setRascunho(Object.assign({}, rascunho, { ate: ev.target.value })) })]),
          !valido ? e('span', { key: 'e', className: 'exu-campo-erro' }, 'A data inicial precisa ser antes da final.') : null,
          e('label', { key: 'c', className: 'exu-chave', style: { flexDirection: 'row' } }, [e('input', { key: 'i', type: 'checkbox', checked: periodo.comparar, onChange: (ev) => mudar(Object.assign({}, periodo, { comparar: ev.target.checked })) }), 'Comparar com o período anterior']),
          e('button', { key: 'ok', type: 'button', className: 'exu-btn primario pequeno', disabled: !valido, onClick: () => { mudar(Object.assign({}, periodo, { chave: 'custom', de: rascunho.de, ate: rascunho.ate })); setAberto(false); } }, 'Aplicar'),
        ]),
      ]) : null,
    ]);
  }

  function Tratados({ dias, antes, filtros, periodo }) {
    const [modo, setModo] = useState('grafico');
    const [exibir, setExibir] = useState(() => ler('arxhub_exemplo_res_exibir', 'lista'));
    const [ordem, setOrdem] = useState(['taxa', -1]);
    const [pagina, setPagina] = useState(0);
    const ex = filtrar(dias, filtros);
    const r = resumo(ex, dias.filter((d) => d.data.getDay() % 6).length || 1);
    const ra = antes ? resumo(filtrar(antes, filtros), antes.filter((d) => d.data.getDay() % 6).length || 1) : null;
    const cols = colunas(dias, ex);
    const porHora = Array.from({ length: 11 }, (_, i) => Object.assign({ rotulo: (8 + i) + 'h' }, contar(ex.filter((x) => x.hora === 8 + i))));
    const cmp = periodo.comparar && ra ? 'contra o período anterior' : null;
    useEffect(() => setPagina(0), [dias.length, filtros.assoc, filtros.tipo, filtros.origem, exibir]);

    const tipos = Object.keys(D.TIPOS).map((t) => Object.assign({ nome: D.TIPOS[t].nome }, contar(ex.filter((x) => x.tipo === t)))).filter((x) => x.total).sort((a, b) => b.total - a.total)
      .map((x) => Object.assign(x, { texto: num(x.total) + ' · ' + pct((x.erros / x.total) * 100) + ' de erro', titulo: num(x.ok) + ' resolvidos, ' + num(x.erros) + ' com erro' }));
    const motivos = Object.entries(ex.filter((x) => x.erro).reduce((m, x) => { m[x.motivo] = (m[x.motivo] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
    const assocs = D.ASSOCIACOES.map((a) => { const c = contar(ex.filter((x) => x.associacao === a)); return Object.assign({ a, taxa: c.total ? (c.erros / c.total) * 100 : 0 }, c); }).filter((x) => x.total)
      .sort((x, y) => (ordem[0] === 'a' ? x.a.localeCompare(y.a) : x[ordem[0]] - y[ordem[0]]) * ordem[1]);
    const th = (k, t, cls) => e('th', { key: k, className: 'ordenavel ' + (cls || ''), onClick: () => setOrdem([k, ordem[0] === k ? -ordem[1] : -1]), 'aria-sort': ordem[0] === k ? (ordem[1] > 0 ? 'ascending' : 'descending') : 'none' }, t + (ordem[0] === k ? (ordem[1] > 0 ? ' ↑' : ' ↓') : ''));
    const auto = ex.filter((x) => x.origem === 'automatico');
    const recentes = ex.slice().sort((a, b) => b.data - a.data || b.hora - a.hora);
    const porPag = exibir === 'lista' ? 10 : 9;
    const totalPag = Math.max(1, Math.ceil(recentes.length / porPag));
    const fatia = recentes.slice(pagina * porPag, (pagina + 1) * porPag);
    const kpi = (k, rot, val, det, extra) => e('div', { key: k, className: 'exu-kpi' }, [e('div', { key: 'r', className: 'exu-kpi-rot' }, rot), e('div', { key: 'v', className: 'exu-kpi-val' }, val), e('div', { key: 'd', className: 'exu-kpi-det' }, det), extra || null]);
    const sitEx = (x) => e(Sit, { tipo: x.erro ? 'erro' : 'concluido', texto: x.erro ? 'Erro' : 'Solucionado' });

    if (!ex.length) return e('div', { className: 'exc-tabela' }, e('div', { className: 'exc-vazio' }, [Icon('Inbox', 30, 'var(--muted-soft)', 1.3), 'Nenhuma execução neste período com esses filtros.']));
    return e(React.Fragment, null, [
      e('div', { key: 'k', className: 'exu-kpis' }, [
        kpi('ok', 'Chamados resolvidos', num(r.ok), [cmp && e(Delta, { key: 'd', atual: r.ok, anterior: ra.ok }), cmp || num(r.total) + ' atendidos'], e(Spark, { key: 's', valores: cols.map((c) => c.ok), cor: 'var(--accent)' })),
        kpi('taxa', 'Taxa de erro', pct(r.taxa), [cmp && e(Delta, { key: 'd', atual: r.taxa, anterior: ra.taxa, menorMelhor: true }), num(r.erros) + ' com erro'], e(Spark, { key: 's', valores: cols.map((c) => (c.total ? c.erros / c.total : 0)), cor: 'var(--error)' })),
        kpi('h', 'Tempo economizado', (r.horas < 10 ? r.horas.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : num(r.horas)) + ' h', [cmp && e(Delta, { key: 'd', atual: r.horas, anterior: ra.horas }), 'se fossem feitos à mão']),
        kpi('s', 'Tempo médio por chamado', r.segundos >= 60 ? Math.floor(r.segundos / 60) + ' min ' + (r.segundos % 60) + ' s' : r.segundos + ' s', [cmp && e(Delta, { key: 'd', atual: r.segundos, anterior: ra.segundos, menorMelhor: true }), 'do início ao fim']),
        kpi('a', 'No automático', pct(r.auto), [cmp && e(Delta, { key: 'd', atual: r.auto, anterior: ra.auto }), 'o resto foi rodado à mão']),
        kpi('m', 'Média por dia útil', r.porDia.toLocaleString('pt-BR', { maximumFractionDigits: 1 }), [cmp && e(Delta, { key: 'd', atual: r.porDia, anterior: ra.porDia }), 'chamados atendidos']),
      ]),

      e(Cartao, {
        key: 'g', titulo: dias.length === 1 ? 'Resolvidos por hora' : dias.length > 31 ? 'Resolvidos por semana' : 'Resolvidos por dia', sub: 'Passe o mouse em uma coluna para ver os números.',
        acao: e(Seg, { valor: modo, mudar: setModo, rotulo: 'Ver como', opcoes: [['grafico', 'Gráfico'], ['tabela', 'Tabela']] }),
      }, modo === 'grafico' ? [e(Legenda, { key: 'l' }), e(Grafico, { key: 'g', cols })] : e('div', { style: { maxHeight: 320, overflowY: 'auto' } }, e(TabelaCols, { cols }))),

      e('div', { key: 'd1', className: 'exr-duas' }, [
        e(Cartao, { key: 't', titulo: 'Por tipo de chamado', sub: 'Do mais atendido para o menos atendido.' }, e(Barras, { itens: tipos, max: Math.max(1, ...tipos.map((x) => x.total)) })),
        e(Cartao, { key: 'm', titulo: 'Motivos de erro', sub: motivos.length ? 'O que mais fez as automações pararem.' : 'Nenhum erro no período.' }, motivos.length ? e('div', { className: 'exr-barras' }, motivos.slice(0, 6).map(([m, n]) => e('div', { key: m }, [
          e('div', { key: 'r', className: 'exr-barra-rot' }, [e('span', { key: 'n' }, m), e('span', { key: 'v' }, num(n) + (n === 1 ? ' vez' : ' vezes') + ' · ' + pct((n / r.erros) * 100))]),
          e('div', { key: 't', className: 'exr-trilho', style: { width: (n / motivos[0][1]) * 100 + '%' } }, e('div', { className: 'exr-seg erro', style: { flex: 1, maxWidth: 'none', margin: 0, borderRadius: 4 } })),
        ]))) : e('div', { className: 'exc-vazio', style: { padding: 24 } }, 'Sem erros neste período.')),
      ]),

      e('div', { key: 'd2', className: 'exr-duas' }, [
        e(Cartao, { key: 'h', titulo: 'Por hora do dia', sub: 'Quando os chamados mais chegam para as automações.' }, [e(Grafico, { key: 'g', cols: porHora, altura: 150 })]),
        e(Cartao, { key: 'a', titulo: 'Automático e manual', sub: 'Quem disparou cada execução.' }, [
          e('div', { key: 'b', className: 'exr-trilho', style: { height: 14, marginBottom: 14 } }, [
            auto.length ? e('div', { key: 'a', style: { flex: auto.length, background: 'var(--accent)' }, title: 'Automático' }) : null,
            ex.length - auto.length ? e('div', { key: 'm', style: { flex: ex.length - auto.length, background: 'var(--muted-soft)' }, title: 'Manual' }) : null,
          ]),
          e('table', { key: 't', className: 'exr-tab' }, [
            e('thead', { key: 'h' }, e('tr', null, [e('th', { key: 'o' }, 'Origem'), e('th', { key: 'n', className: 'num' }, 'Chamados'), e('th', { key: 'p', className: 'num' }, 'Parte'), e('th', { key: 'e', className: 'num' }, 'Taxa de erro')])),
            e('tbody', { key: 'b' }, [['automatico', 'Automático', 'var(--accent)'], ['manual', 'Manual', 'var(--muted-soft)']].map(([k, t, cor]) => {
              const c = contar(ex.filter((x) => x.origem === k));
              return e('tr', { key: k }, [
                e('td', { key: 'o' }, e('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 8 } }, [e('i', { key: 'i', style: { width: 10, height: 10, borderRadius: 3, background: cor } }), t])),
                e('td', { key: 'n', className: 'num' }, num(c.total)), e('td', { key: 'p', className: 'num' }, pct((c.total / ex.length) * 100)),
                e('td', { key: 'e', className: 'num' }, c.total ? pct((c.erros / c.total) * 100) : 'Sem dados'),
              ]);
            })),
          ]),
        ]),
      ]),

      e(Cartao, { key: 'as', titulo: 'Associações', sub: 'Clique no título de uma coluna para ordenar.' }, e('div', { style: { overflowX: 'auto' } }, e('table', { className: 'exr-tab' }, [
        e('thead', { key: 'h' }, e('tr', null, [th('a', 'Associação'), th('total', 'Chamados', 'num'), th('ok', 'Resolvidos', 'num'), th('erros', 'Com erro', 'num'), th('taxa', 'Taxa', 'num')])),
        e('tbody', { key: 'b' }, assocs.map((x) => e('tr', { key: x.a }, [
          e('td', { key: 'a' }, x.a), e('td', { key: 't', className: 'num' }, num(x.total)), e('td', { key: 'o', className: 'num' }, num(x.ok)), e('td', { key: 'e', className: 'num' }, num(x.erros)),
          e('td', { key: 'x', className: 'num' }, e(Sit, { tipo: x.taxa >= 10 ? 'erro' : x.taxa >= 6 ? 'pendencia' : 'concluido', texto: pct(x.taxa) })),
        ]))),
      ]))),

      e(Cartao, {
        key: 'ch', titulo: 'Chamados atendidos', sub: num(recentes.length) + ' no período, do mais recente para o mais antigo.',
        acao: e(Seg, { valor: exibir, mudar: (v) => { setExibir(v); gravar('arxhub_exemplo_res_exibir', v); }, rotulo: 'Exibição', opcoes: [['lista', 'Lista'], ['cartoes', 'Cartões']] }),
      }, [
        exibir === 'lista'
          ? e('div', { key: 'l', style: { overflowX: 'auto' } }, e('table', { className: 'exr-tab' }, [
              e('thead', { key: 'h' }, e('tr', null, [e('th', { key: 'c' }, 'Chamado'), e('th', { key: 'q' }, 'Quando'), e('th', { key: 't' }, 'Tipo'), e('th', { key: 'a' }, 'Associação'), e('th', { key: 'o' }, 'Origem'), e('th', { key: 'd', className: 'num' }, 'Duração'), e('th', { key: 's' }, 'Situação')])),
              e('tbody', { key: 'b' }, fatia.map((x, i) => e('tr', { key: i }, [
                e('td', { key: 'c', style: { fontFamily: 'var(--font-mono)', fontSize: 12 } }, '#' + x.chamado), e('td', { key: 'q' }, dia(x.data) + ' ' + x.hora + 'h'),
                e('td', { key: 't' }, D.TIPOS[x.tipo].nome), e('td', { key: 'a' }, x.associacao), e('td', { key: 'o' }, x.origem === 'automatico' ? 'Automático' : 'Manual'),
                e('td', { key: 'd', className: 'num' }, x.segundos + ' s'), e('td', { key: 's' }, sitEx(x)),
              ]))),
            ]))
          : e('div', { key: 'c', className: 'exc-cartoes' }, fatia.map((x, i) => e('div', { key: i, className: 'exc-cartao', style: { height: 'auto', cursor: 'default' } }, [
              e('div', { key: 't', className: 'exc-cartao-topo' }, [e('span', { key: 'n', className: 'exc-id' }, '#' + x.chamado), sitEx(x)]),
              e('h4', { key: 'h' }, D.TIPOS[x.tipo].nome),
              e('p', { key: 'p' }, x.erro ? x.motivo : 'Solicitado por ' + x.solicitante + '.'),
              e('div', { key: 'r', className: 'exc-cartao-pe' }, [e('span', { key: 'a' }, x.associacao + ' · ' + (x.origem === 'automatico' ? 'Automático' : 'Manual')), e('span', { key: 'q' }, dia(x.data) + ' ' + x.hora + 'h · ' + x.segundos + ' s')]),
            ]))),
        totalPag > 1 ? e('nav', { key: 'p', className: 'exc-paginacao', style: { marginTop: 14 }, 'aria-label': 'Páginas' }, [
          e('span', { key: 't' }, 'Página ' + (pagina + 1) + ' de ' + totalPag),
          e('div', { key: 'b', style: { display: 'flex', gap: 6 } }, [
            e('button', { key: 'a', type: 'button', className: 'exu-btn pequeno', disabled: pagina === 0, onClick: () => setPagina(pagina - 1) }, 'Anterior'),
            e('button', { key: 'p', type: 'button', className: 'exu-btn pequeno', disabled: pagina >= totalPag - 1, onClick: () => setPagina(pagina + 1) }, 'Próxima'),
          ]),
        ]) : null,
      ]),
      e('p', { key: 'n', style: { margin: 0, fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 } }, [Icon('AlertCircle', 13, 'currentColor'), 'Tempo economizado: cada chamado resolvido conta os minutos que levaria à mão naquele tipo.']),
    ]);
  }

  function Disponibilidade({ de, ate }) {
    const [foco, setFoco] = useState(null);
    const [todos, setTodos] = useState(false);
    const curto = (ate - de) / DIA < 6;
    const iniFaixa = curto ? new Date(ate - 29 * DIA) : de; // período curto: a faixa mostra 30 dias para dar contexto
    const linhas = D.disponibilidade.map((a) => {
      const noPeriodo = a.dias.filter((d) => d.data >= de && d.data <= ate);
      const fora = noPeriodo.reduce((s, d) => s + d.quedas.reduce((t, q) => t + q.minutos, 0), 0);
      const quedas = noPeriodo.flatMap((d) => d.quedas.map((q) => Object.assign({ nome: a.nome }, q)));
      return { a, faixa: a.dias.filter((d) => d.data >= iniFaixa && d.data <= ate), fora, quedas, pct: 100 - (fora / (noPeriodo.length * 1440)) * 100 };
    });
    const quedas = linhas.flatMap((l) => l.quedas).sort((x, y) => y.inicio - x.inicio);
    const foraTotal = linhas.reduce((s, l) => s + l.fora, 0);
    const media = linhas.reduce((s, l) => s + l.pct, 0) / linhas.length;
    const corDia = (d) => { const m = d.quedas.reduce((t, q) => t + q.minutos, 0); return m === 0 ? '' : m < 15 ? ' alerta' : ' queda'; };
    const fmtPct = (p) => p.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    const kpi = (k, rot, val, det) => e('div', { key: k, className: 'exu-kpi' }, [e('div', { key: 'r', className: 'exu-kpi-rot' }, rot), e('div', { key: 'v', className: 'exu-kpi-val' }, val), e('div', { key: 'd', className: 'exu-kpi-det' }, det)]);
    return e(React.Fragment, null, [
      e('div', { key: 'k', className: 'exu-kpis' }, [
        kpi('m', 'Disponibilidade média', fmtPct(media), 'das ' + linhas.length + ' automações e serviços'),
        kpi('q', 'Quedas', num(quedas.length), quedas.length ? 'em ' + linhas.filter((l) => l.quedas.length).length + ' automações' : 'nenhuma no período'),
        kpi('f', 'Tempo fora do ar', duracao(foraTotal), 'somando todas'),
        kpi('v', 'Tempo médio para voltar', quedas.length ? duracao(foraTotal / quedas.length) : 'Sem dados', 'por queda'),
      ]),
      e(Cartao, {
        key: 'l', titulo: 'Automações', sub: curto ? 'A faixa mostra os últimos 30 dias; a porcentagem vale para o período escolhido.' : 'Cada bloco é um dia. Passe o mouse para ver as quedas.',
        acao: e('div', { className: 'exr-legenda' }, [e('span', { key: 'o' }, [e('i', { key: 'i', className: 'ok' }), 'Sem queda']), e('span', { key: 'a' }, [e('i', { key: 'i', className: 'alerta' }), 'Menos de 15 min fora']), e('span', { key: 'e' }, [e('i', { key: 'i', className: 'erro' }), '15 min ou mais fora'])]),
      }, [
        e('div', { key: 'l', className: 'exd-lista' }, linhas.map((l, li) => e('div', { key: l.a.nome, className: 'exd-linha' }, [
          e('div', { key: 'n', className: 'exd-nome' }, [e('b', { key: 'b', title: l.a.nome }, l.a.nome), e(Sit, { key: 's', tipo: l.a.agora === 'online' ? 'concluido' : 'erro', texto: l.a.agora === 'online' ? 'No ar' : 'Fora do ar' })]),
          e('div', { key: 'f', className: 'exd-faixa' }, l.faixa.map((d, i) => e('div', {
            key: i, className: 'exd-dia' + corDia(d), tabIndex: 0, 'aria-label': diaLongo(d.data) + ': ' + (d.quedas.length ? d.quedas.length + ' queda' : 'sem queda'),
            onMouseEnter: () => setFoco(li + ':' + i), onMouseLeave: () => setFoco(null), onFocus: () => setFoco(li + ':' + i), onBlur: () => setFoco(null),
          }, foco === li + ':' + i ? e('div', { className: 'exd-dica' + (i < l.faixa.length / 4 ? ' esq' : i > (l.faixa.length * 3) / 4 ? ' dir' : '') }, [
            e('b', { key: 'b', style: { display: 'block', marginBottom: 4 } }, diaLongo(d.data)),
            d.quedas.length ? d.quedas.map((q, k) => e('div', { key: k }, q.inicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' · ' + duracao(q.minutos) + ' · ' + q.motivo)) : e('div', { key: 's' }, 'Sem queda'),
          ]) : null))),
          e('div', { key: 'p', className: 'exd-pct', style: { color: l.pct < 99.5 ? 'var(--warn)' : 'var(--text)' } }, fmtPct(l.pct)),
        ]))),
        e('div', { key: 'x', className: 'exd-eixo', 'aria-hidden': 'true' }, [e('span', { key: 'a' }, dia(iniFaixa)), e('span', { key: 'b' }, dia(ate))]),
      ]),
      e(Cartao, { key: 'i', titulo: 'Quedas', sub: quedas.length ? 'Da mais recente para a mais antiga.' : 'Nenhuma queda no período.' }, quedas.length ? [
        e('ul', { key: 'l', className: 'exd-incidentes' }, quedas.slice(0, todos ? quedas.length : 8).map((q, i) => e('li', { key: i }, [
          e('span', { key: 'q', style: { color: 'var(--muted)', fontSize: 12.5 } }, dia(q.inicio) + ' ' + q.inicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })),
          e('div', { key: 'n' }, [e('b', { key: 'b', style: { fontWeight: 600 } }, q.nome), e('small', { key: 's' }, q.motivo)]),
          e(Sit, { key: 's', tipo: q.minutos >= 15 ? 'erro' : 'pendencia', texto: 'Fora por ' + duracao(q.minutos) }),
        ]))),
        quedas.length > 8 ? e('button', { key: 'b', type: 'button', className: 'exu-btn pequeno', style: { marginTop: 10 }, onClick: () => setTodos(!todos) }, todos ? 'Mostrar menos' : 'Ver todas as ' + quedas.length + ' quedas') : null,
      ] : e('div', { className: 'exc-vazio', style: { padding: 24 } }, 'Tudo no ar o período inteiro.')),
    ]);
  }

  function ExemploResultados() {
    const [aba, setAba] = useState('tratados');
    const [periodo, setPeriodo] = useState(() => ler('arxhub_exemplo_periodo', { chave: 'mes', comparar: true }));
    const [filtros, setFiltros] = useState({ assoc: '', tipo: '', origem: '' });
    const mudarPeriodo = (p) => { setPeriodo(p); gravar('arxhub_exemplo_periodo', p); };
    const [de, ate] = intervalo(periodo);
    const dias = diasEntre(de, ate);
    const n = dias.length;
    const antes = periodo.comparar && n ? diasEntre(new Date(de - n * DIA), new Date(de - DIA)) : null;
    const filtro = (k, rot, opcoes) => e('select', { key: k, className: 'exu-select', value: filtros[k], onChange: (ev) => setFiltros(Object.assign({}, filtros, { [k]: ev.target.value })), 'aria-label': rot }, opcoes.map(([v, t]) => e('option', { key: v, value: v }, t)));
    const temFiltro = filtros.assoc || filtros.tipo || filtros.origem;

    return e('div', { className: 'exu-tela' }, [
      e('header', { key: 'cab', className: 'exu-cab' }, [
        e('div', { key: 't' }, [
          e('h2', { key: 'h' }, 'Resultados'),
          e('p', { key: 'p' }, (n ? (n === 1 ? diaLongo(de) : diaLongo(de) + ' a ' + diaLongo(ate)) : 'Período sem dados') + ' · dados fictícios'),
        ]),
        e(SeletorPeriodo, { key: 'per', periodo, mudar: mudarPeriodo }),
      ]),
      e('div', { key: 'abas', className: 'exu-abas', role: 'tablist' }, [['tratados', 'Chamados tratados'], ['disp', 'Disponibilidade']].map(([k, t]) => e('button', {
        key: k, type: 'button', role: 'tab', className: 'exu-aba', 'aria-selected': aba === k ? 'true' : 'false', onClick: () => setAba(k),
      }, t))),
      aba === 'tratados' ? e('div', { key: 'f', className: 'exu-barra' }, [
        filtro('assoc', 'Associação', [['', 'Todas as associações'], ...D.ASSOCIACOES.map((a) => [a, a])]),
        filtro('tipo', 'Tipo', [['', 'Todos os tipos'], ...Object.keys(D.TIPOS).map((t) => [t, D.TIPOS[t].nome])]),
        filtro('origem', 'Origem', [['', 'Automático e manual'], ['automatico', 'Só automático'], ['manual', 'Só manual']]),
        temFiltro ? e('button', { key: 'l', type: 'button', className: 'exu-btn pequeno', onClick: () => setFiltros({ assoc: '', tipo: '', origem: '' }) }, 'Limpar filtros') : null,
      ]) : null,
      !n ? e('div', { key: 'v', className: 'exc-tabela' }, e('div', { className: 'exc-vazio' }, 'O exemplo tem dados dos últimos ' + D.porDia.length + ' dias. Escolha um período dentro deles.'))
        : aba === 'tratados' ? e(Tratados, { key: 't', dias, antes: antes && antes.length === n ? antes : null, filtros, periodo })
          : e(Disponibilidade, { key: 'd', de, ate }),
    ]);
  }

  window.ExemploResultados = ExemploResultados;
})();
