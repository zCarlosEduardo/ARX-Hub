// Gráficos em SVG/HTML puro da aba Resultados (sem biblioteca). Expõe window.Graficos.
// Os cálculos ficam em graficos-dados.js (puros e testados); aqui só o desenho.
//  - GraficoColunas: colunas empilhadas com eixo Y, grade, rótulos dd/mm, tooltip e foco por teclado.
//  - GraficoSemanas: GraficoColunas (concluído, erro, executando) + linha da taxa de erro logo abaixo.
//    A taxa fica em um segundo gráfico, com eixo próprio, e não em eixo duplo no mesmo plot.
//  - BarrasHorizontais: lista de barras empilhadas (concluído/erro) com valor em texto.
//  - Legenda: chave de cores que não depende só da cor (erro é hachurado).
(function () {
  const e = React.createElement;
  const { useState, useRef, useEffect } = React;
  const D = window.GraficosDados;

  // margens do plot (em px). Os dois gráficos semanais usam as mesmas para as colunas se alinharem.
  const ML = 40;
  const MR = 8;
  const GAP = 2; // vão entre segmentos empilhados
  const RAIO = 4;
  const COLUNA_MAX = 24;
  const LARGURA_PADRAO = 640;

  const numero1 = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  let sequencia = 0;
  const novoId = () => 'gfx' + ++sequencia;

  /** Largura real do contêiner (ResizeObserver); LARGURA_PADRAO enquanto não mede. */
  function useLargura() {
    const ref = useRef(null);
    const [largura, setLargura] = useState(LARGURA_PADRAO);
    useEffect(() => {
      const el = ref.current;
      if (!el) return undefined;
      const medir = () => {
        const l = Math.round(el.getBoundingClientRect().width);
        if (l > 0) setLargura(l);
      };
      medir();
      if (typeof ResizeObserver === 'function') {
        const ro = new ResizeObserver(medir);
        ro.observe(el);
        return () => ro.disconnect();
      }
      window.addEventListener('resize', medir);
      return () => window.removeEventListener('resize', medir);
    }, []);
    return [ref, largura];
  }

  const geometria = (largura, n) => {
    const pw = Math.max(10, largura - ML - MR);
    return { pw, banda: pw / Math.max(1, n) };
  };

  // ---------- peças ----------
  /** itens: [{ rotulo, classe, tracejada }]. O erro usa a mesma hachura do gráfico. */
  function Legenda({ itens }) {
    return e('div', { className: 'res-legenda', role: 'list' }, itens.map((it) =>
      e('span', { key: it.rotulo, role: 'listitem' }, [
        e('i', { key: 'i', className: it.tracejada ? 'res-sw-ref' : 'res-sw ' + it.classe, 'aria-hidden': 'true' }),
        it.rotulo,
      ])
    ));
  }

  function Vazio({ texto }) {
    return e('div', { className: 'gfx-vazio' }, texto);
  }

  /** Padrão hachurado do SVG (segundo canal além da cor). */
  function Hachura({ id, cor }) {
    return e('pattern', { id, width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, [
      e('rect', { key: 'f', width: 5, height: 5, style: { fill: cor } }),
      e('line', { key: 'l', x1: 0, y1: 0, x2: 0, y2: 5, style: { stroke: 'var(--card)', strokeWidth: 1.6, strokeOpacity: 0.5 } }),
    ]);
  }

  /** Navegação por setas entre as áreas focáveis de um gráfico. */
  function aoTeclar(ev, setFoco) {
    if (ev.key === 'Escape') {
      setFoco(null);
      return;
    }
    const vizinho = ev.key === 'ArrowRight' ? ev.currentTarget.nextElementSibling : ev.key === 'ArrowLeft' ? ev.currentTarget.previousElementSibling : null;
    if (vizinho && vizinho.classList && vizinho.classList.contains('gfx-hit')) {
      ev.preventDefault();
      vizinho.focus();
    }
  }

  function Eixos({ ticks, formatarTick, yDe, largura, rotulosX, xDe, baseY }) {
    return [
      ...ticks.map((t) => e('g', { key: 'tk' + t }, [
        e('line', { key: 'l', className: t === 0 ? 'gfx-base' : 'gfx-grade', x1: ML, x2: largura - MR, y1: yDe(t), y2: yDe(t) }),
        e('text', { key: 't', className: 'gfx-eixo', x: ML - 6, y: yDe(t) + 4, textAnchor: 'end' }, formatarTick(t)),
      ])),
      ...rotulosX.map((r) => e('text', { key: 'x' + r.i, className: 'gfx-eixo', x: xDe(r.i), y: baseY + 17, textAnchor: 'middle' }, r.rotulo)),
    ];
  }

  // ---------- colunas empilhadas ----------
  /**
   * SVG de colunas. Controlado: o contêiner guarda o foco (para o tooltip e para alinhar com outros gráficos).
   * pontos: [{ chave, rotulo, valores, aria }]; series: [{ chave, cor, textura }].
   */
  function Colunas({ largura, altura, pontos, series, escala, formatarTick, referencia, foco, setFoco, ariaLabel }) {
    const [id] = useState(novoId);
    const n = pontos.length;
    const MT = 10;
    const MB = 26;
    const { pw, banda } = geometria(largura, n);
    const ph = altura - MT - MB;
    const base = MT + ph;
    const yDe = (v) => base - (v / escala.topo) * ph;
    const xDe = (i) => ML + (i + 0.5) * banda;
    const larg = Math.min(COLUNA_MAX, Math.max(4, banda * 0.7));
    const passo = D.passoRotulos(n, pw, 44);
    const rotulosX = pontos.map((p, i) => ({ i, rotulo: p.rotulo })).filter((r) => r.i % passo === 0);
    const preench = (s) => (s.textura ? `url(#${id}-${s.chave})` : s.cor);
    return e('svg', { width: largura, height: altura, viewBox: `0 0 ${largura} ${altura}`, role: 'img', 'aria-label': ariaLabel, className: 'gfx-svg' }, [
      e('defs', { key: 'd' }, series.filter((s) => s.textura).map((s) => e(Hachura, { key: s.chave, id: `${id}-${s.chave}`, cor: s.cor }))),
      foco !== null && foco !== undefined ? e('rect', { key: 'foco', className: 'gfx-foco', x: ML + foco * banda, y: MT, width: banda, height: ph }) : null,
      ...Eixos({ ticks: escala.ticks, formatarTick, yDe, largura, rotulosX, xDe, baseY: base }),
      ...pontos.map((p, i) => e('g', { key: 'c' + p.chave }, D.empilhar(p.valores, series, escala.topo, ph, base, GAP).map((seg) => {
        const serie = series.find((s) => s.chave === seg.chave);
        const x = xDe(i) - larg / 2;
        return seg.topo
          ? e('path', { key: seg.chave, d: D.caminhoColuna(x, seg.y, larg, seg.h, RAIO), style: { fill: preench(serie) } })
          : e('rect', { key: seg.chave, x, y: seg.y, width: larg, height: seg.h, style: { fill: preench(serie) } });
      }))),
      referencia
        ? e('line', { key: 'ref', className: 'gfx-ref', x1: ML, x2: largura - MR, y1: yDe(Math.min(referencia.valor, escala.topo)), y2: yDe(Math.min(referencia.valor, escala.topo)) })
        : null,
      ...pontos.map((p, i) => e('rect', {
        key: 'h' + p.chave, className: 'gfx-hit', x: ML + i * banda, y: MT, width: banda, height: ph + MB, tabIndex: 0, 'aria-label': p.aria,
        onMouseEnter: () => setFoco(i), onMouseLeave: () => setFoco(null), onFocus: () => setFoco(i), onBlur: () => setFoco(null),
        onClick: () => setFoco(foco === i ? null : i), onKeyDown: (ev) => aoTeclar(ev, setFoco),
      })),
    ]);
  }

  /** Posição horizontal do tooltip sobre o gráfico, sem sair da área. */
  function Tooltip({ largura, n, foco, children }) {
    const { banda } = geometria(largura, n);
    const centro = ML + (foco + 0.5) * banda;
    const deslocar = centro < largura * 0.25 ? 'translateX(-15%)' : centro > largura * 0.75 ? 'translateX(-85%)' : 'translateX(-50%)';
    return e('div', { className: 'res-tip', 'aria-hidden': 'true', style: { left: centro, transform: deslocar } }, children);
  }

  /**
   * Gráfico de colunas completo (largura medida, tooltip, estado vazio).
   * props: pontos, series, escala {topo,ticks}, formatarTick, referencia {valor}, ariaLabel, tooltip(p)->nós, abaixo(ctx)->nó, vazio (texto)
   */
  function GraficoColunas({ pontos, series, escala, formatarTick, referencia, ariaLabel, tooltip, abaixo, vazio, altura }) {
    const [ref, largura] = useLargura();
    const [foco, setFoco] = useState(null);
    if (!pontos.length || pontos.every((p) => series.every((s) => !p.valores[s.chave]))) return e(Vazio, { texto: vazio });
    const p = foco !== null && foco !== undefined ? pontos[foco] : null;
    return e('div', { ref, className: 'gfx', onMouseLeave: () => setFoco(null) }, [
      e(Colunas, { key: 'c', largura, altura: altura || 220, pontos, series, escala, formatarTick, referencia, foco, setFoco, ariaLabel }),
      abaixo ? abaixo({ largura, foco, setFoco }) : null,
      p ? e(Tooltip, { key: 'tip', largura, n: pontos.length, foco }, tooltip(p)) : null,
    ]);
  }

  // ---------- taxa de erro (linha) ----------
  function LinhaTaxa({ largura, pontos, foco, setFoco, ariaLabel, altura }) {
    const n = pontos.length;
    const MT = 14;
    const MB = 26;
    const { pw, banda } = geometria(largura, n);
    const ph = altura - MT - MB;
    const base = MT + ph;
    const maxTaxa = Math.max(0, ...pontos.map((p) => (p.taxaErro === null ? 0 : p.taxaErro)));
    const topo = D.topoPercentual(maxTaxa);
    const yDe = (v) => base - (v / topo) * ph;
    const xDe = (i) => ML + (i + 0.5) * banda;
    const passo = D.passoRotulos(n, pw, 44);
    const rotulosX = pontos.map((p, i) => ({ i, rotulo: p.rotulo })).filter((r) => r.i % passo === 0);
    // trechos contínuos: uma semana sem execuções finalizadas interrompe a linha
    const trechos = [];
    pontos.forEach((p, i) => {
      if (p.taxaErro === null) {
        trechos.push([]);
        return;
      }
      if (!trechos.length) trechos.push([]);
      trechos[trechos.length - 1].push([xDe(i), yDe(p.taxaErro), i]);
    });
    const visiveis = pontos.map((p, i) => ({ p, i })).filter((x) => x.p.taxaErro !== null);
    const ultimo = visiveis[visiveis.length - 1];
    return e('svg', { width: largura, height: altura, viewBox: `0 0 ${largura} ${altura}`, role: 'img', 'aria-label': ariaLabel, className: 'gfx-svg' }, [
      foco !== null && foco !== undefined ? e('rect', { key: 'foco', className: 'gfx-foco', x: ML + foco * banda, y: MT - 4, width: banda, height: ph + 4 }) : null,
      ...Eixos({ ticks: D.ticksPercentual(topo), formatarTick: (t) => D.formatarPct(t, 0), yDe, largura, rotulosX, xDe, baseY: base }),
      ...trechos.filter((t) => t.length > 1).map((t, k) => e('polyline', { key: 'ln' + k, className: 'gfx-linha', points: t.map((q) => `${q[0]},${q[1]}`).join(' ') })),
      ...visiveis.map(({ p, i }) => e('circle', { key: 'pt' + p.chave, className: 'gfx-ponto', cx: xDe(i), cy: yDe(p.taxaErro), r: 4 })),
      ultimo
        ? e('text', { key: 'ult', className: 'gfx-valor', x: xDe(ultimo.i), y: yDe(ultimo.p.taxaErro) - 9, textAnchor: ultimo.i > n - 3 ? 'end' : 'middle' }, D.formatarPct(ultimo.p.taxaErro))
        : null,
      ...pontos.map((p, i) => e('rect', {
        key: 'h' + p.chave, className: 'gfx-hit', x: ML + i * banda, y: MT - 4, width: banda, height: ph + MB + 4, tabIndex: 0, 'aria-label': p.aria,
        onMouseEnter: () => setFoco(i), onMouseLeave: () => setFoco(null), onFocus: () => setFoco(i), onBlur: () => setFoco(null),
        onClick: () => setFoco(foco === i ? null : i), onKeyDown: (ev) => aoTeclar(ev, setFoco),
      })),
    ]);
  }

  // ---------- gráfico semanal ----------
  const SERIES_SEMANAS = [
    { chave: 'concluido', cor: 'var(--accent)' },
    { chave: 'erro', cor: 'var(--error)', textura: true },
    { chave: 'executando', cor: 'var(--muted-soft)' },
  ];

  /** props: semanas (resumo.semanas), anterior (resumo.anterior, opcional). */
  function GraficoSemanas({ semanas, anterior }) {
    const pontos = D.pontosSemanas(semanas).map((p) => ({
      ...p,
      aria: `Semana de ${p.periodo}: ${D.plural(p.concluido, 'concluída', 'concluídas')}, ${p.erro} com erro${p.executando ? `, ${p.executando} em execução` : ''}. Taxa de erro: ${D.formatarPct(p.taxaErro)}.`,
    }));
    const ref = D.mediaSemanalAnterior(anterior);
    const maxSoma = Math.max(1, ...pontos.map((p) => p.soma), ref ? ref.media : 0);
    const topo = D.topoEixo(maxSoma);
    const escala = { topo, ticks: D.ticksEixo(topo) };
    const resumo = D.resumoSemanas(pontos);
    const itensLegenda = [
      { rotulo: 'Concluído', classe: 'res-ok' },
      { rotulo: 'Erro', classe: 'res-erro' },
      ...(resumo.executando ? [{ rotulo: 'Em execução', classe: 'res-exec' }] : []),
      ...(ref ? [{ rotulo: `Média semanal do período anterior: ${numero1(ref.media)}`, tracejada: true }] : []),
    ];
    return e('div', { className: 'gfx-bloco' }, [
      e(Legenda, { key: 'lg', itens: itensLegenda }),
      e(GraficoColunas, {
        key: 'gr',
        pontos,
        series: SERIES_SEMANAS,
        escala,
        formatarTick: (t) => t.toLocaleString('pt-BR'),
        referencia: ref ? { valor: ref.media } : null,
        ariaLabel: D.descricaoColunas(pontos, ref),
        vazio: 'Nenhuma execução no período.',
        tooltip: (p) => [
          e('div', { key: 't', style: { fontWeight: 600, marginBottom: 4 } }, p.periodo),
          e('div', { key: 'c' }, [e('i', { key: 'i', className: 'res-sw res-ok', 'aria-hidden': 'true' }), D.plural(p.concluido, 'concluído', 'concluídos')]),
          e('div', { key: 'e' }, [e('i', { key: 'i', className: 'res-sw res-erro', 'aria-hidden': 'true' }), D.plural(p.erro, 'com erro', 'com erro')]),
          p.executando ? e('div', { key: 'x' }, [e('i', { key: 'i', className: 'res-sw res-exec', 'aria-hidden': 'true' }), `${D.plural(p.executando, 'em execução', 'em execução')}`]) : null,
          e('div', { key: 'tx', style: { color: 'var(--muted)', marginTop: 2 } }, `Taxa de erro: ${D.formatarPct(p.taxaErro)}`),
          ref ? e('div', { key: 'rf', style: { color: 'var(--muted)' } }, `Média anterior: ${numero1(ref.media)} por semana`) : null,
        ],
        abaixo: ({ largura, foco, setFoco }) =>
          e('div', { key: 'taxa', className: 'gfx-sub' }, [
            e('div', { key: 't', className: 'gfx-sub-titulo' }, 'Taxa de erro por semana'),
            e(LinhaTaxa, { key: 'l', largura, pontos, foco, setFoco, altura: 130, ariaLabel: D.descricaoTaxa(pontos) }),
          ]),
      }),
    ]);
  }

  // ---------- barras horizontais ----------
  /**
   * itens: [{ chave, rotulo, valores: { concluido, erro }, total, detalhe }]. Escala comum: o maior total.
   * Cada linha mostra os números em texto; a barra é complemento.
   */
  function BarrasHorizontais({ itens, ariaLabel, vazio }) {
    if (!itens.length) return e(Vazio, { texto: vazio });
    const maior = Math.max(1, ...itens.map((i) => i.total));
    return e('ul', { className: 'gfx-hbar', 'aria-label': ariaLabel }, itens.map((it) => {
      const segs = [
        { chave: 'concluido', n: it.valores.concluido, classe: 'res-ok' },
        { chave: 'erro', n: it.valores.erro, classe: 'res-erro' },
      ].filter((s) => s.n > 0);
      const descricao = `${it.rotulo}: ${D.plural(it.valores.concluido, 'concluído', 'concluídos')}, ${it.valores.erro} com erro`;
      return e('li', { key: it.chave, className: 'gfx-hbar-item' }, [
        e('div', { key: 'topo', className: 'gfx-hbar-topo' }, [
          e('span', { key: 'n', className: 'gfx-hbar-nome', title: it.rotulo }, it.rotulo),
          e('span', { key: 'v', className: 'gfx-hbar-valor' }, it.detalhe),
        ]),
        e('div', { key: 'tr', className: 'gfx-hbar-trilho', role: 'img', 'aria-label': descricao, title: descricao },
          segs.map((s, k) =>
            e('div', {
              key: s.chave,
              className: 'gfx-hbar-seg ' + s.classe,
              style: { width: `${(s.n / maior) * 100}%`, marginLeft: k ? GAP : 0, borderRadius: k === segs.length - 1 ? `0 ${RAIO}px ${RAIO}px 0` : 0 },
            })
          )),
      ]);
    }));
  }

  window.Graficos = { GraficoColunas, GraficoSemanas, BarrasHorizontais, Legenda, LinhaTaxa, Colunas };
})();
