// Resultados: painel com os chamados resolvidos pelas automações (dados do banco-central via chamados-glpi).
// Expõe window.ResultadosView (aba fixa Resultados do app.js).
// Quem monta os números é o banco-central (tabela chamados_automacao); o
// chamados-glpi (porta 4013) repassa e soma o tempo economizado (estimativa:
// chamados concluídos x minutos que levaria fazer à mão, por tipo).
(function () {
  const e = React.createElement;
  const { useState, useEffect, useCallback } = React;
  const { Icon } = window.Icons;

  const SERVICO = `${location.protocol}//${location.hostname}:4013`;
  const KEY_PERIODO = 'arxhub_resultados_periodo';

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

  // mesmo visual dos cards da aba Chamados
  const S = {
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadeInUp 0.3s ease both', minWidth: 0 },
    titulo: { fontWeight: 600, fontSize: 14 },
    sub: { color: 'var(--muted-soft)', fontSize: 12, marginTop: 2 },
    input: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 9px', color: 'var(--text)', fontSize: 12.5, fontFamily: 'inherit' },
    btnSec: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 14px', background: 'var(--secondary)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
    link: { background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: 0 },
    tag: (cor) => ({ display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 600, background: cor + '22', color: cor, whiteSpace: 'nowrap' }),
    chip: (sel) => ({ padding: '5px 11px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid ' + (sel ? 'var(--accent)' : 'var(--border)'), background: sel ? 'var(--accent-soft)' : 'transparent', color: sel ? 'var(--accent)' : 'var(--muted)' }),
  };
  const NOMES_TIPO = { fechamento: 'Fechamento p/ cobrança', cadastro_consultor: 'Cadastro de consultor', cadastro_usuario: 'Cadastro de usuário', inativacao_consultor: 'Inativação de consultor', bloqueio_acesso: 'Bloqueio de acesso', cadastro_modelo: 'Cadastro de modelo (FIPE)', erro_exportar_modelo: 'Modelo não encontrado (exportar card)', senha_crm: 'Senha do CRM (resposta padrão)', foto_perfil: 'Foto de perfil' };
  const COR_TIPO = { fechamento: '#F5A524', cadastro_consultor: '#6DBE6A', cadastro_usuario: '#3B82F6', inativacao_consultor: '#F5514D', bloqueio_acesso: '#8B5CF6', cadastro_modelo: '#0EA5A4', erro_exportar_modelo: '#EC4899', senha_crm: '#64748B', foto_perfil: '#D946EF' };
  const MIN_FINALIZADAS_ALERTA = 3; // associação com menos que isso não entra no destaque (amostra pequena)
  const TAXA_ALTA = 0.25;
  const PERIODOS = [
    { id: '4', rotulo: '4 semanas', semanas: 4 },
    { id: '12', rotulo: '12 semanas', semanas: 12 },
    { id: '26', rotulo: '26 semanas', semanas: 26 },
    { id: 'datas', rotulo: 'Datas' },
  ];

  // ---------- formatação ----------
  const isoLocal = (d) => d.toLocaleDateString('en-CA'); // yyyy-mm-dd no fuso do navegador
  const hoje = () => isoLocal(new Date());
  /** Segunda-feira de N-1 semanas atrás (a semana atual conta como uma). */
  function inicioSemanas(n) {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - (n - 1) * 7);
    return isoLocal(d);
  }
  const num = (n) => Number(n || 0).toLocaleString('pt-BR');
  const pct = (x) => (x === null || x === undefined ? '—' : (x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%');
  const dataCurta = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
  const dataBr = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
  function duracao(seg) {
    if (seg === null || seg === undefined) return '—';
    if (seg < 90) return `${seg} s`;
    if (seg < 3600) return `${Math.round(seg / 60)} min`;
    const h = Math.floor(seg / 3600);
    const m = Math.round((seg % 3600) / 60);
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  function horasMin(min) {
    if (!min) return '0 h';
    if (min < 60) return `${(Math.round(min * 10) / 10).toLocaleString('pt-BR')} min`;
    return (min / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' h';
  }
  /** Topo "redondo" do eixo (4, 5, 10, 20, 25, 50...). */
  function topoEixo(max) {
    if (max <= 4) return 4;
    const p = Math.pow(10, Math.floor(Math.log10(max)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p;
    return 10 * p;
  }

  // ---------- peças ----------
  /** Variação contra o período anterior: seta + valor (cor + texto). melhora = true/false/null (sem mudança/sem dado). */
  function Variacao({ texto, direcao, melhora, titulo }) {
    const cor = melhora === null || direcao === 0 ? 'var(--muted)' : melhora ? 'var(--accent)' : 'var(--error)';
    const seta = direcao > 0 ? '▲' : direcao < 0 ? '▼' : '=';
    const leitura = melhora === null || direcao === 0 ? 'sem mudança' : melhora ? 'melhorou' : 'piorou';
    return e('div', { className: 'res-var', title: titulo, style: { display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 12.5, fontWeight: 600, color: cor, flexWrap: 'wrap' } }, [
      e('span', { key: 's', 'aria-hidden': 'true' }, seta),
      e('span', { key: 't' }, texto),
      e('span', { key: 'l', style: { fontWeight: 500, color: 'var(--muted-soft)', fontSize: 11.5 } }, `${leitura} vs. período anterior`),
    ]);
  }
  const semAnterior = (titulo) => e('div', { className: 'res-var', title: titulo, style: { fontSize: 12, color: 'var(--muted-soft)' } }, 'Sem execuções no período anterior para comparar.');
  const sinal = (n) => (n > 0 ? '+' : n < 0 ? '−' : '');
  const pctVar = (x) => (x === null || x === undefined ? '' : ` (${sinal(x)}${Math.abs(x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%)`);

  function Numero({ rotulo, valor, sub, selo, icone, variacao }) {
    return e('div', { className: 'res-kpi', style: { ...S.card, gap: 6 } }, [
      e('div', { key: 'r', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } }, [
        e('div', { key: 'l', style: { fontSize: 12, color: 'var(--muted)', fontWeight: 600 } }, rotulo),
        selo
          ? e('span', { key: 's', style: { ...S.tag('#d97706'), background: 'var(--warn-tint)', color: 'var(--warn)' } }, selo)
          : icone
            ? e('span', { key: 's', style: { display: 'flex' } }, Icon(icone, 15, 'var(--muted-soft)'))
            : null,
      ]),
      e('div', { key: 'v', style: { fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' } }, valor),
      variacao ? e('div', { key: 'va' }, variacao) : null,
      e('div', { key: 'su', style: { fontSize: 12, color: 'var(--muted-soft)', lineHeight: 1.4 } }, sub),
    ]);
  }

  const Legenda = () =>
    e('div', { className: 'res-legenda' }, [
      e('span', { key: 'c' }, [e('i', { key: 'i', className: 'res-sw res-ok' }), 'Concluído']),
      e('span', { key: 'e' }, [e('i', { key: 'i', className: 'res-sw res-erro' }), 'Erro']),
    ]);

  /** Barras empilhadas por semana: concluído embaixo, erro (hachurado) em cima. */
  function GraficoSemanas({ semanas }) {
    const [foco, setFoco] = useState(null);
    const topo = topoEixo(Math.max(1, ...semanas.map((s) => s.concluido + s.erro)));
    const passoRotulo = Math.ceil(semanas.length / 13);
    const ALT = 180;
    const s = foco !== null ? semanas[foco] : null;
    const fimSemana = (iso) => {
      const d = new Date(iso + 'T00:00:00');
      d.setDate(d.getDate() + 6);
      return isoLocal(d);
    };
    const deslocar = foco === null ? '' : foco < semanas.length / 4 ? 'translateX(-15%)' : foco > (semanas.length * 3) / 4 ? 'translateX(-85%)' : 'translateX(-50%)';
    return e('div', { className: 'res-grafico' }, [
      e('div', { key: 'eixo', className: 'res-eixo', style: { height: ALT } }, [topo, topo / 2, 0].map((v) => e('span', { key: v }, num(v)))),
      e('div', { key: 'area', className: 'res-area' }, [
        e('div', { key: 'plot', className: 'res-plot', style: { height: ALT }, onMouseLeave: () => setFoco(null) }, [
          ...[0, 0.5, 1].map((f) => e('div', { key: 'g' + f, className: 'res-grade', style: { bottom: f * 100 + '%' } })),
          ...semanas.map((sem, i) => {
            const hOk = (sem.concluido / topo) * ALT;
            const hErro = (sem.erro / topo) * ALT;
            return e('div', { key: sem.semana, className: 'res-col' + (foco === i ? ' foco' : ''), onMouseEnter: () => setFoco(i), onFocus: () => setFoco(i), onBlur: () => setFoco(null), tabIndex: 0, 'aria-label': `Semana de ${dataBr(sem.semana)}: ${sem.concluido} concluídos, ${sem.erro} com erro` },
              e('div', { className: 'res-pilha' }, [
                sem.erro ? e('div', { key: 'e', className: 'res-seg res-erro', style: { height: Math.max(3, hErro) } }) : null,
                sem.concluido ? e('div', { key: 'c', className: 'res-seg res-ok', style: { height: Math.max(3, hOk) } }) : null,
              ])
            );
          }),
          s
            ? e('div', { key: 'tip', className: 'res-tip', style: { left: `${((foco + 0.5) / semanas.length) * 100}%`, transform: deslocar } }, [
                e('div', { key: 't', style: { fontWeight: 600, marginBottom: 4 } }, `${dataBr(s.semana)} a ${dataBr(fimSemana(s.semana))}`),
                e('div', { key: 'c' }, [e('i', { key: 'i', className: 'res-sw res-ok' }), `${num(s.concluido)} concluído(s)`]),
                e('div', { key: 'e' }, [e('i', { key: 'i', className: 'res-sw res-erro' }), `${num(s.erro)} com erro`]),
                s.executando ? e('div', { key: 'x', style: { color: 'var(--muted)' } }, `${num(s.executando)} sem fim (executando)`) : null,
                s.concluido + s.erro ? e('div', { key: 'tx', style: { color: 'var(--muted)', marginTop: 2 } }, `Taxa de erro: ${pct(s.erro / (s.concluido + s.erro))}`) : null,
              ])
            : null,
        ]),
        e('div', { key: 'x', className: 'res-x' }, semanas.map((sem, i) =>
          // tela estreita: só um rótulo a cada 3 dos que aparecem (classe res-x-sec some no CSS)
          e('span', { key: sem.semana, className: i % (passoRotulo * 3) ? 'res-x-sec' : '' }, i % passoRotulo === 0 ? dataCurta(sem.semana) : '')
        )),
      ]),
    ]);
  }

  /** Barrinha horizontal (taxa de erro, quantidade de um motivo). */
  const Barrinha = ({ fracao }) =>
    e('div', { className: 'res-barrinha' }, e('div', { className: 'res-erro', style: { width: (fracao > 0 ? Math.max(4, Math.min(1, fracao) * 100) : 0) + '%' } }));

  const tabela = (cabecalhos, linhas) =>
    e('div', { key: 'tab', style: { overflowX: 'auto' } }, e('table', { className: 'res-tabela' }, [
      e('thead', { key: 'h' }, e('tr', null, cabecalhos.map((c, i) => e('th', { key: i, style: { textAlign: i ? 'right' : 'left' } }, c)))),
      e('tbody', { key: 'b' }, linhas),
    ]));

  const taxaCelula = (taxa) => e('span', { className: 'res-taxa' }, [e(Barrinha, { key: 'b', fracao: taxa || 0 }), e('span', { key: 'v' }, pct(taxa))]);
  const cabecalhoCard = (titulo, sub) => e('div', { key: 'h' }, [e('div', { key: 'a', style: S.titulo }, titulo), e('div', { key: 'b', style: S.sub }, sub)]);

  // ---------- tela ----------
  function ResultadosView() {
    const [salvo] = useState(() => ler(KEY_PERIODO, null) || {});
    const [periodo, setPeriodo] = useState(PERIODOS.some((p) => p.id === salvo.periodo) ? salvo.periodo : '12');
    const [datas, setDatas] = useState({ desde: salvo.desde || inicioSemanas(12), ate: salvo.ate || hoje() });
    const [incluirTeste, setIncluirTeste] = useState(false); // sempre começa desligado
    const [estado, setEstado] = useState({ carregando: true, dados: null, erro: null });
    const [todasAssoc, setTodasAssoc] = useState(false);
    const [assocSel, setAssocSel] = useState('');
    const [tipoSel, setTipoSel] = useState('');
    const [listaAssoc, setListaAssoc] = useState([]);
    const [ordem, setOrdem] = useState({ col: 'erro', desc: true });
    const [verRes, setVerRes] = useState(null); // chamado aberto no painel (o link direto do GLPI cai em "sessão expirou")

    // lista de associações pro filtro (cadastro único, repassado pelo chamados-glpi)
    useEffect(() => {
      fetch(`${SERVICO}/api/associacoes`)
        .then((r) => (r.ok ? r.json() : []))
        .then((l) => Array.isArray(l) && setListaAssoc(l.filter((a) => a.ativo !== false).map((a) => ({ id: a.id, nome: a.nome })).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))))
        .catch(() => {});
    }, []);

    const p = PERIODOS.find((x) => x.id === periodo);
    const filtro = p && p.semanas ? { desde: inicioSemanas(p.semanas), ate: hoje() } : datas;
    const datasOk = /^\d{4}-\d{2}-\d{2}$/.test(filtro.desde) && /^\d{4}-\d{2}-\d{2}$/.test(filtro.ate) && filtro.desde <= filtro.ate;

    const buscar = useCallback(async () => {
      if (!datasOk) return;
      setEstado((x) => ({ ...x, carregando: true, erro: null }));
      try {
        const q = new URLSearchParams({ desde: filtro.desde, ate: filtro.ate, incluirTeste: incluirTeste ? '1' : '0', comparar: '1' });
        if (assocSel) q.set('associacaoId', assocSel);
        if (tipoSel) q.set('tipo', tipoSel);
        const resp = await fetch(`${SERVICO}/api/resultados?${q}`);
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.error || `HTTP ${resp.status}`);
        setEstado({ carregando: false, dados, erro: null, em: new Date() });
      } catch (err) {
        setEstado((x) => ({ ...x, carregando: false, erro: err.message }));
      }
    }, [filtro.desde, filtro.ate, incluirTeste, datasOk, assocSel, tipoSel]);

    useEffect(() => {
      buscar();
    }, [buscar]);
    useEffect(() => {
      gravar(KEY_PERIODO, { periodo, desde: datas.desde, ate: datas.ate });
    }, [periodo, datas.desde, datas.ate]);

    const { dados, carregando, erro } = estado;

    const cabecalho = e('div', { key: 'head', style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' } }, [
      e('div', { key: 't' }, [
        e('div', { key: 'n', style: { fontWeight: 600, fontSize: 19 } }, 'Resultados'),
        e('div', { key: 's', style: { color: 'var(--muted-soft)', fontSize: 12.5, marginTop: 4 } },
          `Chamados do GLPI tratados pelas automações · ${dataBr(filtro.desde)} a ${dataBr(filtro.ate)}${estado.em ? ' · atualizado ' + estado.em.toLocaleTimeString('pt-BR') : ''}`),
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
        e('select', { key: 'fa', className: 'field-input', value: assocSel, onChange: (ev) => setAssocSel(ev.target.value), style: { ...S.input, maxWidth: '100%' }, 'aria-label': 'Filtrar por associação' }, [
          e('option', { key: '', value: '' }, 'Todas as associações'),
          ...listaAssoc.map((a) => e('option', { key: a.id, value: String(a.id) }, a.nome)),
        ]),
        e('select', { key: 'ft', className: 'field-input', value: tipoSel, onChange: (ev) => setTipoSel(ev.target.value), style: { ...S.input, maxWidth: '100%' }, 'aria-label': 'Filtrar por tipo de chamado' }, [
          e('option', { key: '', value: '' }, 'Todos os tipos'),
          ...Object.entries((dados && dados.nomesTipos) || NOMES_TIPO).map(([k, v]) => e('option', { key: k, value: k }, v)),
        ]),
        e('label', { key: 'mt', style: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, padding: '6px 11px', borderRadius: 8, cursor: 'pointer', border: '1px dashed ' + (incluirTeste ? 'var(--warn)' : 'var(--border)'), background: incluirTeste ? 'var(--warn-tint)' : 'transparent', color: incluirTeste ? 'var(--warn)' : 'var(--muted)' } }, [
          e('input', { key: 'c', type: 'checkbox', checked: incluirTeste, onChange: (ev) => setIncluirTeste(ev.target.checked) }),
          e('span', { key: 't' }, 'Incluir modo teste'),
        ]),
        e('button', { key: 'rf', style: S.btnSec, disabled: carregando, onClick: buscar }, [
          e('span', { key: 'i', style: { display: 'flex', animation: carregando ? 'spin 1s linear infinite' : 'none' } }, Icon('RefreshCw', 14)),
          e('span', { key: 't' }, carregando ? 'Buscando…' : 'Atualizar'),
        ]),
      ]),
    ]);

    function painel(d) {
      const t = d.totais;
      const te = d.tempoEconomizado;
      const nomeTipo = (tipo) => (d.nomesTipos && d.nomesTipos[tipo]) || tipo;
      const va = d.variacao;
      const ant = d.anterior;
      const tituloAnt = ant ? `Período anterior: ${dataBr(ant.periodo.desde)} a ${dataBr(ant.periodo.ate)}` : '';
      const antVazio = !ant || !ant.totais.total;
      const mk = (diferenca, formata, menosEhMelhor, textoExtra, antes) => {
        if (antVazio) return semAnterior(tituloAnt);
        if (diferenca === null || diferenca === undefined) return e('div', { className: 'res-var', title: tituloAnt, style: { fontSize: 12, color: 'var(--muted-soft)' } }, 'Sem dado do período anterior para comparar.');
        const dir = diferenca > 0 ? 1 : diferenca < 0 ? -1 : 0;
        return e(Variacao, { texto: `${sinal(diferenca)}${formata(Math.abs(diferenca))}${textoExtra || ''}`, direcao: dir, melhora: dir === 0 ? null : menosEhMelhor ? dir < 0 : dir > 0, titulo: `${tituloAnt} · antes: ${antes}` });
      };
      const kRes = va && mk(va.resolvidos.diferenca, num, false, pctVar(va.resolvidos.percentual), num(va.resolvidos.anterior));
      const kErro = va && mk(va.taxaErro.pontosPercentuais, (x) => x.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' p.p.', true, '', pct(va.taxaErro.anterior));
      const kTempo = va && mk(va.tempoEconomizado.diferencaMin, horasMin, false, pctVar(va.tempoEconomizado.percentual), horasMin(va.tempoEconomizado.anteriorMin) + ' (estimativa)');
      const kDur = va && mk(va.duracaoMediaSeg.diferencaSeg, duracao, true, '', duracao(va.duracaoMediaSeg.anterior));
      const maxMotivo = Math.max(1, ...d.motivosErro.map((m) => m.total));
      const fin = (a) => a.concluido + a.erro;
      const alta = (a) => fin(a) >= MIN_FINALIZADAS_ALERTA && a.taxaErro !== null && a.taxaErro >= TAXA_ALTA;
      const valorOrdem = (a) => (ordem.col === 'nome' ? String(a.nome).toLowerCase() : ordem.col === 'taxaErro' ? (a.taxaErro === null ? -1 : a.taxaErro) : a[ordem.col]);
      const ordenadas = [...d.associacoes].sort((a, b) => {
        const x = valorOrdem(a);
        const y = valorOrdem(b);
        const c = typeof x === 'string' ? x.localeCompare(y, 'pt-BR') : x - y;
        return (ordem.desc ? -c : c) || b.erro - a.erro || String(a.nome).localeCompare(b.nome, 'pt-BR');
      });
      const assocs = todasAssoc ? ordenadas : ordenadas.slice(0, 10);
      const cabOrdem = (col, rotulo) => {
        const ativo = ordem.col === col;
        return e('button', { key: col, style: { ...S.link, color: ativo ? 'var(--text)' : 'var(--muted)', fontSize: 11.5, whiteSpace: 'nowrap' }, 'aria-label': `Ordenar por ${rotulo}`, onClick: () => setOrdem(ativo ? { col, desc: !ordem.desc } : { col, desc: col !== 'nome' }) }, rotulo + (ativo ? (ordem.desc ? ' ▼' : ' ▲') : ''));
      };
      const avisos = [];
      if (erro) avisos.push(e('div', { key: 'err', style: { color: 'var(--error)', fontSize: 12.5 } }, `Não consegui atualizar: ${erro} (mostrando a última busca).`));
      if (t.testes) avisos.push(e('div', { key: 'tst', style: { color: 'var(--warn)', fontSize: 12.5 } }, `Inclui ${num(t.testes)} execução(ões) em modo teste: nada foi escrito no GLPI (concluído/erro pelo texto que iria pro chamado).`));
      if (t.executandoParado) avisos.push(e('div', { key: 'par', style: { color: 'var(--warn)', fontSize: 12.5 } }, `${num(t.executandoParado)} execução(ões) ficaram em "executando" há mais de 3 h (provavelmente interrompidas).`));
      else if (t.executando) avisos.push(e('div', { key: 'exe', style: { color: 'var(--muted)', fontSize: 12.5 } }, `${num(t.executando)} execução(ões) em andamento agora.`));

      return e('div', { key: 'painel', style: { display: 'flex', flexDirection: 'column', gap: 16 } }, [
        avisos.length ? e('div', { key: 'av', style: { display: 'flex', flexDirection: 'column', gap: 4 } }, avisos) : null,
        e('div', { key: 'kpis', className: 'res-kpis' }, [
          e(Numero, { key: 'r', rotulo: 'Chamados resolvidos', icone: 'Activity', valor: num(t.concluido), variacao: kRes, sub: `de ${num(t.concluido + t.erro)} execuções finalizadas · ${num(t.chamados)} chamado(s) diferente(s)` }),
          e(Numero, { key: 'e', rotulo: 'Taxa de erro', icone: 'AlertCircle', valor: pct(t.taxaErro), variacao: kErro, sub: `${num(t.erro)} execução(ões) com erro` }),
          e(Numero, { key: 't', rotulo: 'Tempo economizado', selo: 'estimativa', valor: horasMin(te.minutos), variacao: kTempo, sub: 'Estimativa: chamados concluídos × minutos que levaria à mão (por tipo)' }),
          e(Numero, { key: 'd', rotulo: 'Tempo médio de execução', icone: 'RefreshCw', valor: duracao(t.duracaoMediaSeg), variacao: kDur, sub: `mediana ${duracao(t.duracaoMedianaSeg)} · da aprovação ao fim (inclui fila)` }),
        ]),
        e('div', { key: 'sem', style: S.card }, [
          e('div', { key: 'h', style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' } }, [
            cabecalhoCard('Resolvidos por semana', 'Execuções finalizadas por semana (segunda a domingo). Passe o mouse numa barra para ver os números.'),
            e(Legenda, { key: 'l' }),
          ]),
          e(GraficoSemanas, { key: 'g', semanas: d.semanas }),
        ]),
        e('div', { key: 'tipos', style: S.card }, [
          cabecalhoCard('Por tipo de chamado', `Tempo economizado é estimativa: ${Object.entries(te.minutosManuais).map(([k, v]) => `${nomeTipo(k)} ${v} min`).join(' · ')} por chamado concluído.`),
          tabela(['Tipo', 'Execuções', 'Resolvidos', 'Erros', 'Taxa de erro', 'Tempo médio', 'Economizado (estim.)'],
            d.tipos.map((x) =>
              e('tr', { key: x.tipo }, [
                e('td', { key: 'n' }, e('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 8 } }, [e('i', { key: 'i', className: 'res-sw', style: { background: COR_TIPO[x.tipo] || '#6b7280' } }), x.nome])),
                e('td', { key: 't' }, num(x.total)),
                e('td', { key: 'c' }, num(x.concluido)),
                e('td', { key: 'e' }, num(x.erro)),
                e('td', { key: 'x' }, taxaCelula(x.taxaErro)),
                e('td', { key: 'd' }, duracao(x.duracaoMediaSeg)),
                e('td', { key: 'm', title: `${num(x.concluido)} × ${x.minutosManuais} min` }, horasMin(x.minutosEconomizados)),
              ])
            )
          ),
        ]),
        e('div', { key: 'onde', style: S.card }, [
          cabecalhoCard('Onde mais falha', 'Combinação de associação e tipo de chamado com mais erros no período. Clique no chamado de exemplo (o mais recente) para abrir no GLPI.'),
          (d.falhas || []).length
            ? e('div', { key: 'l', style: { display: 'flex', flexDirection: 'column', gap: 12 } }, d.falhas.slice(0, 5).map((x, i) =>
                e('div', { key: i, style: { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: '2px 12px', alignItems: 'baseline' } }, [
                  e('span', { key: 'n', style: { fontWeight: 600, fontSize: 18, fontVariantNumeric: 'tabular-nums', minWidth: 28 }, title: 'erros' }, num(x.erro)),
                  e('div', { key: 'c', style: { minWidth: 0 } }, [
                    e('div', { key: 'a', style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13.5 } }, [
                      e('span', { key: 'nm', style: { fontWeight: 600, overflowWrap: 'anywhere' } }, (i === 0 ? '▲ ' : '') + x.nome),
                      e('span', { key: 'tp', style: S.tag(COR_TIPO[x.tipo] || '#6b7280') }, nomeTipo(x.tipo)),
                      e('span', { key: 'ex', style: { fontSize: 11.5, color: 'var(--muted-soft)' } }, 'ex.:'),
                      e('button', { key: 'lk', onClick: () => setVerRes({ id: x.exemplo.glpiTicketId }), title: `${x.exemplo.categoria || ''} · ${dataBr(x.exemplo.criadoEm)}\n\n${x.exemplo.resultado}`, style: { background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--accent)', fontWeight: 600, fontSize: 12, textDecoration: 'underline' } }, '#' + x.exemplo.glpiTicketId),
                    ]),
                    e('div', { key: 'b', style: { marginTop: 6 } }, e(Barrinha, { fracao: x.erro / Math.max(1, d.falhas[0].erro) })),
                  ]),
                ])
              ))
            : e('div', { key: 'nada', style: { fontSize: 13, color: 'var(--muted-soft)' } }, 'Nenhum erro no período com esses filtros: nada a investigar.'),
        ]),
        e('div', { key: 'falhas', className: 'page-grid' }, [
          e('div', { key: 'mot', style: S.card }, [
            cabecalhoCard('Motivos de erro', 'Motivos de erro agrupados (sem nomes e números). Clique no chamado para abrir no GLPI.'),
            d.motivosErro.length
              ? e('div', { key: 'l', style: { display: 'flex', flexDirection: 'column', gap: 14 } }, d.motivosErro.map((m, i) =>
                  e('div', { key: i }, [
                    e('div', { key: 'r', style: { display: 'flex', alignItems: 'baseline', gap: 10 } }, [
                      e('span', { key: 'n', style: { fontWeight: 600, fontSize: 15, minWidth: 28, fontVariantNumeric: 'tabular-nums' } }, num(m.total)),
                      e('span', { key: 't', style: { fontSize: 13, lineHeight: 1.4, flex: 1, minWidth: 0, overflowWrap: 'anywhere' } }, m.motivo),
                    ]),
                    e('div', { key: 'b', style: { margin: '6px 0 6px 38px' } }, e(Barrinha, { fracao: m.total / maxMotivo })),
                    e('div', { key: 'x', style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginLeft: 38 } }, [
                      ...m.tipos.map((tp) => e('span', { key: tp, style: S.tag(COR_TIPO[tp] || '#6b7280') }, nomeTipo(tp))),
                      e('span', { key: 'ex', style: { fontSize: 11.5, color: 'var(--muted-soft)' } }, 'ex.:'),
                      ...m.exemplos.map((x) =>
                        e('button', { key: x.id, onClick: () => setVerRes({ id: x.glpiTicketId }), title: `${x.categoria || ''} · ${dataBr(x.criadoEm)}\n\n${x.resultado}`, style: { background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--accent)', fontWeight: 600, fontSize: 12, textDecoration: 'underline' } }, '#' + x.glpiTicketId)
                      ),
                    ]),
                  ])
                ))
              : e('div', { key: 'nada', style: { fontSize: 13, color: 'var(--muted-soft)' } }, 'Nenhum erro no período.'),
          ]),
          e('div', { key: 'dir', style: { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 } }, [
            e('div', { key: 'assoc', style: S.card }, [
              cabecalhoCard('Por associação', `Clique no título da coluna para ordenar. "Alta" = taxa de erro de ${Math.round(TAXA_ALTA * 100)}% ou mais, com pelo menos ${MIN_FINALIZADAS_ALERTA} execuções finalizadas.`),
              tabela([cabOrdem('nome', 'Associação'), cabOrdem('total', 'Execuções'), cabOrdem('erro', 'Erros'), cabOrdem('taxaErro', 'Taxa de erro')],
                assocs.map((a) =>
                  e('tr', { key: a.nome + (a.associacaoId || ''), style: alta(a) ? { background: 'var(--error-tint)' } : null }, [
                    e('td', { key: 'n' }, e('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } }, [
                      a.nome,
                      alta(a) ? e('span', { key: 'al', style: { ...S.tag('#dc2626'), background: 'var(--error-tint)', color: 'var(--error)' } }, '▲ Alta') : null,
                    ])),
                    e('td', { key: 't' }, num(a.total)),
                    e('td', { key: 'e' }, num(a.erro)),
                    e('td', { key: 'x' }, taxaCelula(a.taxaErro)),
                  ])
                )
              ),
              d.associacoes.length > 10 ? e('button', { key: 'mais', style: { ...S.link, alignSelf: 'flex-start' }, onClick: () => setTodasAssoc((v) => !v) }, todasAssoc ? 'Mostrar só as 10 primeiras' : `Ver todas (${d.associacoes.length})`) : null,
            ]),
            d.aprovadores.length
              ? e('div', { key: 'apr', style: S.card }, [
                  cabecalhoCard('Quem aprovou', 'Quem rodou os chamados pela aba Chamados.'),
                  tabela(['Pessoa', 'Execuções', 'Resolvidos', 'Erros'],
                    d.aprovadores.map((x) => e('tr', { key: x.nome + (x.id || '') }, [e('td', { key: 'n' }, x.nome), e('td', { key: 't' }, num(x.total)), e('td', { key: 'c' }, num(x.concluido)), e('td', { key: 'e' }, num(x.erro))]))
                  ),
                ])
              : null,
          ]),
        ]),
      ]);
    }

    let corpo;
    if (!datasOk) {
      corpo = e('div', { key: 'datas', style: { color: 'var(--warn)', fontSize: 13.5, padding: '20px 0' } }, 'Escolha as duas datas (a primeira antes da segunda).');
    } else if (erro && !dados) {
      corpo = e('div', { key: 'erro', style: { color: 'var(--error)', fontSize: 13.5, padding: '20px 0' } }, 'Não consegui buscar os resultados: ' + erro);
    } else if (!dados) {
      corpo = e('div', { key: 'load', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--muted-soft)', padding: '50px 20px' } }, [e('span', { key: 's', style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 22, 'var(--accent)')), 'Buscando resultados…']);
    } else if (!dados.totais.total) {
      corpo = e('div', { key: 'vazio', style: { ...S.card, alignItems: 'center', gap: 12, padding: '50px 20px', color: 'var(--muted-soft)', textAlign: 'center' } }, [
        e('span', { key: 'i', style: { display: 'flex' } }, Icon('BarChart3', 34, 'var(--muted-soft)', 1.3)),
        e('div', { key: 't', style: { fontSize: 14, color: 'var(--text)', fontWeight: 600 } }, assocSel || tipoSel ? 'Nenhum chamado tratado com esses filtros neste período.' : 'Ainda não tem chamado tratado pelas automações neste período.'),
        assocSel || tipoSel ? e('button', { key: 'lf', style: S.btnSec, onClick: () => { setAssocSel(''); setTipoSel(''); } }, 'Limpar filtros de associação e tipo') : null,
        e('div', { key: 's', style: { fontSize: 12.5, maxWidth: 520, lineHeight: 1.5 } },
          incluirTeste
            ? 'Os números aparecem aqui conforme os chamados forem rodados na aba Chamados.'
            : 'Os números aparecem aqui conforme os chamados forem rodados na aba Chamados (modo real). Execuções em modo teste ficam de fora: marque "Incluir modo teste" para vê-las.'),
      ]);
    } else {
      corpo = painel(dados);
    }

    return e('div', { style: { padding: '28px 24px 96px', maxWidth: 1200, margin: '0 auto' } }, [cabecalho, corpo, verRes && window.VerChamado ? e(window.VerChamado, { key: 'ver', item: verRes, userToken: (ler('arxhub_chamados_acessos_v2', null) || {}).userToken, onFechar: () => setVerRes(null) }) : null]);
  }

  // A aba Resultados tem duas visões: os chamados tratados (esta tela) e a disponibilidade das automações (disponibilidade.js).
  const KEY_VISAO = 'arxhub_resultados_visao';
  function ResultadosComVisoes() {
    const [visao, setVisao] = useState(() => (ler(KEY_VISAO, 'chamados') === 'disponibilidade' ? 'disponibilidade' : 'chamados'));
    const escolher = (v) => {
      setVisao(v);
      gravar(KEY_VISAO, v);
    };
    const chip = (id, rotulo, icone) => e('button', { key: id, style: { ...S.chip(visao === id), display: 'flex', alignItems: 'center', gap: 6 }, onClick: () => escolher(id), 'aria-pressed': visao === id }, [Icon(icone, 13), rotulo]);
    const barra = e('div', { key: 'visoes', style: { display: 'flex', gap: 8, padding: '18px 24px 0', maxWidth: 1200, margin: '0 auto', flexWrap: 'wrap' } }, [
      chip('chamados', 'Chamados tratados', 'BarChart3'),
      window.DisponibilidadeView ? chip('disponibilidade', 'Disponibilidade', 'Activity') : null,
    ]);
    return e('div', null, [barra, visao === 'disponibilidade' && window.DisponibilidadeView ? e(window.DisponibilidadeView, { key: 'disp' }) : e(ResultadosView, { key: 'res' })]);
  }

  window.ResultadosView = ResultadosComVisoes;
})();
