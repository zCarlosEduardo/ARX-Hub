// Disponibilidade: histórico de quedas e voltas das automações, do banco-central, do GLPI e dos tokens do SGA.
// Expõe window.DisponibilidadeView (aba "Disponibilidade" dentro de Resultados).
// Quem grava é o monitor do chamados-glpi (porta 4013): a cada ciclo (5 min) ele vê o que parou e o que voltou
// e guarda no banco-central (tabela alertas_historico). Aqui só mostra: quantas vezes parou, por quanto tempo
// ficou fora, quanto levou pra voltar e quando.
(function () {
  const e = React.createElement;
  const { useState, useEffect, useCallback } = React;
  const { Icon } = window.Icons;
  const { GraficoColunas } = window.Graficos;
  const D = window.GraficosDados;

  const SERVICO = `${location.origin}/servicos/chamados`;
  const KEY = 'arxhub_disponibilidade_filtro';

  const ler = (k, padrao) => {
    try {
      const v = localStorage.getItem(k);
      return v === null ? padrao : JSON.parse(v);
    } catch {
      return padrao;
    }
  };
  const gravar = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      // sem storage: vale só enquanto a tela estiver aberta
    }
  };

  const S = {
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadeInUp 0.3s ease both', minWidth: 0 },
    titulo: { fontWeight: 600, fontSize: 14 },
    sub: { color: 'var(--muted-soft)', fontSize: 12, marginTop: 2 },
    input: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 9px', color: 'var(--text)', fontSize: 12.5, fontFamily: 'inherit' },
    btnSec: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 14px', background: 'var(--secondary)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
    tag: (cor) => ({ display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 600, background: cor + '22', color: cor, whiteSpace: 'nowrap' }),
    chip: (sel) => ({ padding: '5px 11px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid ' + (sel ? 'var(--accent)' : 'var(--border)'), background: sel ? 'var(--accent-soft)' : 'transparent', color: sel ? 'var(--accent)' : 'var(--muted)' }),
  };
  const PERIODOS = [
    { id: '7', rotulo: '7 dias', dias: 7 },
    { id: '30', rotulo: '30 dias', dias: 30 },
    { id: '90', rotulo: '90 dias', dias: 90 },
    { id: 'datas', rotulo: 'Datas' },
  ];

  // ---------- formatação ----------
  const isoLocal = (d) => d.toLocaleDateString('en-CA');
  const hoje = () => isoLocal(new Date());
  const diasAtras = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1));
    return isoLocal(d);
  };
  const num = (n) => Number(n || 0).toLocaleString('pt-BR');
  const plural = (n, um, varios) => `${num(n)} ${n === 1 ? um : varios}`;
  const dataCurta = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
  const dataBr = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
  const quando = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Não informado');
  function duracao(seg) {
    if (seg === null || seg === undefined) return 'Sem dados';
    if (seg < 90) return `${seg} s`;
    if (seg < 5400) return `${Math.round(seg / 60)} min`;
    const h = Math.floor(seg / 3600);
    const m = Math.round((seg % 3600) / 60);
    if (h < 48) return m ? `${h} h ${m} min` : `${h} h`;
    const d = Math.floor(h / 24);
    return `${d} d ${h % 24} h`;
  }

  // ---------- peças ----------
  function Numero({ rotulo, valor, sub, icone, cor }) {
    return e('div', { className: 'res-kpi', style: { ...S.card, gap: 6 } }, [
      e('div', { key: 'r', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } }, [
        e('div', { key: 'l', style: { fontSize: 12, color: 'var(--muted)', fontWeight: 600 } }, rotulo),
        icone ? e('span', { key: 's', style: { display: 'flex' } }, Icon(icone, 15, cor || 'var(--muted-soft)')) : null,
      ]),
      e('div', { key: 'v', style: { fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.15, fontVariantNumeric: 'tabular-nums', color: cor || 'var(--text)' } }, valor),
      e('div', { key: 'su', style: { fontSize: 12, color: 'var(--muted-soft)', lineHeight: 1.4 } }, sub),
    ]);
  }

  const SERIE_QUEDAS = [{ chave: 'quedas', cor: 'var(--error)', textura: true }];
  const SERIE_TEMPO = [{ chave: 'tempo', cor: 'var(--error)' }];
  const dataTip = (p) => e('div', { key: 't', style: { fontWeight: 600, marginBottom: 4 } }, D.dataBr(p.dia));

  /** Colunas: quedas que começaram em cada dia (hachurado, como o erro nos chamados). */
  function GraficoQuedasDias({ dias }) {
    const pontos = dias.map((x) => ({
      chave: x.dia, dia: x.dia, rotulo: D.dataCurta(x.dia), valor: x.quedas, valores: { quedas: x.quedas }, quedas: x.quedas, tempoForaSeg: x.tempoForaSeg || 0,
      aria: `${D.dataBr(x.dia)}: ${D.plural(x.quedas, 'queda', 'quedas')}${x.quedas ? `, ${D.duracaoLonga(x.tempoForaSeg)} fora do ar` : ''}.`,
    }));
    const topo = D.topoEixo(Math.max(1, ...pontos.map((p) => p.quedas)));
    return e(GraficoColunas, {
      pontos,
      series: SERIE_QUEDAS,
      escala: { topo, ticks: D.ticksEixo(topo) },
      formatarTick: (t) => t.toLocaleString('pt-BR'),
      ariaLabel: D.descricaoDias(pontos, 'Gráfico de colunas das quedas por dia', (v) => D.plural(v, 'queda', 'quedas')),
      vazio: 'Nenhuma queda no período.',
      tooltip: (p) => [
        dataTip(p),
        e('div', { key: 'q' }, [e('i', { key: 'i', className: 'res-sw res-erro', 'aria-hidden': 'true' }), D.plural(p.quedas, 'queda', 'quedas')]),
        p.quedas ? e('div', { key: 'f', style: { color: 'var(--muted)', marginTop: 2 } }, `${D.duracaoLonga(p.tempoForaSeg)} fora do ar no total`) : null,
      ],
    });
  }

  /** Colunas: tempo fora do ar somado por dia (eixo em minutos ou horas). */
  function GraficoTempoDias({ dias }) {
    const pontos = dias.map((x) => ({
      chave: x.dia, dia: x.dia, rotulo: D.dataCurta(x.dia), valor: x.tempoForaSeg || 0, valores: { tempo: x.tempoForaSeg || 0 }, quedas: x.quedas, tempoForaSeg: x.tempoForaSeg || 0,
      aria: `${D.dataBr(x.dia)}: ${x.tempoForaSeg ? D.duracaoLonga(x.tempoForaSeg) + ' fora do ar' : 'sem tempo fora do ar'}.`,
    }));
    const escala = D.escalaDuracao(Math.max(0, ...pontos.map((p) => p.valor)));
    return e(GraficoColunas, {
      pontos,
      series: SERIE_TEMPO,
      escala,
      formatarTick: D.formatarDuracaoCurta,
      ariaLabel: D.descricaoDias(pontos, 'Gráfico de colunas do tempo fora do ar por dia', D.duracaoLonga),
      vazio: 'Nenhum tempo fora do ar no período.',
      tooltip: (p) => [
        dataTip(p),
        e('div', { key: 'f' }, [e('i', { key: 'i', className: 'res-sw', style: { background: 'var(--error)' }, 'aria-hidden': 'true' }), `${D.duracaoLonga(p.tempoForaSeg)} fora do ar`]),
        e('div', { key: 'q', style: { color: 'var(--muted)', marginTop: 2 } }, D.plural(p.quedas, 'queda', 'quedas')),
      ],
    });
  }

  const tabela = (cabecalhos, linhas) =>
    e('div', { key: 'tab', style: { overflowX: 'auto' } }, e('table', { className: 'res-tabela' }, [
      e('thead', { key: 'h' }, e('tr', null, cabecalhos.map((c, i) => e('th', { key: i, style: { textAlign: i ? 'right' : 'left' } }, c)))),
      e('tbody', { key: 'b' }, linhas),
    ]));
  const cabecalhoCard = (titulo, sub) => e('div', { key: 'h' }, [e('div', { key: 'a', style: S.titulo }, titulo), e('div', { key: 'b', style: S.sub }, sub)]);

  // ---------- tela ----------
  function DisponibilidadeView() {
    const [salvo] = useState(() => ler(KEY, null) || {});
    const [periodo, setPeriodo] = useState(PERIODOS.some((p) => p.id === salvo.periodo) ? salvo.periodo : '30');
    const [datas, setDatas] = useState({ desde: salvo.desde || diasAtras(30), ate: salvo.ate || hoje() });
    const [soErros, setSoErros] = useState(!!salvo.soErros);
    const [chaveSel, setChaveSel] = useState('');
    const [estado, setEstado] = useState({ carregando: true, dados: null, erro: null });

    const p = PERIODOS.find((x) => x.id === periodo);
    const filtro = p && p.dias ? { desde: diasAtras(p.dias), ate: hoje() } : datas;
    const datasOk = /^\d{4}-\d{2}-\d{2}$/.test(filtro.desde) && /^\d{4}-\d{2}-\d{2}$/.test(filtro.ate) && filtro.desde <= filtro.ate;

    const buscar = useCallback(async () => {
      if (!datasOk) return;
      setEstado((x) => ({ ...x, carregando: true, erro: null }));
      try {
        const q = new URLSearchParams({ desde: filtro.desde, ate: filtro.ate });
        if (soErros) q.set('nivel', 'erro');
        const resp = await fetch(`${SERVICO}/api/alertas/historico?${q}`);
        if (resp.status === 404) throw new Error('o chamados-glpi não possui o histórico de alertas (serviço desatualizado)');
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.error || `HTTP ${resp.status}`);
        setEstado({ carregando: false, dados, erro: null, em: new Date() });
      } catch (err) {
        setEstado((x) => ({ ...x, carregando: false, erro: err.name === 'TypeError' ? 'o chamados-glpi não respondeu' : err.message }));
      }
    }, [filtro.desde, filtro.ate, soErros, datasOk]);

    useEffect(() => {
      buscar();
    }, [buscar]);
    useEffect(() => {
      gravar(KEY, { periodo, desde: datas.desde, ate: datas.ate, soErros });
    }, [periodo, datas.desde, datas.ate, soErros]);

    const { dados, carregando, erro } = estado;

    const cabecalho = e('div', { key: 'head', style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' } }, [
      e('div', { key: 't' }, [
        e('div', { key: 'n', style: { fontWeight: 600, fontSize: 19 } }, 'Disponibilidade'),
        e('div', { key: 's', style: { color: 'var(--muted-soft)', fontSize: 12.5, marginTop: 4 } },
          `Quedas e voltas das automações e integrações · ${dataBr(filtro.desde)} a ${dataBr(filtro.ate)}${estado.em ? ' · atualizado ' + estado.em.toLocaleTimeString('pt-BR') : ''}`),
      ]),
      e('div', { key: 'f', style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } }, [
        ...PERIODOS.map((x) => e('button', { key: x.id, style: S.chip(periodo === x.id), onClick: () => setPeriodo(x.id) }, x.rotulo)),
        periodo === 'datas'
          ? e('span', { key: 'd', style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' } }, [
              e('input', { key: 'a', type: 'date', className: 'field-input', value: datas.desde, max: datas.ate, onChange: (ev) => setDatas((d) => ({ ...d, desde: ev.target.value })), style: S.input, 'aria-label': 'De' }),
              'a',
              e('input', { key: 'b', type: 'date', className: 'field-input', value: datas.ate, min: datas.desde, onChange: (ev) => setDatas((d) => ({ ...d, ate: ev.target.value })), style: S.input, 'aria-label': 'Até' }),
            ])
          : null,
        e('button', { key: 'er', style: S.chip(soErros), onClick: () => setSoErros((v) => !v), title: 'Oculta os avisos (token sem permissão, erro de login etc.) e mantém apenas o que parou' }, 'Só quedas (erros)'),
        e('button', { key: 'rf', style: S.btnSec, disabled: carregando, onClick: buscar }, [
          e('span', { key: 'i', style: { display: 'flex', animation: carregando ? 'spin 1s linear infinite' : 'none' } }, Icon('RefreshCw', 14)),
          e('span', { key: 't' }, carregando ? 'Buscando…' : 'Atualizar'),
        ]),
      ]),
    ]);

    function painel(d) {
      const t = d.totais;
      const incidentes = chaveSel ? d.incidentes.filter((i) => i.chave === chaveSel) : d.incidentes;
      const nomeSel = chaveSel && (d.porServico.find((x) => x.chave === chaveSel) || {}).titulo;
      return e('div', { key: 'painel', style: { display: 'flex', flexDirection: 'column', gap: 16 } }, [
        e('div', { key: 'kpis', className: 'res-kpis', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 } }, [
          e(Numero, { key: 'q', rotulo: 'Quedas no período', valor: num(t.quedas), icone: 'AlertCircle', cor: t.abertas ? 'var(--error)' : undefined, sub: t.quedas ? `${plural(t.erros, 'parada', 'paradas')} e ${plural(t.avisos, 'aviso', 'avisos')} em ${plural(t.itensAfetados, 'item', 'itens')}${t.abertas ? ` · ${plural(t.abertas, 'ainda com problema', 'ainda com problema')} neste momento` : ''}` : 'Nada parou neste período.' }),
          e(Numero, { key: 'f', rotulo: 'Tempo fora do ar', valor: t.quedas ? duracao(t.tempoForaSeg) : '0', icone: 'Activity', sub: 'Soma de todas as quedas (do começo até a volta, ou até agora se ainda estiver fora).' }),
          e(Numero, { key: 'm', rotulo: 'Tempo médio para voltar', valor: duracao(t.tempoMedioParaVoltarSeg), icone: 'RefreshCw', sub: t.tempoMedioParaVoltarSeg === null ? 'Nenhuma queda foi normalizada neste período.' : 'Média entre o início do problema e a normalização.' }),
          e(Numero, { key: 'x', rotulo: 'Maior queda', valor: t.quedas ? duracao(t.maiorQuedaSeg) : 'Sem dados', icone: 'BarChart3', sub: 'A queda que ficou mais tempo fora no período.' }),
        ]),
        e('div', { key: 'graf', style: S.card }, [
          cabecalhoCard('Quedas por dia', 'Cada queda conta no dia em que começou. Posicione o cursor ou use o teclado sobre um dia para ver o tempo fora do ar.'),
          e(GraficoQuedasDias, { key: 'g', dias: d.porDia }),
        ]),
        e('div', { key: 'tempo', style: S.card }, [
          cabecalhoCard('Tempo fora do ar por dia', 'Soma da duração das quedas que começaram em cada dia.'),
          e(GraficoTempoDias, { key: 'g', dias: d.porDia }),
        ]),
        e('div', { key: 'serv', style: S.card }, [
          cabecalhoCard('Por serviço', 'Quantidade de paradas por serviço e tempo até a normalização. Clique em uma linha para filtrar as quedas do serviço.'),
          d.porServico.length
            ? tabela(['Serviço', 'Quedas', 'Tempo fora', 'Voltou em (média)', 'Última queda', 'Última volta', 'Agora'],
                d.porServico.map((s) =>
                  e('tr', { key: s.chave, onClick: () => setChaveSel(chaveSel === s.chave ? '' : s.chave), style: { cursor: 'pointer', background: chaveSel === s.chave ? 'var(--accent-soft)' : undefined } }, [
                    e('td', { key: 'n' }, [s.titulo, ' ', s.nivel === 'aviso' ? e('span', { key: 'a', style: { ...S.tag('#d97706'), background: 'var(--warn-tint)', color: 'var(--warn)' } }, 'aviso') : null]),
                    e('td', { key: 'q' }, num(s.quedas)),
                    e('td', { key: 'f' }, duracao(s.tempoForaSeg)),
                    e('td', { key: 'm' }, duracao(s.tempoMedioParaVoltarSeg)),
                    e('td', { key: 'u' }, quando(s.ultimaQuedaEm)),
                    e('td', { key: 'v' }, s.ultimaVoltaEm ? quando(s.ultimaVoltaEm) : 'Não informado'),
                    e('td', { key: 'a' }, s.abertas ? e('span', { style: S.tag('#F5514D') }, 'com problema') : e('span', { style: S.tag('#6DBE6A') }, 'ok')),
                  ])
                )
              )
            : e('div', { key: 'v', style: { color: 'var(--muted-soft)', fontSize: 13 } }, 'Nenhum serviço parou neste período.'),
        ]),
        e('div', { key: 'inc', style: S.card }, [
          e('div', { key: 'cab', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' } }, [
            cabecalhoCard('Quedas e voltas', `Do mais recente para o mais antigo${chaveSel ? ` · só "${nomeSel}"` : ''}. Mostra até 100.`),
            chaveSel ? e('button', { key: 'l', style: { ...S.chip(false) }, onClick: () => setChaveSel('') }, 'Ver todos') : null,
          ]),
          incidentes.length
            ? tabela(['Problema', 'Começou', 'Voltou', 'Ficou fora'],
                incidentes.map((i) =>
                  e('tr', { key: i.id }, [
                    e('td', { key: 't', title: i.detalhe || '' }, [i.titulo, ' ', i.nivel === 'aviso' ? e('span', { key: 'a', style: { ...S.tag('#d97706'), background: 'var(--warn-tint)', color: 'var(--warn)' } }, 'aviso') : null]),
                    e('td', { key: 'c' }, quando(i.iniciadoEm)),
                    e('td', { key: 'v' }, i.aberto ? e('span', { style: S.tag('#F5514D') }, 'ainda com problema') : quando(i.resolvidoEm)),
                    e('td', { key: 'd' }, duracao(i.duracaoSeg)),
                  ])
                )
              )
            : e('div', { key: 'v', style: { color: 'var(--muted-soft)', fontSize: 13 } }, 'Nenhuma queda para mostrar.'),
        ]),
        e('div', { key: 'nota', style: { color: 'var(--muted-soft)', fontSize: 12, lineHeight: 1.5 } },
          `O monitor verifica os serviços a cada poucos minutos. Os horários de início e de retorno têm essa margem, e quedas mais curtas podem não ser registradas. ${d.naFila ? `${plural(d.naFila, 'evento aguarda', 'eventos aguardam')} gravação (banco-central fora do ar).` : ''}`),
      ]);
    }

    let corpo;
    if (!datasOk) corpo = e('div', { key: 'datas', style: { color: 'var(--warn)', fontSize: 13.5, padding: '20px 0' } }, 'Informe as duas datas. A data inicial deve ser anterior à final.');
    else if (erro && !dados) corpo = e('div', { key: 'erro', style: { color: 'var(--error)', fontSize: 13.5, padding: '20px 0' } }, 'Falha ao buscar o histórico: ' + erro);
    else if (!dados) corpo = e('div', { key: 'load', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--muted-soft)', padding: '50px 20px' } }, [e('span', { key: 's', style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 22, 'var(--accent)')), 'Buscando o histórico…']);
    else corpo = painel(dados);

    return e('div', { style: { padding: '8px 24px 96px', maxWidth: 1200, margin: '0 auto' } }, [cabecalho, corpo]);
  }

  window.DisponibilidadeView = DisponibilidadeView;
  window.DisponibilidadeGraficos = { GraficoQuedasDias, GraficoTempoDias }; // usados nos testes de renderização
})();
