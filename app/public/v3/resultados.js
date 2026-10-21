// v3 (Hub de exemplo): aba Resultados com a tela do Hub de exemplo (exemplo-resultados.js) e os dados REAIS:
// totais, tipos, motivos e associações vêm do resumo do banco-central (/api/resultados); a lista de chamados atendidos,
// o gráfico por dia e por hora vêm das últimas 200 execuções (/api/historico); as manuais, do Hub (/api/execucoes/resumo);
// a Disponibilidade, do histórico de alertas do monitor (/api/alertas/historico). Expõe window.ResultadosView.
(function () {
  const e = React.createElement;
  const { useState, useEffect, useRef } = React;
  const { Icon } = window.Icons;
  const SERVICO = `${location.origin}/servicos/chamados`;
  const DIA = 86400000;
  const LIMITE_HIST = 200; // o /api/historico devolve as 200 execuções mais recentes

  const num = (n) => Math.round(Number(n) || 0).toLocaleString('pt-BR');
  const pct = (n) => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  const dia = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const diaLongo = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const deIso = (s) => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
  const duracao = (min) => (min < 60 ? Math.round(min) + ' min' : Math.floor(min / 60) + ' h ' + String(Math.round(min % 60)).padStart(2, '0') + ' min');
  const segundos = (s) => (s == null ? 'Sem dados' : s >= 60 ? Math.floor(s / 60) + ' min ' + (Math.round(s) % 60) + ' s' : Math.round(s) + ' s');
  const ler = (k, p) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : p; } catch (err) { return p; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (err) { /* sem armazenamento: vale só nesta aba */ } };
  async function obter(url) {
    const r = await fetch(url);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
    return d;
  }

  const hojeMeiaNoite = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const ATALHOS = [
    ['hoje', 'Hoje', (H) => [H, H]],
    ['ontem', 'Ontem', (H) => [new Date(H - DIA), new Date(H - DIA)]],
    ['7', 'Últimos 7 dias', (H) => [new Date(H - 6 * DIA), H]],
    ['30', 'Últimos 30 dias', (H) => [new Date(H - 29 * DIA), H]],
    ['mes', 'Este mês', (H) => [new Date(H.getFullYear(), H.getMonth(), 1), H]],
    ['mes_passado', 'Mês passado', (H) => [new Date(H.getFullYear(), H.getMonth() - 1, 1), new Date(H.getFullYear(), H.getMonth(), 0)]],
    ['84', 'Últimas 12 semanas', (H) => [new Date(H - 83 * DIA), H]],
  ];
  const intervalo = (p) => (p.chave === 'custom' ? [deIso(p.de), deIso(p.ate)] : (ATALHOS.find((a) => a[0] === p.chave) || ATALHOS[4])[2](hojeMeiaNoite()));
  const rotuloPeriodo = (p) => (p.chave === 'custom' ? 'Personalizado' : (ATALHOS.find((a) => a[0] === p.chave) || ATALHOS[4])[1]);
  const diasDe = (de, ate) => { const l = []; for (let t = de.getTime(); t <= ate.getTime(); t += DIA) l.push(new Date(t)); return l; };

  // execução em modo teste conta como erro quando o texto que iria pro chamado é de erro (mesma regra do banco-central)
  const TEXTO_ERRO = /^(A automação não|A automação do fechamento falhou|Não consegui)/;
  const ehErro = (x) => x.status === 'erro' || (x.status === 'teste' && TEXTO_ERRO.test(String(x.resultado || '')));
  const contar = (l) => { const f = l.filter((x) => x.status !== 'executando'); const erros = f.filter(ehErro).length; return { ok: f.length - erros, erros, total: f.length }; };

  function Spark({ valores, cor }) {
    if (valores.length < 2) return null;
    const max = Math.max(1e-9, ...valores);
    const pts = valores.map((v, i) => (i / (valores.length - 1)) * 100 + ',' + (26 - (v / max) * 24)).join(' ');
    return e('svg', { className: 'exr-spark', viewBox: '0 0 100 28', preserveAspectRatio: 'none', 'aria-hidden': 'true' },
      e('polyline', { points: pts, fill: 'none', stroke: cor, strokeWidth: 2, vectorEffect: 'non-scaling-stroke', strokeLinejoin: 'round', strokeLinecap: 'round' }));
  }
  function Delta({ atual, anterior, menorMelhor }) {
    if (anterior == null || !isFinite(anterior) || anterior === 0 || atual == null) return null;
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
  const Cartao = ({ titulo, sub, acao, children }) => e('section', { className: 'exu-cartao' }, [
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
  const Vazio = ({ texto }) => e('div', { className: 'exc-vazio', style: { padding: 24 } }, texto);
  const Carregando = () => e('div', { className: 'exc-tabela' }, e('div', { className: 'exc-vazio' }, [e('span', { key: 's', style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 22, 'var(--accent)')), 'Buscando os resultados…']));
  const Falha = ({ texto }) => e('div', { className: 'exc-aviso', style: { background: 'var(--error-tint)' } }, [Icon('AlertCircle', 16, 'var(--error)'), texto]);

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
    const hoje = iso(hojeMeiaNoite());
    const valido = rascunho.de && rascunho.ate && rascunho.de <= rascunho.ate && rascunho.ate <= hoje;
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
          e('label', { key: 'de' }, ['De', e('input', { key: 'i', type: 'date', value: rascunho.de, max: hoje, onChange: (ev) => setRascunho(Object.assign({}, rascunho, { de: ev.target.value })) })]),
          e('label', { key: 'ate' }, ['Até', e('input', { key: 'i', type: 'date', value: rascunho.ate, max: hoje, onChange: (ev) => setRascunho(Object.assign({}, rascunho, { ate: ev.target.value })) })]),
          !valido ? e('span', { key: 'e', className: 'exu-campo-erro' }, 'A data inicial precisa ser antes da final, e a final até hoje.') : null,
          e('label', { key: 'c', className: 'exu-chave', style: { flexDirection: 'row' } }, [e('input', { key: 'i', type: 'checkbox', checked: periodo.comparar, onChange: (ev) => mudar(Object.assign({}, periodo, { comparar: ev.target.checked })) }), 'Comparar com o período anterior']),
          e('button', { key: 'ok', type: 'button', className: 'exu-btn primario pequeno', disabled: !valido, onClick: () => { mudar(Object.assign({}, periodo, { chave: 'custom', de: rascunho.de, ate: rascunho.ate })); setAberto(false); } }, 'Aplicar'),
        ]),
      ]) : null,
    ]);
  }

  const SIT_EXEC = { concluido: ['concluido', 'Solucionado'], erro: ['erro', 'Erro'], teste: ['pendencia', 'Teste'], executando: ['rodando', 'Rodando'] };
  const sitExec = (x) => { const s = SIT_EXEC[x.status] || ['', x.status]; return e(Sit, { tipo: s[0], texto: s[1] }); };
  const quando = (x) => { const d = new Date(x.criadoEm); return dia(d) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  const durExec = (x) => (x.finalizadoEm ? segundos((Date.parse(x.finalizadoEm) - Date.parse(x.criadoEm)) / 1000) : 'Em andamento');

  function Tratados({ res, hist, man, de, ate, filtros, periodo, nomeAssoc }) {
    const [modo, setModo] = useState('grafico');
    const [ver, setVer] = useState(null);
    const [exibir, setExibir] = useState(() => ler('arxhub_v3_res_exibir', 'lista'));
    const [ordem, setOrdem] = useState(['taxa', -1]);
    const [pagina, setPagina] = useState(0);
    useEffect(() => setPagina(0), [de.getTime(), ate.getTime(), filtros.assoc, filtros.tipo, filtros.teste, exibir]);

    const t = res.totais;
    const ant = periodo.comparar && res.anterior ? res.anterior.totais : null;
    const v = res.variacao || {};
    const dias = diasDe(de, ate);
    const uteis = dias.filter((d) => d.getDay() % 6).length || 1;
    const fim = ate.getTime() + DIA;
    // execuções do histórico no período, com os mesmos filtros do resumo
    const ex = hist.itens.filter((x) => {
      const t0 = Date.parse(x.criadoEm);
      return t0 >= de.getTime() && t0 < fim && (filtros.teste || !x.modoTeste) && (!filtros.assoc || String(x.associacaoId) === filtros.assoc) && (!filtros.tipo || x.tipo === filtros.tipo);
    });
    // o histórico tem só as 200 últimas: dia a dia e por hora só quando ele cobre o período inteiro
    const maisAntiga = hist.itens.length ? Date.parse(hist.itens[hist.itens.length - 1].criadoEm) : 0;
    const cobre = hist.itens.length < LIMITE_HIST || maisAntiga <= de.getTime();
    const semanal = !cobre || dias.length > 31;
    const cols = dias.length === 1 && cobre
      ? Array.from({ length: 24 }, (_, h) => Object.assign({ rotulo: h + 'h' }, contar(ex.filter((x) => new Date(x.criadoEm).getHours() === h)))).filter((c, h) => c.total || (h >= 7 && h <= 19))
      : semanal
        ? (res.semanas || []).map((s) => ({ rotulo: 'Sem. ' + dia(deIso(s.semana)), ok: s.concluido, erros: s.erro, total: s.concluido + s.erro }))
        : dias.map((d) => Object.assign({ rotulo: dia(d) }, contar(ex.filter((x) => { const t0 = Date.parse(x.criadoEm); return t0 >= d.getTime() && t0 < d.getTime() + DIA; }))));
    const horas = Array.from({ length: 24 }, (_, h) => Object.assign({ rotulo: h + 'h' }, contar(ex.filter((x) => new Date(x.criadoEm).getHours() === h))));
    const comDado = horas.filter((c) => c.total).map((c) => parseInt(c.rotulo, 10));
    const porHora = horas.slice(Math.min(7, ...comDado), Math.max(19, ...comDado) + 1);

    const tipos = (res.tipos || []).filter((x) => x.total).sort((a, b) => b.total - a.total)
      .map((x) => ({ nome: x.nome || x.tipo, ok: x.concluido, erros: x.erro, total: x.total, texto: num(x.total) + ' · ' + pct((x.taxaErro || 0) * 100) + ' de erro', titulo: num(x.concluido) + ' resolvidos, ' + num(x.erro) + ' com erro' }));
    const motivos = (res.motivosErro || []).slice().sort((a, b) => b.total - a.total);
    const assocs = (res.associacoes || []).map((a) => ({ a: a.nome, total: a.total, ok: a.concluido, erros: a.erro, taxa: (a.taxaErro || 0) * 100 }))
      .sort((x, y) => (ordem[0] === 'a' ? String(x.a).localeCompare(String(y.a), 'pt-BR') : x[ordem[0]] - y[ordem[0]]) * ordem[1]);
    // ordenar pelo teclado: o título da coluna é um botão (Enter ou espaço); aria-sort fica no th
    const th = (k, tx, cls) => e('th', { key: k, className: 'ordenavel ' + (cls || ''), 'aria-sort': ordem[0] === k ? (ordem[1] > 0 ? 'ascending' : 'descending') : 'none' },
      e('button', { type: 'button', className: 'v3-ordenar', onClick: () => setOrdem([k, ordem[0] === k ? -ordem[1] : -1]) }, [tx, ordem[0] === k ? e('span', { key: 's', 'aria-hidden': 'true' }, ordem[1] > 0 ? ' ↑' : ' ↓') : null]));
    const mt = man && man.totais ? man.totais : null;
    const recentes = ex;
    const porPag = exibir === 'lista' ? 10 : 9;
    const totalPag = Math.max(1, Math.ceil(recentes.length / porPag));
    const fatia = recentes.slice(pagina * porPag, (pagina + 1) * porPag);
    const kpi = (k, rot, val, det, extra) => e('div', { key: k, className: 'exu-kpi' }, [e('div', { key: 'r', className: 'exu-kpi-rot' }, rot), e('div', { key: 'v', className: 'exu-kpi-val' }, val), e('div', { key: 'd', className: 'exu-kpi-det' }, det), extra || null]);
    const cmp = ant ? 'contra o período anterior' : null;
    const horasEco = ((v.tempoEconomizado && v.tempoEconomizado.atualMin) || 0) / 60;
    const horasEcoAnt = v.tempoEconomizado && v.tempoEconomizado.anteriorMin != null ? v.tempoEconomizado.anteriorMin / 60 : null;
    const abrir = (x) => setVer({ id: Number(x.glpiTicketId), titulo: x.titulo, categoria: x.categoria, tipo: x.tipo, tipoNome: x.titulo, link: 'https://suporte.mutualle.com.br/front/ticket.form.php?id=' + x.glpiTicketId });

    if (!t.total && !(mt && mt.execucoes)) return e('div', { className: 'exc-tabela' }, e('div', { className: 'exc-vazio' }, [Icon('Inbox', 30, 'var(--muted-soft)', 1.3), 'Nenhuma execução neste período com esses filtros.']));
    return e(React.Fragment, null, [
      e('div', { key: 'k', className: 'exu-kpis' }, [
        kpi('ok', 'Chamados resolvidos', num(t.concluido), [cmp && e(Delta, { key: 'd', atual: t.concluido, anterior: ant.concluido }), cmp || num(t.chamados) + ' chamados atendidos'], e(Spark, { key: 's', valores: cols.map((c) => c.ok), cor: 'var(--accent)' })),
        kpi('taxa', 'Taxa de erro', pct((t.taxaErro || 0) * 100), [cmp && e(Delta, { key: 'd', atual: t.taxaErro, anterior: ant.taxaErro, menorMelhor: true }), num(t.erro) + ' com erro'], e(Spark, { key: 's', valores: cols.map((c) => (c.total ? c.erros / c.total : 0)), cor: 'var(--error)' })),
        kpi('h', 'Tempo economizado', (horasEco < 10 ? horasEco.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : num(horasEco)) + ' h', [cmp && e(Delta, { key: 'd', atual: horasEco, anterior: horasEcoAnt }), 'se fossem feitos à mão (estimativa)']),
        kpi('s', 'Tempo médio por chamado', segundos(t.duracaoMediaSeg), [cmp && e(Delta, { key: 'd', atual: t.duracaoMediaSeg, anterior: ant.duracaoMediaSeg, menorMelhor: true }), 'do início ao fim']),
        kpi('a', 'Execuções manuais', mt ? num(mt.execucoes) : 'Sem dados', mt ? (mt.itens ? num(mt.concluidos) + ' de ' + num(mt.itens) + ' itens concluídos' : 'pela tela da automação') : 'não carregou'),
        kpi('m', 'Média por dia útil', (t.total / uteis).toLocaleString('pt-BR', { maximumFractionDigits: 1 }), 'execuções pelos chamados'),
      ]),

      e(Cartao, {
        key: 'g', titulo: dias.length === 1 && cobre ? 'Resolvidos por hora' : semanal ? 'Resolvidos por semana' : 'Resolvidos por dia',
        sub: semanal && dias.length <= 31 ? 'Por semana: o dia a dia só sai quando as 200 últimas execuções cobrem o período.' : 'Passe o mouse em uma coluna para ver os números.',
        acao: e(Seg, { valor: modo, mudar: setModo, rotulo: 'Ver como', opcoes: [['grafico', 'Gráfico'], ['tabela', 'Tabela']] }),
      }, modo === 'grafico' ? [e(Legenda, { key: 'l' }), e(Grafico, { key: 'g', cols })] : e('div', { style: { maxHeight: 320, overflowY: 'auto' } }, e(TabelaCols, { cols }))),

      e('div', { key: 'd1', className: 'exr-duas' }, [
        e(Cartao, { key: 't', titulo: 'Por tipo de chamado', sub: 'Do mais atendido para o menos atendido.' }, tipos.length ? e(Barras, { itens: tipos, max: Math.max(1, ...tipos.map((x) => x.total)) }) : e(Vazio, { texto: 'Sem execuções pelos chamados.' })),
        e(Cartao, { key: 'm', titulo: 'Motivos de erro', sub: motivos.length ? 'O que mais fez as automações pararem.' : 'Nenhum erro no período.' }, motivos.length ? e('div', { className: 'exr-barras' }, motivos.slice(0, 6).map((m) => e('div', { key: m.motivo }, [
          e('div', { key: 'r', className: 'exr-barra-rot' }, [e('span', { key: 'n', title: m.motivo }, m.motivo), e('span', { key: 'v' }, num(m.total) + (m.total === 1 ? ' vez' : ' vezes') + ' · ' + pct((m.total / (t.erro || 1)) * 100))]),
          e('div', { key: 't', className: 'exr-trilho', style: { width: (m.total / motivos[0].total) * 100 + '%' } }, e('div', { className: 'exr-seg erro', style: { flex: 1, maxWidth: 'none', margin: 0, borderRadius: 4 } })),
        ]))) : e(Vazio, { texto: 'Sem erros neste período.' })),
      ]),

      e('div', { key: 'd2', className: 'exr-duas' }, [
        e(Cartao, { key: 'h', titulo: 'Por hora do dia', sub: cobre ? 'Quando os chamados mais chegam para as automações.' : 'Pelas últimas 200 execuções (o período vai além delas).' }, ex.length ? [e(Grafico, { key: 'g', cols: porHora, altura: 150 })] : e(Vazio, { texto: 'Sem execuções no período.' })),
        e(Cartao, { key: 'a', titulo: 'Pelos chamados e manuais', sub: 'Pelos chamados: aba Chamados (automático ou clique). Manuais: tela da automação aberta pelo Hub.' }, [
          e('div', { key: 'b', className: 'exr-trilho', style: { height: 14, marginBottom: 14 } }, [
            t.total ? e('div', { key: 'a', style: { flex: t.total, background: 'var(--accent)' }, title: 'Pelos chamados' }) : null,
            mt && mt.execucoes ? e('div', { key: 'm', style: { flex: mt.execucoes, background: 'var(--muted-soft)' }, title: 'Manuais' }) : null,
          ]),
          e('table', { key: 't', className: 'exr-tab' }, [
            e('thead', { key: 'h' }, e('tr', null, [e('th', { key: 'o' }, 'Origem'), e('th', { key: 'n', className: 'num' }, 'Execuções'), e('th', { key: 'p', className: 'num' }, 'Parte'), e('th', { key: 'e', className: 'num' }, 'Taxa de erro')])),
            e('tbody', { key: 'b' }, [
              ['ch', 'Pelos chamados', 'var(--accent)', t.total, t.total ? t.erro / t.total : null],
              ['ma', 'Manuais', 'var(--muted-soft)', mt ? mt.execucoes : 0, mt && mt.itens ? mt.erros / mt.itens : null],
            ].map(([k, tx, cor, n, taxa]) => e('tr', { key: k }, [
              e('td', { key: 'o' }, e('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 8 } }, [e('i', { key: 'i', style: { width: 10, height: 10, borderRadius: 3, background: cor } }), tx])),
              e('td', { key: 'n', className: 'num' }, num(n)),
              e('td', { key: 'p', className: 'num' }, t.total + (mt ? mt.execucoes : 0) ? pct((n / (t.total + (mt ? mt.execucoes : 0))) * 100) : 'Sem dados'),
              e('td', { key: 'e', className: 'num' }, taxa == null ? 'Sem dados' : pct(taxa * 100)),
            ]))),
          ]),
        ]),
      ]),

      e('div', { key: 'd3', className: 'exr-duas' }, [
        e(Cartao, { key: 'as', titulo: 'Associações', sub: 'Clique no título de uma coluna para ordenar.' }, assocs.length ? e('div', { style: { overflowX: 'auto' } }, e('table', { className: 'exr-tab' }, [
          e('thead', { key: 'h' }, e('tr', null, [th('a', 'Associação'), th('total', 'Chamados', 'num'), th('ok', 'Resolvidos', 'num'), th('erros', 'Com erro', 'num'), th('taxa', 'Taxa', 'num')])),
          e('tbody', { key: 'b' }, assocs.map((x) => e('tr', { key: x.a }, [
            e('td', { key: 'a' }, x.a), e('td', { key: 't', className: 'num' }, num(x.total)), e('td', { key: 'o', className: 'num' }, num(x.ok)), e('td', { key: 'e', className: 'num' }, num(x.erros)),
            e('td', { key: 'x', className: 'num' }, e(Sit, { tipo: x.taxa >= 25 ? 'erro' : x.taxa >= 10 ? 'pendencia' : 'concluido', texto: pct(x.taxa) })),
          ]))),
        ])) : e(Vazio, { texto: 'Sem associações no período.' })),
        e(Cartao, { key: 'ap', titulo: 'Quem aprovou', sub: 'Pessoa do token do GLPI que rodou ou ligou o automático.' }, (res.aprovadores || []).length ? e('table', { className: 'exr-tab' }, [
          e('thead', { key: 'h' }, e('tr', null, [e('th', { key: 'n' }, 'Pessoa'), e('th', { key: 't', className: 'num' }, 'Execuções'), e('th', { key: 'o', className: 'num' }, 'Resolvidos'), e('th', { key: 'e', className: 'num' }, 'Com erro')])),
          e('tbody', { key: 'b' }, res.aprovadores.map((p) => e('tr', { key: p.nome }, [e('td', { key: 'n' }, p.nome), e('td', { key: 't', className: 'num' }, num(p.total)), e('td', { key: 'o', className: 'num' }, num(p.concluido)), e('td', { key: 'e', className: 'num' }, num(p.erro))]))),
        ]) : e(Vazio, { texto: 'Sem aprovações no período.' })),
      ]),

      e(Cartao, {
        key: 'ch', titulo: 'Chamados atendidos', sub: (recentes.length ? num(recentes.length) + ' no período' : 'Nenhum no período') + (cobre ? '' : ' (entre as 200 execuções mais recentes)') + ', do mais recente para o mais antigo. Clique para ver o chamado e a resposta que foi ao GLPI.',
        acao: e(Seg, { valor: exibir, mudar: (x) => { setExibir(x); gravar('arxhub_v3_res_exibir', x); }, rotulo: 'Exibição', opcoes: [['lista', 'Lista'], ['cartoes', 'Cartões']] }),
      }, [
        !fatia.length ? e(Vazio, { key: 'v', texto: hist.erro ? 'Falha ao buscar as execuções: ' + hist.erro : 'Nenhuma execução pelos chamados neste período.' })
          : exibir === 'lista'
            ? e('div', { key: 'l', style: { overflowX: 'auto' } }, e('table', { className: 'exr-tab' }, [
                e('thead', { key: 'h' }, e('tr', null, [e('th', { key: 'c' }, 'Chamado'), e('th', { key: 'q' }, 'Quando'), e('th', { key: 't' }, 'Tipo'), e('th', { key: 'a' }, 'Associação'), e('th', { key: 'o' }, 'Aprovado por'), e('th', { key: 'd', className: 'num' }, 'Duração'), e('th', { key: 's' }, 'Situação')])),
                e('tbody', { key: 'b' }, fatia.map((x) => e('tr', { key: x.id, className: 'exr-clicavel', tabIndex: 0, onClick: () => abrir(x), onKeyDown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(x); } } }, [
                  e('td', { key: 'c', style: { fontFamily: 'var(--font-mono)', fontSize: 12 } }, '#' + x.glpiTicketId), e('td', { key: 'q' }, quando(x)),
                  e('td', { key: 't' }, x.titulo || x.tipo), e('td', { key: 'a' }, nomeAssoc(x)), e('td', { key: 'o' }, x.aprovadoPor ? x.aprovadoPor.replace(/^\(Sistemas\)\s*/, '') : 'Não informado'),
                  e('td', { key: 'd', className: 'num' }, durExec(x)), e('td', { key: 's' }, [sitExec(x), x.modoTeste && x.status !== 'teste' ? ' (teste)' : null]),
                ]))),
              ]))
            : e('div', { key: 'c', className: 'exc-cartoes' }, fatia.map((x) => e('div', { key: x.id, className: 'exc-cartao', role: 'button', tabIndex: 0, style: { height: 'auto' }, onClick: () => abrir(x), onKeyDown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(x); } } }, [
                e('div', { key: 't', className: 'exc-cartao-topo' }, [e('span', { key: 'n', className: 'exc-id' }, '#' + x.glpiTicketId), sitExec(x)]),
                e('h4', { key: 'h' }, x.titulo || x.tipo),
                e('p', { key: 'p' }, String(x.resultado || 'Sem texto').split('\n')[0]),
                e('div', { key: 'r', className: 'exc-cartao-pe' }, [e('span', { key: 'a' }, nomeAssoc(x)), e('span', { key: 'q' }, quando(x) + ' · ' + durExec(x))]),
              ]))),
        totalPag > 1 ? e('nav', { key: 'p', className: 'exc-paginacao', style: { marginTop: 14 }, 'aria-label': 'Páginas' }, [
          e('span', { key: 't' }, 'Página ' + (pagina + 1) + ' de ' + totalPag),
          e('div', { key: 'b', style: { display: 'flex', gap: 6 } }, [
            e('button', { key: 'a', type: 'button', className: 'exu-btn pequeno', disabled: pagina === 0, onClick: () => setPagina(pagina - 1) }, 'Anterior'),
            e('button', { key: 'p', type: 'button', className: 'exu-btn pequeno', disabled: pagina >= totalPag - 1, onClick: () => setPagina(pagina + 1) }, 'Próxima'),
          ]),
        ]) : null,
      ]),
      e('p', { key: 'n', style: { margin: 0, fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 } }, [Icon('AlertCircle', 13, 'currentColor'), 'Tempo economizado: cada chamado resolvido conta os minutos que levaria à mão naquele tipo (estimativa).']),
      ver && window.VerChamado ? e(window.VerChamado, { key: 'ver', item: ver, userToken: (window.ArxAcessosHub.ler() || {}).userToken, onFechar: () => setVer(null) }) : null,
    ]);
  }

  // Manuais: execuções feitas pela tela da automação aberta no Hub (registradas pelo proxy do Hub)
  function Manuais({ man }) {
    const t = man.totais;
    if (!t.execucoes) return e('div', { className: 'exc-tabela' }, e('div', { className: 'exc-vazio' }, [Icon('Inbox', 30, 'var(--muted-soft)', 1.3), 'Nenhuma execução manual neste período.']));
    const kpi = (k, rot, val, det) => e('div', { key: k, className: 'exu-kpi' }, [e('div', { key: 'r', className: 'exu-kpi-rot' }, rot), e('div', { key: 'v', className: 'exu-kpi-val' }, val), e('div', { key: 'd', className: 'exu-kpi-det' }, det)]);
    const tab = (cab, linhas) => e('div', { style: { overflowX: 'auto' } }, e('table', { className: 'exr-tab' }, [
      e('thead', { key: 'h' }, e('tr', null, cab.map((c, i) => e('th', { key: i, className: i ? 'num' : '' }, c)))),
      e('tbody', { key: 'b' }, linhas),
    ]));
    return e(React.Fragment, null, [
      e('div', { key: 'k', className: 'exu-kpis' }, [
        kpi('x', 'Execuções manuais', num(t.execucoes), t.rodando ? num(t.rodando) + ' em andamento' : num(t.itens) + ' itens processados'),
        kpi('c', 'Itens concluídos', num(t.concluidos), num(t.erros) + ' com erro'),
        kpi('t', 'Tempo economizado', duracao((man.tempoEconomizado && man.tempoEconomizado.minutos) || 0), 'itens × minutos à mão (estimativa)'),
        kpi('d', 'Duração média', segundos(t.duracaoMediaSeg), 'por execução'),
      ]),
      e('div', { key: 'd', className: 'exr-duas' }, [
        e(Cartao, { key: 'a', titulo: 'Por automação', sub: 'Execuções e itens de cada automação.' }, tab(['Automação', 'Execuções', 'Itens', 'Concluídos', 'Erros'],
          man.porAutomacao.map((a) => e('tr', { key: a.automacaoId }, [e('td', { key: 'n' }, a.nome), e('td', { key: 'x', className: 'num' }, num(a.execucoes)), e('td', { key: 'i', className: 'num' }, num(a.itens)), e('td', { key: 'c', className: 'num' }, num(a.concluidos)), e('td', { key: 'e', className: 'num' }, num(a.erros))])))),
        e(Cartao, { key: 'p', titulo: 'Quem rodou', sub: 'Pessoa do token do GLPI ao abrir a automação no Hub.' }, tab(['Pessoa', 'Execuções', 'Concluídos', 'Erros'],
          man.porPessoa.map((p) => e('tr', { key: p.nome }, [e('td', { key: 'n' }, p.nome), e('td', { key: 'x', className: 'num' }, num(p.execucoes)), e('td', { key: 'c', className: 'num' }, num(p.concluidos)), e('td', { key: 'e', className: 'num' }, num(p.erros))])))),
      ]),
      e(Cartao, { key: 'r', titulo: 'Últimas execuções', sub: 'As 30 mais recentes do período.' }, tab(['Quando', 'Automação', 'Pessoa', 'Itens'],
        man.recentes.map((r) => e('tr', { key: r.id }, [
          e('td', { key: 'q' }, new Date(r.inicio).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })),
          e('td', { key: 'a', className: 'num' }, r.automacaoNome), e('td', { key: 'p', className: 'num' }, r.quem || 'Sem identificação'),
          e('td', { key: 'i', className: 'num' }, r.itens ? num(r.concluidos) + ' de ' + num(r.itens) : 'Não informado'),
        ])))),
    ]);
  }

  // Disponibilidade: uma linha por automação do Hub (casada pela chave servico:<container>) e uma por outro item
  // monitorado que teve alerta (SGA, banco, GLPI...). Cada incidente conta no dia em que começou.
  function Disponibilidade({ alertas, faixa, automacoes, de, ate }) {
    const [foco, setFoco] = useState(null);
    const [todos, setTodos] = useState(false);
    const periodoSeg = (Math.min(ate.getTime() + DIA, Date.now()) - de.getTime()) / 1000;
    const curto = (ate - de) / DIA < 6;
    const iniFaixa = curto ? new Date(ate - 29 * DIA) : de;
    const diasFaixa = diasDe(iniFaixa, ate);
    const incFaixa = (faixa || alertas).incidentes || [];
    const porChave = new Map((alertas.porServico || []).map((s) => [s.chave, s]));
    const linhas = [];
    automacoes.forEach((a) => {
      const chave = a.container ? 'servico:' + a.container : null;
      const s = chave ? porChave.get(chave) : null;
      if (s) porChave.delete(chave);
      linhas.push({ chave, nome: a.name, agora: a.status === 'online' ? 'online' : a.status === 'offline' ? 'offline' : 'desconhecido', s });
    });
    porChave.forEach((s) => linhas.push({ chave: s.chave, nome: s.titulo, agora: s.abertas ? 'offline' : 'online', s }));
    linhas.forEach((l) => { l.fora = l.s ? l.s.tempoForaSeg : 0; l.pct = 100 - Math.min(100, (l.fora / periodoSeg) * 100); l.quedas = l.s ? l.s.quedas : 0; });
    linhas.sort((x, y) => x.pct - y.pct || String(x.nome).localeCompare(String(y.nome), 'pt-BR'));
    const t = alertas.totais;
    const media = linhas.length ? linhas.reduce((s, l) => s + l.pct, 0) / linhas.length : 100;
    const doDia = (chave, d) => incFaixa.filter((i) => i.chave === chave && i.dia === iso(d));
    const corDia = (l) => { const s = l.reduce((m, i) => m + i.duracaoSeg, 0); return !l.length ? '' : s < 900 ? ' alerta' : ' queda'; };
    const fmtPct = (p) => (Math.floor(p * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    const kpi = (k, rot, val, det) => e('div', { key: k, className: 'exu-kpi' }, [e('div', { key: 'r', className: 'exu-kpi-rot' }, rot), e('div', { key: 'v', className: 'exu-kpi-val' }, val), e('div', { key: 'd', className: 'exu-kpi-det' }, det)]);
    const quedas = (alertas.incidentes || []).slice().sort((x, y) => Date.parse(y.iniciadoEm) - Date.parse(x.iniciadoEm));
    const hora = (s) => new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return e(React.Fragment, null, [
      e('div', { key: 'k', className: 'exu-kpis' }, [
        kpi('m', 'Disponibilidade média', fmtPct(media), 'de ' + linhas.length + ' automações e serviços'),
        kpi('q', 'Quedas e alertas', num(t.quedas), t.quedas ? num(t.erros) + ' quedas e ' + num(t.avisos) + ' avisos' : 'nenhum no período'),
        kpi('f', 'Tempo fora do ar', duracao(t.tempoForaSeg / 60), 'somando todos'),
        kpi('v', 'Tempo médio para voltar', t.tempoMedioParaVoltarSeg ? duracao(t.tempoMedioParaVoltarSeg / 60) : 'Sem dados', t.abertas ? num(t.abertas) + (t.abertas === 1 ? ' ainda aberto' : ' ainda abertos') : 'nenhum aberto agora'),
      ]),
      e(Cartao, {
        key: 'l', titulo: 'Automações e serviços', sub: (curto ? 'A faixa mostra os últimos 30 dias; a porcentagem vale para o período escolhido. ' : 'Cada bloco é um dia. ') + 'Passe o mouse para ver os alertas.',
        acao: e('div', { className: 'exr-legenda' }, [e('span', { key: 'o' }, [e('i', { key: 'i', className: 'ok' }), 'Sem alerta']), e('span', { key: 'a' }, [e('i', { key: 'i', className: 'alerta' }), 'Menos de 15 min']), e('span', { key: 'e' }, [e('i', { key: 'i', className: 'erro' }), '15 min ou mais'])]),
      }, [
        e('div', { key: 'l', className: 'exd-lista' }, linhas.map((l, li) => e('div', { key: l.chave || l.nome, className: 'exd-linha' }, [
          e('div', { key: 'n', className: 'exd-nome' }, [e('b', { key: 'b', title: l.nome }, l.nome), e(Sit, { key: 's', tipo: l.agora === 'online' ? 'concluido' : l.agora === 'offline' ? 'erro' : 'pendencia', texto: l.agora === 'online' ? 'No ar' : l.agora === 'offline' ? 'Fora do ar' : 'Sem retorno' })]),
          // a faixa é uma parada só no teclado, com o resumo dos dias; o detalhe de cada alerta está na lista "Quedas e alertas"
          e('div', {
            key: 'f', className: 'exd-faixa', tabIndex: 0, role: 'img',
            'aria-label': (() => { const n = diasFaixa.filter((d) => l.chave && doDia(l.chave, d).length).length; return l.nome + ': ' + (n ? n + (n === 1 ? ' dia com alerta' : ' dias com alerta') : 'nenhum dia com alerta') + ' de ' + diasFaixa.length; })(),
          }, diasFaixa.map((d, i) => {
            const inc = l.chave ? doDia(l.chave, d) : [];
            return e('div', {
              key: i, className: 'exd-dia' + corDia(inc), 'aria-hidden': 'true',
              onMouseEnter: () => setFoco(li + ':' + i), onMouseLeave: () => setFoco(null),
            }, foco === li + ':' + i ? e('div', { className: 'exd-dica' + (i < diasFaixa.length / 4 ? ' esq' : i > (diasFaixa.length * 3) / 4 ? ' dir' : '') }, [
              e('b', { key: 'b', style: { display: 'block', marginBottom: 4 } }, diaLongo(d)),
              inc.length ? inc.map((q) => e('div', { key: q.id }, hora(q.iniciadoEm) + ' · ' + duracao(q.duracaoSeg / 60) + ' · ' + q.titulo)) : e('div', { key: 's' }, 'Sem alerta'),
            ]) : null);
          })),
          e('div', { key: 'p', className: 'exd-pct', style: { color: l.pct < 99.5 ? 'var(--warn)' : 'var(--text)' } }, fmtPct(l.pct)),
        ]))),
        e('div', { key: 'x', className: 'exd-eixo', 'aria-hidden': 'true' }, [e('span', { key: 'a' }, dia(iniFaixa)), e('span', { key: 'b' }, dia(ate))]),
      ]),
      e(Cartao, { key: 'i', titulo: 'Quedas e alertas', sub: quedas.length ? 'Do mais recente para o mais antigo. ' + alertas.explicacao : 'Nenhum alerta no período.' }, quedas.length ? [
        e('ul', { key: 'l', className: 'exd-incidentes' }, quedas.slice(0, todos ? quedas.length : 8).map((q) => e('li', { key: q.id }, [
          e('span', { key: 'q', style: { color: 'var(--muted)', fontSize: 12.5 } }, dia(new Date(q.iniciadoEm)) + ' ' + hora(q.iniciadoEm)),
          e('div', { key: 'n' }, [e('b', { key: 'b', style: { fontWeight: 600 } }, q.titulo), e('small', { key: 's' }, q.detalhe || (q.nivel === 'aviso' ? 'Aviso' : 'Queda'))]),
          e(Sit, { key: 's', tipo: q.aberto ? 'erro' : q.duracaoSeg >= 900 ? 'erro' : 'pendencia', texto: q.aberto ? 'Aberto há ' + duracao(q.duracaoSeg / 60) : 'Fora por ' + duracao(q.duracaoSeg / 60) }),
        ]))),
        quedas.length > 8 ? e('button', { key: 'b', type: 'button', className: 'exu-btn pequeno', style: { marginTop: 10 }, onClick: () => setTodos(!todos) }, todos ? 'Mostrar menos' : 'Ver todos os ' + quedas.length + ' alertas') : null,
      ] : e(Vazio, { texto: 'Tudo no ar o período inteiro.' })),
    ]);
  }

  function ResultadosV3() {
    const [aba, setAba] = useState(() => ler('arxhub_v3_res_aba', 'tratados'));
    const [periodo, setPeriodo] = useState(() => ler('arxhub_v3_periodo', { chave: 'mes', comparar: true }));
    const [filtros, setFiltros] = useState({ assoc: '', tipo: '', origem: '', teste: false });
    const [res, setRes] = useState({ carregando: true, dados: null, erro: null });
    const [hist, setHist] = useState({ itens: [], erro: null });
    const [man, setMan] = useState(null);
    const [disp, setDisp] = useState({ carregando: true, dados: null, faixa: null, erro: null });
    const [automacoes, setAutomacoes] = useState([]);
    const [assocs, setAssocs] = useState([]);
    const [nomesTipos, setNomesTipos] = useState({});
    const [recarga, setRecarga] = useState(0);
    const mudarPeriodo = (p) => { setPeriodo(p); gravar('arxhub_v3_periodo', p); };
    const mudarAba = (a) => { setAba(a); gravar('arxhub_v3_res_aba', a); };
    const [de, ate] = intervalo(periodo);
    const desde = iso(de);
    const ateIso = iso(ate);

    useEffect(() => {
      obter(`${SERVICO}/api/associacoes`).then((l) => Array.isArray(l) && setAssocs(l.filter((a) => a.ativo !== false).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')))).catch(() => setAssocs([]));
      obter('/api/automations').then((l) => setAutomacoes(Array.isArray(l) ? l : [])).catch(() => setAutomacoes([]));
    }, []);
    useEffect(() => {
      obter(`${SERVICO}/api/historico`).then((d) => setHist({ itens: Array.isArray(d.itens) ? d.itens : [], erro: d.erro || null })).catch((err) => setHist({ itens: [], erro: err.message }));
    }, [recarga]);
    useEffect(() => {
      let vivo = true;
      setRes((x) => ({ ...x, carregando: true, erro: null }));
      const q = new URLSearchParams({ desde, ate: ateIso, incluirTeste: filtros.teste ? '1' : '0', comparar: '1' });
      if (filtros.assoc) q.set('associacaoId', filtros.assoc);
      if (filtros.tipo) q.set('tipo', filtros.tipo);
      obter(`${SERVICO}/api/resultados?${q}`)
        .then((d) => { if (!vivo) return; setRes({ carregando: false, dados: d, erro: null }); if (d.nomesTipos) setNomesTipos(d.nomesTipos); })
        .catch((err) => vivo && setRes({ carregando: false, dados: null, erro: err.message }));
      const qm = new URLSearchParams({ desde, ate: ateIso, incluirTeste: filtros.teste ? '1' : '0' });
      obter(`/api/execucoes/resumo?${qm}`).then((d) => vivo && setMan(d)).catch(() => vivo && setMan(null));
      return () => { vivo = false; };
    }, [desde, ateIso, filtros.assoc, filtros.tipo, filtros.teste, recarga]);
    useEffect(() => {
      if (aba !== 'disp') return undefined;
      let vivo = true;
      setDisp((x) => ({ ...x, carregando: true, erro: null }));
      const curto = (ate - de) / DIA < 6;
      const pedidos = [obter(`${SERVICO}/api/alertas/historico?desde=${desde}&ate=${ateIso}`)];
      if (curto) pedidos.push(obter(`${SERVICO}/api/alertas/historico?desde=${iso(new Date(ate - 29 * DIA))}&ate=${ateIso}`));
      Promise.all(pedidos)
        .then(([d, f]) => vivo && setDisp({ carregando: false, dados: d, faixa: f || null, erro: null }))
        .catch((err) => vivo && setDisp({ carregando: false, dados: null, faixa: null, erro: err.message }));
      return () => { vivo = false; };
    }, [aba, desde, ateIso, recarga]);

    const nomeAssoc = (x) => { const a = assocs.find((y) => String(y.id) === String(x.associacaoId)); return a ? a.nome : x.categoria || 'Não informado'; };
    const filtro = (k, rot, opcoes) => e('select', { key: k, className: 'exu-select', value: filtros[k], onChange: (ev) => setFiltros(Object.assign({}, filtros, { [k]: ev.target.value })), 'aria-label': rot }, opcoes.map(([v, t]) => e('option', { key: v, value: v }, t)));
    const temFiltro = filtros.assoc || filtros.tipo || filtros.origem || filtros.teste;

    let corpo;
    if (aba === 'disp') {
      corpo = disp.erro ? e(Falha, { key: 'e', texto: 'Falha ao buscar a disponibilidade: ' + disp.erro })
        : !disp.dados ? e(Carregando, { key: 'c' })
          : e(Disponibilidade, { key: 'd', alertas: disp.dados, faixa: disp.faixa, automacoes, de, ate });
    } else if (filtros.origem === 'manuais') {
      corpo = man ? e(Manuais, { key: 'm', man }) : e(Carregando, { key: 'c' });
    } else {
      corpo = res.erro ? e(Falha, { key: 'e', texto: 'Falha ao buscar os resultados: ' + res.erro })
        : !res.dados ? e(Carregando, { key: 'c' })
          : e(Tratados, { key: 't', res: res.dados, hist, man: filtros.origem === 'chamados' ? null : man, de, ate, filtros, periodo, nomeAssoc });
    }

    return e('div', { className: 'exu-tela' }, [
      e('header', { key: 'cab', className: 'exu-cab' }, [
        e('div', { key: 't' }, [
          e('h2', { key: 'h' }, 'Resultados'),
          e('p', { key: 'p' }, [(de.getTime() === ate.getTime() ? diaLongo(de) : diaLongo(de) + ' a ' + diaLongo(ate)), res.carregando && res.dados ? ' · atualizando…' : '']),
        ]),
        e('div', { key: 'a', className: 'exu-acoes' }, [
          e(SeletorPeriodo, { key: 'per', periodo, mudar: mudarPeriodo }),
          e('button', { key: 'r', type: 'button', className: 'exu-btn', onClick: () => setRecarga((n) => n + 1), title: 'Atualizar', 'aria-label': 'Atualizar' }, Icon('RefreshCw', 14, 'currentColor')),
        ]),
      ]),
      e('div', { key: 'abas', className: 'exu-abas', role: 'tablist' }, [['tratados', 'Chamados tratados'], ['disp', 'Disponibilidade']].map(([k, t]) => e('button', {
        key: k, type: 'button', role: 'tab', className: 'exu-aba', 'aria-selected': aba === k ? 'true' : 'false', onClick: () => mudarAba(k),
      }, t))),
      aba === 'tratados' ? e('div', { key: 'f', className: 'exu-barra' }, [
        filtro('assoc', 'Associação', [['', 'Todas as associações'], ...assocs.map((a) => [String(a.id), a.nome])]),
        filtro('tipo', 'Tipo', [['', 'Todos os tipos'], ...Object.entries(nomesTipos).map(([k, n]) => [k, n])]),
        filtro('origem', 'Origem', [['', 'Pelos chamados e manuais'], ['chamados', 'Só pelos chamados'], ['manuais', 'Só manuais']]),
        e('label', { key: 'te', className: 'exu-chave' }, [e('input', { key: 'i', type: 'checkbox', className: 'admin-chave', role: 'switch', checked: filtros.teste, onChange: (ev) => setFiltros(Object.assign({}, filtros, { teste: ev.target.checked })) }), 'Incluir modo teste']),
        temFiltro ? e('button', { key: 'l', type: 'button', className: 'exu-btn pequeno', onClick: () => setFiltros({ assoc: '', tipo: '', origem: '', teste: false }) }, 'Limpar filtros') : null,
      ]) : null,
      corpo,
    ]);
  }

  window.ResultadosView = ResultadosV3;
})();
