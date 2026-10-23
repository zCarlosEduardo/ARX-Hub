// Aba Resultados do Hub v1 (layout da maquete) com os dados reais:
// totais, tipos, motivos, associações e aprovadores vêm do resumo do banco-central (/api/resultados); a lista de chamados
// atendidos e os gráficos por dia e por hora vêm das últimas 200 execuções (/api/historico); as manuais, do Hub
// (/api/execucoes/resumo); a Disponibilidade, do histórico de alertas do monitor (/api/alertas/historico).
// Os gráficos são do charts.js (Charts.diverging e Charts.bars). Expõe window.ResultadosView.
(function () {
  const e = React.createElement;
  const { useState, useEffect, useRef } = React;
  const { Icon } = window.Icons;
  const SERVICO = `${location.origin}/servicos/chamados`;
  const DIA = 86400000;
  const LIMITE_HIST = 200; // o /api/historico devolve as 200 execuções mais recentes

  const num = (n) => Math.round(Number(n) || 0).toLocaleString('pt-BR');
  const pct = (n, casas = 1) => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: casas }) + '%';
  const dia = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const diaLongo = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const deIso = (s) => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
  const duracao = (min) => (min < 60 ? Math.round(min) + ' min' : Math.floor(min / 60) + ' h ' + String(Math.round(min % 60)).padStart(2, '0') + ' min');
  const segundos = (s) => (s == null ? 'Sem dados' : s >= 60 ? Math.floor(s / 60) + ' min ' + (Math.round(s) % 60) + ' s' : Math.round(s) + ' s');
  const plural = (n, um, varios) => num(n) + ' ' + (n === 1 ? um : varios);
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
    ['mes', 'Este mês', (H) => [new Date(H.getFullYear(), H.getMonth(), 1), H]],
    ['mes_passado', 'Mês passado', (H) => [new Date(H.getFullYear(), H.getMonth() - 1, 1), new Date(H.getFullYear(), H.getMonth(), 0)]],
    ['30', 'Últimos 30 dias', (H) => [new Date(H - 29 * DIA), H]],
    ['84', 'Últimas 12 semanas', (H) => [new Date(H - 83 * DIA), H]],
  ];
  const intervalo = (p) => (p.chave === 'custom' ? [deIso(p.de), deIso(p.ate)] : (ATALHOS.find((a) => a[0] === p.chave) || ATALHOS[3])[2](hojeMeiaNoite()));
  const diasDe = (de, ate) => { const l = []; for (let t = de.getTime(); t <= ate.getTime(); t += DIA) l.push(new Date(t)); return l; };
  // rótulos do eixo x: uns cinco, igualmente espaçados, sempre com o último
  const marcasX = (n) => { if (n <= 8) return null; const passo = Math.ceil(n / 5); const l = []; for (let i = 0; i < n; i += passo) l.push(i); if (l[l.length - 1] !== n - 1) l.push(n - 1); return l; };

  // execução em modo teste conta como erro quando o texto que iria pro chamado é de erro (mesma regra do banco-central)
  const TEXTO_ERRO = /^(A automação não|A automação do fechamento falhou|Não consegui)/;
  const ehErro = (x) => x.status === 'erro' || (x.status === 'teste' && TEXTO_ERRO.test(String(x.resultado || '')));
  const contar = (l) => { const f = l.filter((x) => x.status !== 'executando'); const erros = f.filter(ehErro).length; return { ok: f.length - erros, erros, total: f.length }; };

  // ---------- peças ----------
  // Gráfico do charts.js: desenha num nó novo a cada mudança de dados (o anterior sai junto com o observador de tamanho dele).
  function Grafico({ desenhar, dados, className }) {
    const caixa = useRef(null);
    const chave = JSON.stringify(dados);
    useEffect(() => {
      const no = document.createElement('div');
      caixa.current.replaceChildren(no);
      desenhar(no);
    }, [chave]); // eslint-disable-line
    return e('div', { ref: caixa, className });
  }
  const Kpi = ({ rot, valor, det, ruim }) => e('div', { className: 'kpi' }, [
    e('div', { key: 'r', className: 'kpi-label' }, rot),
    e('div', { key: 'v', className: 'kpi-value' + (ruim ? ' ruim' : '') }, valor),
    det ? e('div', { key: 'd', className: 'delta' }, det) : null,
  ]);
  // valor com a unidade menor ao lado, como na maquete (8,5 h; 2 min 4 s)
  const comUnidades = (texto) => (/\d/.test(texto) ? String(texto).split(/(\d[\d.,]*)/).filter(Boolean).map((p, i) => (/^\d/.test(p) ? p : e('small', { key: i }, p.trim()))) : texto);
  // variação contra o período anterior (null quando não dá para comparar: sem dado ou anterior zerado)
  const variacao = (atual, anterior, pontos) => (anterior == null || !isFinite(anterior) || atual == null ? null
    : pontos ? (atual - anterior) * 100 : anterior === 0 ? null : ((atual - anterior) / anterior) * 100);
  function Variacao({ atual, anterior, menorMelhor, pontos }) {
    const v = variacao(atual, anterior, pontos);
    const bom = menorMelhor ? v <= 0 : v >= 0;
    return e('span', { className: bom ? 'bom' : 'mau' }, (v > 0 ? '+' : v < 0 ? '−' : '') + (pontos ? Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' p.p.' : pct(Math.abs(v))));
  }
  const Cartao = ({ titulo, meta, acao, children, id }) => e('section', { className: 'cartao c12', 'aria-labelledby': 'r-' + id }, [
    e('header', { key: 'h' }, [e('h2', { key: 't', id: 'r-' + id }, titulo), meta ? e('span', { key: 'm', className: 'meta' }, meta) : null, acao || null]),
    children,
  ]);
  const Seg = ({ valor, opcoes, mudar, rotulo }) => e('div', { className: 'segmentado', role: 'group', 'aria-label': rotulo }, opcoes.map(([v, t]) => e('button', { key: v, type: 'button', 'aria-pressed': valor === v ? 'true' : 'false', onClick: () => mudar(v) }, t)));
  // lista em que a própria linha é a barra (parte do total)
  const Parte = ({ linhas, total, erro, texto }) => {
    const max = Math.max(1, ...linhas.map((l) => l.valor));
    return e('table', { className: 'parte' }, e('tbody', null, linhas.map((l) => e('tr', { key: l.nome, title: l.titulo || undefined }, [
      e('td', { key: 'n' }, [e('span', { key: 'f', className: 'fundo' + (erro ? ' erro' : ''), style: { width: (l.valor / max) * 100 + '%' } }), e('span', { key: 't' }, l.nome)]),
      e('td', { key: 'p', className: 'dir num faint' }, e('span', null, total ? pct((l.valor / total) * 100) : 'Sem dados')),
      e('td', { key: 'v', className: 'dir num' }, e('span', null, texto ? texto(l) : num(l.valor))),
    ]))));
  };
  const Tabela = ({ cab, linhas, classe }) => e('div', { style: { overflowX: 'auto' } }, e('table', { className: classe || '' }, [
    e('thead', { key: 'h' }, e('tr', null, cab.map((c, i) => (typeof c === 'string' ? e('th', { key: i, className: i && /^(Execuções|Itens|Concluídos|Erros|Chamados|Resolvidos|Com erro|Taxa|Taxa de erro|Parte|Duração)$/.test(c) ? 'dir' : '' }, c) : React.cloneElement(c, { key: i }))))),
    e('tbody', { key: 'b' }, linhas),
  ]));
  const td = (k, v, cls) => e('td', { key: k, className: cls || undefined }, v);
  const Vazio = ({ texto }) => e('p', { className: 'vazio' }, texto);
  const Carregando = () => e('div', { className: 'res-carregando' }, [e('span', { key: 's', style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 18, 'currentColor')), 'Buscando os resultados…']);
  const Falha = ({ texto }) => e('div', { className: 'exc-aviso', role: 'alert' }, [Icon('AlertCircle', 16, 'currentColor'), texto]);

  // Atalhos de período em pílulas e "Escolher período" (datas e comparação com o período anterior)
  function Periodo({ periodo, mudar }) {
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
    }, [aberto]); // eslint-disable-line
    const hoje = iso(hojeMeiaNoite());
    const valido = rascunho.de && rascunho.ate && rascunho.de <= rascunho.ate && rascunho.ate <= hoje;
    // a faixa de atalhos rola na horizontal no celular; a janelinha fica fora dela para não ser cortada
    return e('div', { ref: caixa, className: 'filtros-pop' }, [
      e('div', { key: 'f', className: 'filtros' }, [
        e(Seg, { key: 's', rotulo: 'Período', valor: periodo.chave, opcoes: ATALHOS.map(([k, t]) => [k, t]), mudar: (k) => mudar({ ...periodo, chave: k }) }),
        e('button', { key: 'b', type: 'button', className: 'btn texto', 'aria-expanded': aberto ? 'true' : 'false', 'aria-pressed': periodo.chave === 'custom' ? 'true' : 'false', onClick: () => setAberto(!aberto) },
          periodo.chave === 'custom' ? dia(de) + ' a ' + dia(ate) : 'Escolher período'),
      ]),
      aberto ? e('div', { key: 'pop', className: 'periodo-pop', role: 'dialog', 'aria-label': 'Escolher período' }, [
        e('label', { key: 'de' }, ['De', e('input', { key: 'i', type: 'date', value: rascunho.de, max: hoje, onChange: (ev) => setRascunho({ ...rascunho, de: ev.target.value }) })]),
        e('label', { key: 'ate' }, ['Até', e('input', { key: 'i', type: 'date', value: rascunho.ate, max: hoje, onChange: (ev) => setRascunho({ ...rascunho, ate: ev.target.value }) })]),
        !valido ? e('span', { key: 'e', className: 'exu-campo-erro' }, 'A data inicial precisa ser antes da final, e a final até hoje.') : null,
        e('label', { key: 'c', className: 'troca-linha' }, [e('input', { key: 'i', type: 'checkbox', className: 'chave', checked: !!periodo.comparar, onChange: (ev) => mudar({ ...periodo, comparar: ev.target.checked }) }), e('span', { key: 't' }, 'Comparar com o período anterior')]),
        e('button', { key: 'ok', type: 'button', className: 'btn primario', disabled: !valido, onClick: () => { mudar({ ...periodo, chave: 'custom', de: rascunho.de, ate: rascunho.ate }); setAberto(false); } }, 'Aplicar'),
      ]) : null,
    ]);
  }

  const SIT_EXEC = { concluido: ['pos', 'Solucionado'], erro: ['neg', 'Erro'], teste: ['', 'Teste'], executando: ['warn', 'Rodando'] };
  const sitExec = (x) => { const s = SIT_EXEC[x.status] || ['', x.status]; return e('span', { className: 'pill ' + s[0] }, s[1] + (x.modoTeste && x.status !== 'teste' ? ' (teste)' : '')); };
  const quando = (x) => { const d = new Date(x.criadoEm); return dia(d) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  const durExec = (x) => (x.finalizadoEm ? segundos((Date.parse(x.finalizadoEm) - Date.parse(x.criadoEm)) / 1000) : 'Em andamento');

  function Tratados({ res, hist, man, de, ate, filtros, periodo, nomeAssoc }) {
    const [modo, setModo] = useState('grafico');
    const [ver, setVer] = useState(null);
    const [exibir, setExibir] = useState(() => ler('arxhub_v3_res_exibir', 'lista'));
    const [ordem, setOrdem] = useState(['taxa', -1]);
    const [pagina, setPagina] = useState(0);
    useEffect(() => setPagina(0), [de.getTime(), ate.getTime(), filtros.assoc, filtros.tipo, filtros.teste, exibir]); // eslint-disable-line

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
    const porHoraNoDia = dias.length === 1 && cobre;
    const cols = porHoraNoDia
      ? Array.from({ length: 24 }, (_, h) => Object.assign({ rotulo: h + 'h' }, contar(ex.filter((x) => new Date(x.criadoEm).getHours() === h)))).filter((c, h) => c.total || (h >= 7 && h <= 19))
      : semanal
        ? (res.semanas || []).map((s) => ({ rotulo: dia(deIso(s.semana)), ok: s.concluido, erros: s.erro, total: s.concluido + s.erro }))
        : dias.map((d) => Object.assign({ rotulo: dia(d) }, contar(ex.filter((x) => { const t0 = Date.parse(x.criadoEm); return t0 >= d.getTime() && t0 < d.getTime() + DIA; }))));
    const emAndamento = !semanal && !porHoraNoDia && iso(ate) === iso(hojeMeiaNoite()) ? cols.length - 1 : null;
    const horas = Array.from({ length: 24 }, (_, h) => Object.assign({ rotulo: h + 'h' }, contar(ex.filter((x) => new Date(x.criadoEm).getHours() === h))));
    const comDado = horas.filter((c) => c.total).map((c) => parseInt(c.rotulo, 10));
    const porHora = horas.slice(Math.min(7, ...comDado), Math.max(19, ...comDado) + 1);

    const tipos = (res.tipos || []).filter((x) => x.total).sort((a, b) => b.total - a.total)
      .map((x) => ({ nome: x.nome || x.tipo, valor: x.total, titulo: num(x.concluido) + ' resolvidos, ' + num(x.erro) + ' com erro, ' + pct((x.taxaErro || 0) * 100) + ' de erro' }));
    const motivos = (res.motivosErro || []).slice().sort((a, b) => b.total - a.total).map((m) => ({ nome: m.motivo, valor: m.total }));
    const assocs = (res.associacoes || []).map((a) => ({ a: a.nome, total: a.total, ok: a.concluido, erros: a.erro, taxa: (a.taxaErro || 0) * 100 }))
      .sort((x, y) => (ordem[0] === 'a' ? String(x.a).localeCompare(String(y.a), 'pt-BR') : x[ordem[0]] - y[ordem[0]]) * ordem[1]);
    // ordenar pelo teclado: o título da coluna é um botão (Enter ou espaço); aria-sort fica no th
    const th = (k, tx, dir) => e('th', { className: dir ? 'dir' : '', 'aria-sort': ordem[0] === k ? (ordem[1] > 0 ? 'ascending' : 'descending') : 'none' },
      e('button', { type: 'button', className: 'ordenar', onClick: () => setOrdem([k, ordem[0] === k ? -ordem[1] : -1]) }, [tx, ordem[0] === k ? e('span', { key: 's', 'aria-hidden': 'true' }, ordem[1] > 0 ? ' ↑' : ' ↓') : null]));
    const mt = man && man.totais ? man.totais : null;
    const porPag = exibir === 'lista' ? 10 : 9;
    const totalPag = Math.max(1, Math.ceil(ex.length / porPag));
    const fatia = ex.slice(pagina * porPag, (pagina + 1) * porPag);
    const horasEco = ((v.tempoEconomizado && v.tempoEconomizado.atualMin) || 0) / 60;
    const horasEcoAnt = v.tempoEconomizado && v.tempoEconomizado.anteriorMin != null ? v.tempoEconomizado.anteriorMin / 60 : null;
    const abrir = (x) => setVer({ id: Number(x.glpiTicketId), titulo: x.titulo, categoria: x.categoria, tipo: x.tipo, tipoNome: x.titulo, link: 'https://suporte.mutualle.com.br/front/ticket.form.php?id=' + x.glpiTicketId });
    const teclaAbrir = (x) => (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(x); } };
    const comparar = (atual, anterior, menorMelhor, pontos) => (ant && variacao(atual, anterior, pontos) != null ? [e(Variacao, { key: 'v', atual, anterior, menorMelhor, pontos }), ' em relação ao período anterior'] : null);
    const total = t.total + (mt ? mt.execucoes : 0);

    if (!t.total && !(mt && mt.execucoes)) return e(Vazio, { texto: 'Nenhuma execução neste período com esses filtros.' });
    return e('div', { className: 'pilha' }, [
      e('div', { key: 'k', className: 'kpis' }, [
        e(Kpi, { key: 'ok', rot: 'Chamados resolvidos', valor: num(t.concluido), det: comparar(t.concluido, ant && ant.concluido) || plural(t.chamados, 'chamado atendido', 'chamados atendidos') }),
        e(Kpi, { key: 'tx', rot: 'Taxa de erro', valor: pct((t.taxaErro || 0) * 100), det: comparar(t.taxaErro, ant && ant.taxaErro, true, true) || plural(t.erro, 'com erro', 'com erro') }),
        e(Kpi, { key: 'h', rot: 'Tempo economizado', valor: comUnidades((horasEco < 10 ? horasEco.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : num(horasEco)) + ' h'), det: comparar(horasEco, horasEcoAnt) || 'itens resolvidos × minutos à mão (estimativa)' }),
        e(Kpi, { key: 's', rot: 'Tempo médio por chamado', valor: comUnidades(segundos(t.duracaoMediaSeg)), det: comparar(t.duracaoMediaSeg, ant && ant.duracaoMediaSeg, true) || 'do início ao fim da execução' }),
        e(Kpi, { key: 'm', rot: 'Execuções manuais', valor: mt ? num(mt.execucoes) : 'Sem dados', det: mt ? (mt.itens ? num(mt.concluidos) + ' de ' + num(mt.itens) + ' itens concluídos' : 'pela tela da automação') : 'não carregou' }),
        e(Kpi, { key: 'u', rot: 'Média por dia útil', valor: (t.total / uteis).toLocaleString('pt-BR', { maximumFractionDigits: 1 }), det: 'execuções pelos chamados' }),
      ]),

      e('section', { key: 'g', className: 'grafico', 'aria-labelledby': 'r-dia' }, [
        e('header', { key: 'h', className: 'chart-cab' }, [
          e('div', { key: 't' }, [
            e('h2', { key: 'h', id: 'r-dia' }, porHoraNoDia ? 'Resolvidos e com erro por hora' : semanal ? 'Resolvidos e com erro por semana' : 'Resolvidos e com erro por dia'),
            e('p', { key: 'p', className: 'faint' }, (semanal && dias.length <= 31 ? 'Por semana: o dia a dia só sai quando as 200 últimas execuções cobrem o período. ' : '') + 'Passe o mouse em uma coluna para ver os números.' + (emAndamento != null ? ' O dia de hoje ainda está em andamento.' : '')),
          ]),
          e(Seg, { key: 's', valor: modo, mudar: setModo, rotulo: 'Ver como', opcoes: [['grafico', 'Gráfico'], ['tabela', 'Tabela']] }),
        ]),
        modo === 'grafico'
          ? e(Grafico, { key: 'c', dados: cols, desenhar: (no) => { no.style.setProperty('--chart-muted', 'var(--negative)'); const leg = document.createElement('div'); leg.className = 'legenda'; no.before(leg); window.Charts.diverging(no, { labels: cols.map((c) => c.rotulo), up: cols.map((c) => c.ok), down: cols.map((c) => c.erros), above: 'Resolvidos', below: 'Com erro', height: 240, xAt: marcasX(cols.length), partial: emAndamento, legend: leg }); } })
          : e(Tabela, { key: 't', cab: [semanal ? 'Semana de' : porHoraNoDia ? 'Hora' : 'Dia', 'Resolvidos', 'Com erro', 'Taxa de erro'], linhas: cols.map((c, i) => e('tr', { key: i }, [td('p', c.rotulo), td('o', num(c.ok), 'dir num'), td('e', num(c.erros), 'dir num'), td('t', c.total ? pct((c.erros / c.total) * 100) : 'Sem dados', 'dir num')])) }),
      ]),

      e('div', { key: 'gr', className: 'grade' }, [
        e('section', { key: 'tm', className: 'cartao c12' }, e('div', { className: 'par' }, [
          e('div', { key: 't' }, [e('h2', { key: 'h' }, 'Por tipo de chamado'), e('p', { key: 'p' }, 'Do mais atendido para o menos atendido.'), tipos.length ? e(Parte, { key: 'l', linhas: tipos, total: t.total }) : e(Vazio, { key: 'v', texto: 'Sem execuções pelos chamados.' })]),
          e('div', { key: 'm' }, [e('h2', { key: 'h' }, 'Motivos de erro'), e('p', { key: 'p' }, motivos.length ? 'O que mais fez as automações pararem.' : 'Nenhum erro no período.'), motivos.length ? e(Parte, { key: 'l', linhas: motivos.slice(0, 8), total: t.erro, erro: true, texto: (l) => plural(l.valor, 'vez', 'vezes') }) : e(Vazio, { key: 'v', texto: 'Sem erros neste período.' })]),
        ])),
        e(Cartao, { key: 'h', id: 'hora', titulo: 'Por hora do dia', meta: cobre ? 'Quando os chamados mais chegam para as automações.' : 'Pelas últimas 200 execuções (o período vai além delas).' },
          ex.length ? e(Grafico, { dados: porHora, desenhar: (no) => window.Charts.bars(no, { labels: porHora.map((c) => c.rotulo), values: porHora.map((c) => c.total), height: 180, xAt: marcasX(porHora.length) }) }) : e(Vazio, { texto: 'Sem execuções no período.' })),
        e(Cartao, { key: 'o', id: 'origem', titulo: 'Pelos chamados e manuais', meta: 'Pelos chamados: aba Chamados (automático ou clique). Manuais: tela da automação aberta pelo Hub.' },
          e(Tabela, { cab: ['Origem', 'Execuções', 'Concluídos', 'Erros', 'Parte', 'Taxa de erro'], linhas: [
            ['ch', 'Pelos chamados', t.total, t.concluido, t.erro, t.total ? t.erro / t.total : null],
            ['ma', 'Manuais', mt ? mt.execucoes : 0, mt ? mt.concluidos : 0, mt ? mt.erros : 0, mt && mt.itens ? mt.erros / mt.itens : null],
          ].map(([k, tx, n, c, er, taxa]) => e('tr', { key: k }, [td('o', tx), td('n', num(n), 'dir num'), td('c', num(c), 'dir num'), td('e', num(er), 'dir num'), td('p', total ? pct((n / total) * 100) : 'Sem dados', 'dir num'), td('t', taxa == null ? 'Sem dados' : pct(taxa * 100), 'dir num')])) })),
        e('section', { key: 'ap', className: 'cartao c12' }, e('div', { className: 'par' }, [
          e('div', { key: 'a' }, [e('h2', { key: 'h' }, 'Associações'), e('p', { key: 'p' }, 'Clique no título de uma coluna para ordenar.'),
            assocs.length ? e(Tabela, { key: 't', cab: [th('a', 'Associação'), th('total', 'Chamados', true), th('ok', 'Resolvidos', true), th('erros', 'Com erro', true), th('taxa', 'Taxa', true)], linhas: assocs.map((x) => e('tr', { key: x.a }, [
              td('a', x.a), td('t', num(x.total), 'dir num'), td('o', num(x.ok), 'dir num'), td('e', num(x.erros), 'dir num'),
              td('x', e('span', { className: 'pill ' + (x.taxa >= 25 ? 'neg' : x.taxa >= 10 ? 'warn' : 'pos') }, pct(x.taxa)), 'dir'),
            ])) }) : e(Vazio, { key: 'v', texto: 'Sem associações no período.' })]),
          e('div', { key: 'q' }, [e('h2', { key: 'h' }, 'Quem aprovou'), e('p', { key: 'p' }, 'Pessoa do token do GLPI que rodou ou ligou o automático.'),
            (res.aprovadores || []).length ? e(Tabela, { key: 't', cab: ['Pessoa', 'Execuções', 'Resolvidos', 'Com erro', 'Taxa'], linhas: res.aprovadores.map((p) => e('tr', { key: p.nome }, [
              td('n', p.nome), td('t', num(p.total), 'dir num'), td('o', num(p.concluido), 'dir num'), td('e', num(p.erro), 'dir num'), td('x', p.total ? pct((p.erro / p.total) * 100) : 'Sem dados', 'dir num'),
            ])) }) : e(Vazio, { key: 'v', texto: 'Sem aprovações no período.' })]),
        ])),
        e(Cartao, {
          key: 'at', id: 'atendidos', titulo: 'Chamados atendidos',
          meta: (ex.length ? plural(ex.length, 'chamado', 'chamados') + ' no período' : 'Nenhum no período') + (cobre ? '' : ' (entre as 200 execuções mais recentes)') + '. Clique para ver o chamado e a resposta que foi ao GLPI.',
          acao: e(Seg, { valor: exibir, mudar: (x) => { setExibir(x); gravar('arxhub_v3_res_exibir', x); }, rotulo: 'Exibição', opcoes: [['lista', 'Lista'], ['cartoes', 'Cartões']] }),
        }, [
          !fatia.length ? e(Vazio, { key: 'v', texto: hist.erro ? 'Falha ao buscar as execuções: ' + hist.erro : 'Nenhuma execução pelos chamados neste período.' })
            : exibir === 'lista'
              ? e(Tabela, { key: 'l', classe: 'empilha', cab: ['Chamado', 'Quando', 'Tipo', 'Associação', 'Aprovado por', 'Duração', 'Situação'], linhas: fatia.map((x) => e('tr', { key: x.id, className: 'clicavel', tabIndex: 0, onClick: () => abrir(x), onKeyDown: teclaAbrir(x) }, [
                  td('c', '#' + x.glpiTicketId, 'mono'), td('q', quando(x), 'num col-media'),
                  td('t', x.titulo || x.tipo), td('a', nomeAssoc(x), 'col-media'), td('o', x.aprovadoPor ? x.aprovadoPor.replace(/^\(Sistemas\)\s*/, '') : 'Não informado', 'col-media'),
                  td('d', durExec(x), 'dir num col-media'), td('s', sitExec(x)),
                ])) })
              : e('div', { key: 'c', className: 'exc-cartoes' }, fatia.map((x) => e('div', { key: x.id, className: 'exc-cartao', role: 'button', tabIndex: 0, style: { height: 'auto' }, onClick: () => abrir(x), onKeyDown: teclaAbrir(x) }, [
                  e('div', { key: 't', className: 'exc-cartao-topo' }, [e('span', { key: 'n', className: 'exc-id' }, '#' + x.glpiTicketId), sitExec(x)]),
                  e('h4', { key: 'h' }, x.titulo || x.tipo),
                  e('p', { key: 'p' }, String(x.resultado || 'Sem texto').split('\n')[0]),
                  e('div', { key: 'r', className: 'exc-cartao-pe' }, [e('span', { key: 'a' }, nomeAssoc(x)), e('span', { key: 'q' }, quando(x) + ', ' + durExec(x))]),
                ]))),
          totalPag > 1 ? e('nav', { key: 'p', className: 'paginas', 'aria-label': 'Páginas' }, [
            e('span', { key: 't' }, 'Página ' + (pagina + 1) + ' de ' + totalPag),
            e('button', { key: 'a', type: 'button', className: 'btn texto', disabled: pagina === 0, onClick: () => setPagina(pagina - 1) }, 'Anterior'),
            e('button', { key: 'p', type: 'button', className: 'btn texto', disabled: pagina >= totalPag - 1, onClick: () => setPagina(pagina + 1) }, 'Próxima'),
          ]) : null,
        ]),
      ]),
      man && man.totais && man.totais.execucoes ? e(Manuais, { key: 'man', man }) : null,
      e('p', { key: 'n', className: 'nota' }, [Icon('AlertCircle', 13, 'currentColor'), 'Tempo economizado: cada chamado resolvido conta os minutos que levaria à mão naquele tipo (estimativa).']),
      ver && window.VerChamado ? e(window.VerChamado, { key: 'ver', item: ver, userToken: (window.ArxAcessosHub.ler() || {}).userToken, onFechar: () => setVer(null) }) : null,
    ]);
  }

  // Manuais: execuções feitas pela tela da automação aberta no Hub (registradas pelo proxy do Hub)
  function Manuais({ man, so }) {
    const t = man.totais;
    if (!t.execucoes) return e(Vazio, { texto: 'Nenhuma execução manual neste período.' });
    return e('section', { className: 'secao pilha', style: { gap: 'var(--gap)' }, 'aria-labelledby': 'r-man' }, [
      so ? null : e('header', { key: 'h' }, e('div', null, [e('h2', { key: 'h', id: 'r-man' }, 'Execuções manuais'), e('p', { key: 'p' }, 'Rodadas pela tela de cada automação, pela pessoa do token do GLPI.')])),
      e('div', { key: 'k', className: 'kpis' }, [
        e(Kpi, { key: 'x', rot: 'Execuções manuais', valor: num(t.execucoes), det: t.rodando ? num(t.rodando) + ' em andamento' : plural(t.itens, 'item processado', 'itens processados') }),
        e(Kpi, { key: 'c', rot: 'Itens concluídos', valor: num(t.concluidos), det: plural(t.erros, 'com erro', 'com erro') }),
        e(Kpi, { key: 't', rot: 'Tempo economizado', valor: comUnidades(duracao((man.tempoEconomizado && man.tempoEconomizado.minutos) || 0)), det: 'itens × minutos à mão (estimativa)' }),
        e(Kpi, { key: 'd', rot: 'Duração média', valor: comUnidades(segundos(t.duracaoMediaSeg)), det: 'por execução' }),
      ]),
      e('section', { key: 'p', className: 'cartao' }, e('div', { className: 'par' }, [
        e('div', { key: 'a' }, [e('h2', { key: 'h' }, 'Por automação'), e('p', { key: 'p' }, 'Execuções e itens de cada automação.'), e(Tabela, { key: 't', cab: ['Automação', 'Execuções', 'Itens', 'Concluídos', 'Erros'],
          linhas: man.porAutomacao.map((a) => e('tr', { key: a.automacaoId }, [td('n', a.nome), td('x', num(a.execucoes), 'dir num'), td('i', num(a.itens), 'dir num'), td('c', num(a.concluidos), 'dir num'), td('e', num(a.erros), 'dir num')])) })]),
        e('div', { key: 'q' }, [e('h2', { key: 'h' }, 'Quem rodou'), e('p', { key: 'p' }, 'Pessoa do token do GLPI ao abrir a automação no Hub.'), e(Tabela, { key: 't', cab: ['Pessoa', 'Execuções', 'Concluídos', 'Erros'],
          linhas: man.porPessoa.map((p) => e('tr', { key: p.nome }, [td('n', p.nome), td('x', num(p.execucoes), 'dir num'), td('c', num(p.concluidos), 'dir num'), td('e', num(p.erros), 'dir num')])) })]),
      ])),
      e(Cartao, { key: 'r', id: 'man-rec', titulo: 'Últimas execuções', meta: 'As 30 mais recentes do período.' }, e(Tabela, { cab: ['Quando', 'Automação', 'Pessoa', 'Itens'],
        linhas: man.recentes.map((r) => e('tr', { key: r.id }, [
          td('q', new Date(r.inicio).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }), 'num'), td('a', r.automacaoNome), td('p', r.quem || 'Sem identificação'),
          td('i', r.itens ? num(r.concluidos) + ' de ' + num(r.itens) : 'Não informado', 'dir num'),
        ])) })),
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
    linhas.forEach((l) => { l.fora = l.s ? l.s.tempoForaSeg : 0; l.pct = 100 - Math.min(100, (l.fora / periodoSeg) * 100); });
    linhas.sort((x, y) => x.pct - y.pct || String(x.nome).localeCompare(String(y.nome), 'pt-BR'));
    const t = alertas.totais;
    const media = linhas.length ? linhas.reduce((s, l) => s + l.pct, 0) / linhas.length : 100;
    const doDia = (chave, d) => incFaixa.filter((i) => i.chave === chave && i.dia === iso(d));
    const classeDia = (l) => { const s = l.reduce((m, i) => m + i.duracaoSeg, 0); return !l.length ? 'ok' : s < 3600 ? 'parcial' : 'fora'; };
    const fmtPct = (p) => (Math.floor(p * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    const quedas = (alertas.incidentes || []).slice().sort((x, y) => Date.parse(y.iniciadoEm) - Date.parse(x.iniciadoEm));
    const hora = (s) => new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    // horas fora do ar por dia (soma das quedas que começaram em cada dia), para o gráfico
    const foraPorDia = diasFaixa.map((d) => incFaixa.filter((i) => i.dia === iso(d)).reduce((s, i) => s + i.duracaoSeg, 0) / 3600);
    return e('div', { className: 'pilha' }, [
      e('div', { key: 'k', className: 'kpis' }, [
        e(Kpi, { key: 'm', rot: 'Disponibilidade média', valor: fmtPct(media), det: 'de ' + plural(linhas.length, 'automação ou serviço', 'automações e serviços') }),
        e(Kpi, { key: 'q', rot: 'Quedas e alertas', valor: num(t.quedas), det: t.quedas ? plural(t.erros, 'queda', 'quedas') + ' e ' + plural(t.avisos, 'aviso', 'avisos') : 'nenhum no período' }),
        e(Kpi, { key: 'f', rot: 'Tempo fora do ar', valor: comUnidades(duracao(t.tempoForaSeg / 60)), det: 'somando todos' }),
        e(Kpi, { key: 'v', rot: 'Tempo médio para voltar', valor: t.tempoMedioParaVoltarSeg ? comUnidades(duracao(t.tempoMedioParaVoltarSeg / 60)) : 'Sem dados', ruim: !!t.abertas, det: t.abertas ? plural(t.abertas, 'alerta ainda aberto', 'alertas ainda abertos') : 'nenhum aberto agora' }),
      ]),
      e('section', { key: 'g', className: 'grafico', 'aria-labelledby': 'r-fora' }, [
        e('header', { key: 'h', className: 'chart-cab' }, e('div', null, [e('h2', { key: 'h', id: 'r-fora' }, 'Tempo fora do ar por dia'), e('p', { key: 'p', className: 'faint' }, 'Soma da duração das quedas que começaram em cada dia, em horas.' + (curto ? ' Mostra os últimos 30 dias.' : ''))])),
        foraPorDia.some((h) => h > 0)
          ? e(Grafico, { key: 'c', dados: foraPorDia, desenhar: (no) => window.Charts.bars(no, { labels: diasFaixa.map(dia), values: foraPorDia.map((h) => +h.toFixed(2)), height: 180, xAt: marcasX(diasFaixa.length), format: (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' h', colour: getComputedStyle(document.documentElement).getPropertyValue('--negative').trim() }) })
          : e(Vazio, { key: 'v', texto: 'Nada ficou fora do ar no período.' }),
      ]),
      e(Cartao, { key: 'l', id: 'faixas', titulo: 'Automações e serviços', meta: (curto ? 'A faixa mostra os últimos 30 dias; a porcentagem vale para o período escolhido. ' : 'Cada bloco é um dia. ') + 'Passe o mouse para ver o tempo fora.' }, [
        e('div', { key: 'f', className: 'faixas' }, linhas.map((l, li) => e('div', { key: l.chave || l.nome, className: 'faixa-linha' }, [
          e('span', { key: 'n', className: 'faixa-nome' }, [e('span', { key: 'b', title: l.nome }, l.nome), e('span', { key: 's', className: 'pill ' + (l.agora === 'online' ? 'pos' : l.agora === 'offline' ? 'neg' : 'warn') }, l.agora === 'online' ? 'No ar' : l.agora === 'offline' ? 'Fora do ar' : 'Sem retorno')]),
          e('span', {
            key: 'd', className: 'dias', tabIndex: 0, role: 'img',
            'aria-label': (() => { const n = diasFaixa.filter((d) => l.chave && doDia(l.chave, d).length).length; return l.nome + ': ' + fmtPct(l.pct) + ' no ar, ' + (n ? plural(n, 'dia com alerta', 'dias com alerta') : 'nenhum dia com alerta') + ' de ' + diasFaixa.length; })(),
          }, diasFaixa.map((d, i) => {
            const inc = l.chave ? doDia(l.chave, d) : [];
            return e('i', { key: i, className: classeDia(inc), 'aria-hidden': 'true', onMouseEnter: () => setFoco(li + ':' + i), onMouseLeave: () => setFoco(null) },
              foco === li + ':' + i ? e('span', { className: 'dica-dia' + (i < diasFaixa.length / 4 ? ' esq' : i > (diasFaixa.length * 3) / 4 ? ' dir' : '') }, [
                e('b', { key: 'b', style: { display: 'block' } }, diaLongo(d)),
                inc.length ? inc.map((q) => e('span', { key: q.id, style: { display: 'block' } }, hora(q.iniciadoEm) + ', ' + duracao(q.duracaoSeg / 60) + ', ' + q.titulo)) : e('span', { key: 's' }, 'No ar o dia inteiro'),
              ]) : null);
          })),
          e('span', { key: 'p', className: 'num dir', style: { color: l.pct < 99.5 ? 'var(--warn)' : undefined } }, fmtPct(l.pct)),
        ]))),
        e('div', { key: 'x', className: 'eixo-faixa', 'aria-hidden': 'true' }, [e('span', { key: 'a' }, dia(iniFaixa)), e('span', { key: 'b' }, dia(ate))]),
        e('p', { key: 'lg', className: 'legenda-faixa' }, [
          e('span', { key: 'o' }, [e('i', { key: 'i', className: 'ok' }), 'No ar']), e('span', { key: 'p' }, [e('i', { key: 'i', className: 'parcial' }), 'Menos de 1 h fora']), e('span', { key: 'f' }, [e('i', { key: 'i', className: 'fora' }), '1 h ou mais fora']),
        ]),
      ]),
      e(Cartao, { key: 'q', id: 'quedas', titulo: 'Quedas e alertas', meta: quedas.length ? 'Do mais recente para o mais antigo. ' + (alertas.explicacao || '') : 'Nenhum alerta no período.' }, quedas.length ? [
        e(Tabela, { key: 't', classe: 'empilha', cab: ['Serviço', 'Problema', 'Tipo', 'Começou', 'Duração'], linhas: quedas.slice(0, todos ? quedas.length : 8).map((q) => e('tr', { key: q.id }, [
          td('s', q.titulo), td('p', q.detalhe || 'Não informado', 'faint col-media'),
          td('t', e('span', { className: 'pill ' + (q.nivel === 'aviso' ? 'warn' : 'neg') }, q.nivel === 'aviso' ? 'Aviso' : 'Queda'), 'col-media'),
          td('c', dia(new Date(q.iniciadoEm)) + ' ' + hora(q.iniciadoEm), 'num col-media'),
          td('v', q.aberto ? e('span', { className: 'pill warn' }, 'Aberto há ' + duracao(q.duracaoSeg / 60)) : duracao(q.duracaoSeg / 60), 'num'),
        ])) }),
        quedas.length > 8 ? e('div', { key: 'b', className: 'paginas' }, e('button', { type: 'button', className: 'btn texto', onClick: () => setTodos(!todos) }, todos ? 'Mostrar menos' : 'Ver todos os ' + quedas.length + ' alertas')) : null,
      ] : e(Vazio, { texto: 'Tudo no ar o período inteiro.' })),
    ]);
  }

  function ResultadosView() {
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
    }, [aba, desde, ateIso, recarga]); // eslint-disable-line

    const nomeAssoc = (x) => { const a = assocs.find((y) => String(y.id) === String(x.associacaoId)); return a ? a.nome : x.categoria || 'Não informado'; };
    const filtro = (k, rot, opcoes) => e('select', { key: k, className: 'exu-select', value: filtros[k], onChange: (ev) => setFiltros({ ...filtros, [k]: ev.target.value }), 'aria-label': rot }, opcoes.map(([v, t]) => e('option', { key: v, value: v }, t)));
    const temFiltro = filtros.assoc || filtros.tipo || filtros.origem || filtros.teste;
    const textoPeriodo = de.getTime() === ate.getTime() ? diaLongo(de) : diaLongo(de) + ' a ' + diaLongo(ate);

    let corpo;
    if (aba === 'disp') {
      corpo = disp.erro ? e(Falha, { key: 'e', texto: 'Falha ao buscar a disponibilidade: ' + disp.erro })
        : !disp.dados ? e(Carregando, { key: 'c' })
          : e(Disponibilidade, { key: 'd', alertas: disp.dados, faixa: disp.faixa, automacoes, de, ate });
    } else if (filtros.origem === 'manuais') {
      corpo = man ? e(Manuais, { key: 'm', man, so: true }) : e(Carregando, { key: 'c' });
    } else {
      corpo = res.erro ? e(Falha, { key: 'e', texto: 'Falha ao buscar os resultados: ' + res.erro })
        : !res.dados ? e(Carregando, { key: 'c' })
          : e(Tratados, { key: 't', res: res.dados, hist, man: filtros.origem === 'chamados' ? null : man, de, ate, filtros, periodo, nomeAssoc });
    }

    return e('div', { className: 'coluna' }, [
      e('div', { key: 'cab', className: 'titulo' }, e('div', null, [
        e('h1', { key: 'h' }, 'Resultados'),
        e('p', { key: 'p', className: 'sub' }, (aba === 'disp' ? 'Automações e serviços no ar, quedas e alertas de ' + textoPeriodo + '.' : 'Chamados tratados pelas automações de ' + textoPeriodo + '. O tempo economizado é uma estimativa.') + (res.carregando && res.dados ? ' Atualizando…' : '')),
      ])),
      e('div', { key: 'abas', className: 'tabs', role: 'tablist', 'aria-label': 'Resultados' }, [['tratados', 'Chamados tratados'], ['disp', 'Disponibilidade']].map(([k, t]) => e('button', {
        key: k, type: 'button', role: 'tab', 'aria-selected': aba === k ? 'true' : 'false', onClick: () => mudarAba(k),
      }, t))),
      e(Periodo, { key: 'per', periodo, mudar: mudarPeriodo }),
      e('div', { key: 'f', className: 'barra', style: { marginBottom: 18 } }, [
        aba === 'tratados' ? [
          filtro('assoc', 'Associação', [['', 'Todas as associações'], ...assocs.map((a) => [String(a.id), a.nome])]),
          filtro('tipo', 'Tipo', [['', 'Todos os tipos'], ...Object.entries(nomesTipos).map(([k, n]) => [k, n])]),
          filtro('origem', 'Origem', [['', 'Pelos chamados e manuais'], ['chamados', 'Só pelos chamados'], ['manuais', 'Só manuais']]),
          e('label', { key: 'te', className: 'troca-linha' }, [e('input', { key: 'i', type: 'checkbox', className: 'chave', checked: filtros.teste, onChange: (ev) => setFiltros({ ...filtros, teste: ev.target.checked }) }), e('b', { key: 't' }, 'Incluir modo teste')]),
          temFiltro ? e('button', { key: 'l', type: 'button', className: 'btn texto', onClick: () => setFiltros({ assoc: '', tipo: '', origem: '', teste: false }) }, 'Limpar filtros') : null,
        ] : null,
        e('span', { key: 'esp', className: 'esp' }),
        e('button', { key: 'r', type: 'button', className: 'btn', onClick: () => setRecarga((n) => n + 1) }, [Icon('RefreshCw', 14, 'currentColor'), 'Atualizar']),
      ]),
      corpo,
    ]);
  }

  window.ResultadosView = ResultadosView;
})();
