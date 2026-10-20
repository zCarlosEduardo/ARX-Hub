// Tela de Chamados do Hub de exemplo: chamados FICTÍCIOS (exemplo-dados.js), nada lê nem escreve no GLPI.
// "Rodar" e o modo automático só simulam o andamento para mostrar como a tela reage.
(function () {
  const e = React.createElement;
  const { useState, useEffect, useRef, useLayoutEffect } = React;
  const { Icon } = window.Icons;
  const D = window.ExemploDados;

  const SITUACAO = {
    pronto: 'Pronto para rodar', pendencia: 'Falta dado', manual: 'Só manual', sem_automacao: 'Sem automação',
    rodando: 'Rodando', concluido: 'Solucionado', erro: 'Erro', dispensado: 'Dispensado',
  };
  const VISOES = [
    ['todos', 'Todos', () => true],
    ['prontos', 'Prontos', (c) => c.status === 'pronto'],
    ['pendencia', 'Falta dado', (c) => c.status === 'pendencia'],
    ['manual', 'Só manual', (c) => c.status === 'manual'],
    ['erro', 'Com erro', (c) => c.status === 'erro'],
    ['sem', 'Sem automação', (c) => c.status === 'sem_automacao'],
    ['feitos', 'Solucionados', (c) => c.status === 'concluido'],
  ];
  const PODE_RODAR = ['pronto', 'manual', 'erro'];
  const LINHA = 60;

  const tempo = (min) => (min < 60 ? min + ' min' : min < 60 * 24 ? Math.floor(min / 60) + ' h' : Math.floor(min / 1440) + (min < 2880 ? ' dia' : ' dias'));
  const nomeTipo = (t) => (t ? D.TIPOS[t].nome : 'Sem automação');
  const Sit = ({ s }) => e('span', { className: 'exu-sit ' + s }, [e('i', { key: 'i' }), SITUACAO[s]]);

  function Gaveta({ c, fechar, rodar, dispensar }) {
    useEffect(() => {
      const tecla = (ev) => { if (ev.key === 'Escape') fechar(); };
      window.addEventListener('keydown', tecla);
      return () => window.removeEventListener('keydown', tecla);
    }, [fechar]);
    const dados = Object.entries(c.dados || {});
    const passos = [
      ['Aberto no GLPI', 'há ' + tempo(c.abertoHaMin) + ' por ' + c.solicitante, true],
      ['Classificado', c.tipo ? nomeTipo(c.tipo) + (c.confianca === 'media' ? ', reconhecido só pela descrição' : ', pelo título e pela descrição') : 'Nenhuma automação reconhecida', true],
      c.status === 'pendencia' ? ['Pedido o que falta', 'O chamado ficou Pendente esperando a resposta', true] : null,
      ['Execução', c.status === 'concluido' ? 'Solucionado pela automação (modo teste)' : c.status === 'erro' ? c.erro : c.status === 'rodando' ? 'Rodando agora' : 'Ainda não rodou', ['concluido', 'erro'].includes(c.status)],
    ].filter(Boolean);
    return e(React.Fragment, null, [
      e('div', { key: 'f', className: 'exu-gaveta-fundo', onClick: fechar }),
      e('aside', { key: 'g', className: 'exu-gaveta', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Chamado ' + c.id }, [
        e('div', { key: 'c', className: 'exu-gaveta-cab' }, [
          e('div', { key: 't', style: { flex: 1, minWidth: 0 } }, [
            e('div', { key: 'l', style: { display: 'flex', alignItems: 'center', gap: 8 } }, [e('span', { key: 'i', className: 'exc-id' }, '#' + c.id), e(Sit, { key: 's', s: c.status })]),
            e('h3', { key: 'h' }, c.titulo),
          ]),
          e('button', { key: 'x', type: 'button', className: 'exu-btn pequeno', onClick: fechar, 'aria-label': 'Fechar', autoFocus: true }, Icon('X', 14, 'currentColor')),
        ]),
        e('div', { key: 'b', className: 'exu-gaveta-corpo' }, [
          c.status === 'erro' ? e('div', { key: 'err', className: 'exc-aviso', style: { background: 'var(--error-tint)' } }, [Icon('AlertCircle', 16, 'var(--error)'), c.erro]) : null,
          c.pendencias.length ? e('div', { key: 'pend', className: 'exc-aviso' }, [Icon('AlertCircle', 16, 'var(--warn)'), 'Falta: ' + c.pendencias.join(', ') + '. A IA local já pediu no chamado e ele volta para a fila quando a pessoa responder.']) : null,
          e('section', { key: 'i', className: 'exu-bloco' }, [
            e('h4', { key: 'h' }, 'Informações'),
            e('dl', { key: 'd', className: 'exu-dl' }, [
              ['Tipo', e('span', { className: 'exu-tipo' + (c.tipo ? '' : ' vazio') }, nomeTipo(c.tipo))],
              ['Associação', c.associacao], ['Solicitante', c.solicitante], ['Aberto há', tempo(c.abertoHaMin)],
              ['Modo', c.confianca === 'media' ? 'Só manual (confiança média)' : c.tipo ? 'Automático ou manual' : 'Atendimento por pessoa'],
            ].map(([k, v]) => [e('dt', { key: 't' + k }, k), e('dd', { key: 'd' + k }, v)])),
          ]),
          dados.length ? e('section', { key: 'l', className: 'exu-bloco' }, [
            e('h4', { key: 'h' }, 'O que a automação leu'),
            e('dl', { key: 'd', className: 'exu-dl' }, dados.map(([k, v]) => [e('dt', { key: 't' + k }, k), e('dd', { key: 'd' + k, style: { fontFamily: 'var(--font-mono)', fontSize: 12.5 } }, v)])),
          ]) : null,
          c.ia ? e('section', { key: 'ia', className: 'exu-bloco' }, [
            e('h4', { key: 'h' }, 'Opinião da IA local'),
            e('div', { key: 't', style: { fontSize: 13 } }, c.ia.concorda ? 'Concorda com a regra.' : 'Sugere outro tipo: ' + nomeTipo(c.ia.sugestao || c.tipo) + '.'),
            e('div', { key: 'm', className: 'exu-medidor', role: 'meter', 'aria-valuenow': c.ia.confianca, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Confiança da IA' }, e('div', { style: { width: c.ia.confianca + '%' } })),
            e('div', { key: 'p', style: { fontSize: 12, color: 'var(--muted)', marginTop: 4 } }, 'Confiança de ' + c.ia.confianca + '%'),
          ]) : null,
          e('section', { key: 'ds', className: 'exu-bloco' }, [e('h4', { key: 'h' }, 'Descrição'), e('p', { key: 'p', className: 'exu-texto' }, c.descricao)]),
          e('section', { key: 'lt', className: 'exu-bloco' }, [
            e('h4', { key: 'h' }, 'Andamento'),
            e('ol', { key: 'o', className: 'exu-linha-tempo' }, passos.map(([t, d, feito]) => e('li', { key: t, className: feito ? 'feito' : '' }, [t, e('small', { key: 's' }, d)]))),
          ]),
        ]),
        e('div', { key: 'p', className: 'exu-gaveta-pe' }, [
          e('button', { key: 'r', type: 'button', className: 'exu-btn primario', disabled: !PODE_RODAR.includes(c.status), onClick: () => rodar([c.id]) }, [Icon('Activity', 14, 'currentColor'), c.status === 'erro' ? 'Rodar novamente' : 'Rodar']),
          e('button', { key: 'd', type: 'button', className: 'exu-btn', disabled: ['concluido', 'rodando', 'dispensado'].includes(c.status), onClick: () => dispensar([c.id]) }, 'Dispensar'),
          e('button', { key: 'g', type: 'button', className: 'exu-btn', disabled: true, title: 'No exemplo os chamados não existem no GLPI' }, [Icon('ExternalLink', 14, 'currentColor'), 'Abrir no GLPI']),
        ]),
      ]),
    ]);
  }

  const MOTIVOS_DISPENSA = ['Já resolvido por outra pessoa', 'Pedido duplicado', 'Departamento errado', 'Não é para automação', 'Outro motivo'];
  const ler = (k, p) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : p; } catch (err) { return p; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (err) { /* sem armazenamento: vale só nesta aba */ } };

  // Janela de configuração do modo automático: quantos por vez e quais tipos entram.
  function ConfigAuto({ config, salvar, fechar }) {
    const [porVez, setPorVez] = useState(config.porVez);
    const [tipos, setTipos] = useState(config.tipos);
    const alternarTipo = (t) => setTipos((l) => (l.includes(t) ? l.filter((x) => x !== t) : [...l, t]));
    return e(window.ExemploUI.Modal, {
      titulo: 'Modo automático', descricao: 'Os chamados prontos dos tipos marcados rodam sozinhos neste computador. Os de "Só manual" nunca entram.',
      fechar, largura: 600,
      rodape: [
        e('button', { key: 'c', type: 'button', className: 'exu-btn', onClick: fechar }, 'Cancelar'),
        e('button', { key: 's', type: 'button', className: 'exu-btn primario', disabled: !tipos.length, onClick: () => salvar({ porVez, tipos }) }, 'Salvar'),
      ],
    }, [
      e('div', { key: 'v', className: 'exu-campo' }, [
        e('label', { key: 'l' }, 'Quantos chamados rodam ao mesmo tempo'),
        e('div', { key: 's', className: 'exu-seg', role: 'group', 'aria-label': 'Por vez', style: { alignSelf: 'flex-start' } }, [1, 2, 3, 4, 5].map((n) => e('button', {
          key: n, type: 'button', 'aria-pressed': porVez === n ? 'true' : 'false', onClick: () => setPorVez(n), style: { minWidth: 40 },
        }, String(n)))),
        e('p', { key: 'a', className: 'exu-campo-ajuda' }, porVez === 1 ? 'Um por vez: mais lento, mais leve para o SGA e o CRM.' : porVez + ' ao mesmo tempo: mais rápido, cada um abre o seu navegador na automação.'),
      ]),
      e('div', { key: 't', className: 'exu-campo' }, [
        e('label', { key: 'l' }, 'Tipos que entram no automático (' + tipos.length + ' de ' + Object.keys(D.TIPOS).length + ')'),
        e('div', { key: 'm', className: 'exu-marcas' }, Object.keys(D.TIPOS).map((t) => e('label', { key: t, className: 'exu-marca' }, [
          e('input', { key: 'i', type: 'checkbox', checked: tipos.includes(t), onChange: () => alternarTipo(t) }), D.TIPOS[t].nome,
        ]))),
        !tipos.length ? e('p', { key: 'e', className: 'exu-campo-erro' }, 'Marque pelo menos um tipo.') : null,
      ]),
    ]);
  }

  // Confirmação de dispensa (ação que tira o chamado da fila): pede o motivo, como apps de atendimento fazem.
  function ConfirmarDispensa({ ids, confirmar, fechar }) {
    const [motivo, setMotivo] = useState(MOTIVOS_DISPENSA[0]);
    const [obs, setObs] = useState('');
    const um = ids.length === 1;
    return e(window.ExemploUI.Modal, {
      titulo: um ? 'Dispensar o chamado #' + ids[0] + '?' : 'Dispensar ' + ids.length + ' chamados?',
      descricao: 'Sai da fila das automações e não roda no automático. O chamado continua aberto no GLPI.',
      fechar, perigo: true,
      rodape: [
        e('button', { key: 'c', type: 'button', className: 'exu-btn', onClick: fechar }, 'Cancelar'),
        e('button', { key: 's', type: 'button', className: 'exu-btn primario', onClick: () => confirmar(motivo) }, um ? 'Dispensar' : 'Dispensar ' + ids.length),
      ],
    }, [
      e(window.ExemploUI.Campo, { key: 'm', rotulo: 'Motivo', id: 'motivoDispensa' }, e('select', { id: 'motivoDispensa', value: motivo, onChange: (ev) => setMotivo(ev.target.value) }, MOTIVOS_DISPENSA.map((m) => e('option', { key: m, value: m }, m)))),
      e(window.ExemploUI.Campo, { key: 'o', rotulo: 'Observação (opcional)', id: 'obsDispensa', ajuda: 'Fica só no Hub, não vai para o GLPI.' }, e('textarea', { id: 'obsDispensa', value: obs, onChange: (ev) => setObs(ev.target.value), maxLength: 300 })),
    ]);
  }

  function ExemploChamados() {
    const [lista, setLista] = useState(() => D.chamados.map((c) => Object.assign({}, c)));
    const [visao, setVisao] = useState('todos');
    const [busca, setBusca] = useState('');
    const [tipo, setTipo] = useState('');
    const [assoc, setAssoc] = useState('');
    const [ordem, setOrdem] = useState('recentes');
    const [exibir, setExibir] = useState(() => ler('arxhub_exemplo_chamados_exibir', 'lista'));
    const [marcados, setMarcados] = useState([]);
    const [aberto, setAberto] = useState(null);
    const [pagina, setPagina] = useState(0);
    const [cabe, setCabe] = useState({ lista: 10, cartoes: 9 });
    const [teste, setTeste] = useState(true);
    const [auto, setAuto] = useState(false);
    const [config, setConfig] = useState(() => ler('arxhub_exemplo_auto', { porVez: 2, tipos: Object.keys(D.TIPOS) }));
    const [janela, setJanela] = useState(null); // { tipo: 'auto' } ou { tipo: 'dispensa', ids }
    const [avisar, avisos] = window.ExemploUI.useAvisos();
    const corpoRef = useRef(null);
    const listaRef = useRef(lista);
    listaRef.current = lista;

    const mudar = (ids, campos) => setLista((l) => l.map((c) => (ids.includes(c.id) ? Object.assign({}, c, campos) : c)));
    // simulação: cada chamado leva de 1,5 a 4 s e um em dez dá erro momentâneo
    const rodar = (ids, emSequencia) => {
      const validos = ids.filter((id) => PODE_RODAR.includes((listaRef.current.find((c) => c.id === id) || {}).status));
      if (!validos.length) return;
      mudar(validos, { status: 'rodando' });
      setMarcados([]);
      validos.forEach((id, i) => setTimeout(() => {
        const deuErro = Math.random() < 0.1;
        mudar([id], deuErro ? { status: 'erro', erro: 'O SGA não respondeu no tempo esperado. Pode ser momentâneo.' } : { status: 'concluido', erro: null });
        avisar(deuErro ? 'Chamado #' + id + ' deu erro e pode rodar de novo.' : 'Chamado #' + id + ' solucionado' + (teste ? ' (modo teste, nada foi escrito no GLPI).' : '.'), deuErro ? 'erro' : 'ok');
      }, 1500 + (emSequencia ? 0 : i * 700) + Math.random() * 2500));
    };
    const pedirDispensa = (ids) => setJanela({ tipo: 'dispensa', ids });
    const dispensar = (ids, motivo) => {
      mudar(ids, { status: 'dispensado', motivoDispensa: motivo });
      setMarcados([]);
      setJanela(null);
      if (ids.includes(aberto)) setAberto(null);
      avisar((ids.length === 1 ? 'Chamado dispensado' : ids.length + ' chamados dispensados') + ': ' + motivo.toLowerCase() + '.', 'ok');
    };

    // modo automático: a cada 2 s completa as vagas (config.porVez) com os prontos dos tipos marcados
    useEffect(() => {
      if (!auto) return undefined;
      const t = setInterval(() => {
        const l = listaRef.current;
        const vagas = config.porVez - l.filter((c) => c.status === 'rodando').length;
        if (vagas <= 0) return;
        const prox = l.filter((c) => c.status === 'pronto' && config.tipos.includes(c.tipo)).slice(0, vagas).map((c) => c.id);
        if (prox.length) rodar(prox, true);
      }, 2000);
      return () => clearInterval(t);
    }, [auto, teste, config]);

    const conta = (fn) => lista.filter(fn).length;
    const filtroVisao = (VISOES.find((v) => v[0] === visao) || VISOES[0])[2];
    const q = busca.trim().toLowerCase();
    const filtrados = lista
      .filter((c) => c.status !== 'dispensado' || visao === 'todos')
      .filter(filtroVisao)
      .filter((c) => !q || (c.id + ' ' + c.titulo + ' ' + c.descricao + ' ' + c.solicitante).toLowerCase().includes(q))
      .filter((c) => !tipo || (tipo === '-' ? !c.tipo : c.tipo === tipo))
      .filter((c) => !assoc || c.associacao === assoc)
      .sort((a, b) => (ordem === 'recentes' ? a.abertoHaMin - b.abertoHaMin : b.abertoHaMin - a.abertoHaMin));

    // quantas linhas (lista) ou cartões cabem na área visível, como no Painel
    useLayoutEffect(() => {
      const medir = () => {
        const corpo = corpoRef.current;
        const area = corpo && corpo.closest('.ex-pagina');
        if (!area || !area.clientHeight) return;
        const sobra = area.clientHeight - (corpo.getBoundingClientRect().top - area.getBoundingClientRect().top + area.scrollTop) - 70;
        const colunas = Math.max(1, Math.floor((corpo.clientWidth + 12) / (300 + 12)));
        setCabe({ lista: Math.max(5, Math.floor((sobra - 38) / LINHA)), cartoes: colunas * Math.max(1, Math.floor((sobra + 12) / (188 + 12))) });
      };
      medir();
      const area = corpoRef.current && corpoRef.current.closest('.ex-pagina');
      const ro = new ResizeObserver(medir);
      if (area) ro.observe(area);
      return () => ro.disconnect();
    }, [exibir, teste, auto]);
    useEffect(() => setPagina(0), [visao, q, tipo, assoc, ordem, exibir]);

    const porPagina = exibir === 'lista' ? cabe.lista : cabe.cartoes;
    const total = Math.max(1, Math.ceil(filtrados.length / porPagina));
    const atual = Math.min(pagina, total - 1);
    const fatia = filtrados.slice(atual * porPagina, (atual + 1) * porPagina);
    const todosMarcados = fatia.length > 0 && fatia.every((c) => marcados.includes(c.id));
    const alternar = (id) => setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
    const marcarPagina = () => setMarcados((m) => (todosMarcados ? m.filter((id) => !fatia.some((c) => c.id === id)) : [...new Set([...m, ...fatia.map((c) => c.id)])]));
    const cAberto = aberto ? lista.find((c) => c.id === aberto) : null;
    const prontos = conta((c) => c.status === 'pronto');
    const rodando = conta((c) => c.status === 'rodando');
    const trocarExibir = (v) => { setExibir(v); gravar('arxhub_exemplo_chamados_exibir', v); };

    const kpi = (v, rot, n, det) => e('button', {
      key: v, type: 'button', className: 'exu-kpi' + (visao === v ? ' marcado' : ''), onClick: () => setVisao(visao === v ? 'todos' : v), 'aria-pressed': visao === v ? 'true' : 'false',
    }, [e('div', { key: 'r', className: 'exu-kpi-rot' }, rot), e('div', { key: 'v', className: 'exu-kpi-val' }, String(n)), e('div', { key: 'd', className: 'exu-kpi-det' }, det)]);
    const marcar = (c) => e('input', { type: 'checkbox', checked: marcados.includes(c.id), onChange: () => alternar(c.id), 'aria-label': 'Marcar chamado ' + c.id });
    const tipoCel = (c) => [
      e('span', { key: 't', className: 'exu-tipo' + (c.tipo ? '' : ' vazio') }, nomeTipo(c.tipo)),
      c.ia && !c.ia.concorda ? e('span', { key: 'ia', className: 'exc-ia', title: 'A IA local sugere outro tipo' }, [Icon('Bot', 12, 'currentColor'), 'IA']) : null,
    ];
    const abrirCom = (c) => ({ onClick: () => setAberto(c.id), onKeyDown: (ev) => { if (ev.key === 'Enter') setAberto(c.id); }, tabIndex: 0 });

    const vazio = e('div', { key: 'v', className: 'exc-vazio' }, [
      Icon('Inbox', 30, 'var(--muted-soft)', 1.3),
      visao === 'todos' && !q && !tipo && !assoc ? 'Nenhum chamado aberto.' : 'Nenhum chamado com esses filtros.',
      e('button', { key: 'l', type: 'button', className: 'exu-btn pequeno', onClick: () => { setVisao('todos'); setBusca(''); setTipo(''); setAssoc(''); } }, 'Limpar filtros'),
    ]);
    const emLista = e('div', { key: 'tab', ref: corpoRef, className: 'exc-tabela', role: 'table', 'aria-label': 'Chamados' }, [
      e('div', { key: 'h', className: 'exc-cab', role: 'row' }, [
        e('span', { key: 'm', className: 'exc-marcar' }, e('input', { type: 'checkbox', checked: todosMarcados, onChange: marcarPagina, 'aria-label': 'Marcar a página' })),
        e('span', { key: 'c' }, 'Chamado'), e('span', { key: 't' }, 'Tipo'), e('span', { key: 'a' }, 'Associação'), e('span', { key: 'h' }, 'Aberto há'), e('span', { key: 's' }, 'Situação'),
      ]),
      fatia.length ? fatia.map((c) => e('div', Object.assign({
        key: c.id, role: 'row', className: 'exc-linha' + (marcados.includes(c.id) ? ' selecionada' : '') + (aberto === c.id ? ' aberta' : ''),
      }, abrirCom(c)), [
        e('span', { key: 'm', className: 'exc-marcar', onClick: (ev) => ev.stopPropagation() }, marcar(c)),
        e('div', { key: 't', className: 'exc-titulo' }, [
          e('b', { key: 'b' }, [e('span', { key: 'i', className: 'exc-id' }, '#' + c.id), e('span', { key: 't' }, c.titulo)]),
          e('small', { key: 's' }, c.solicitante + ' · ' + c.descricao.replace(/\n/g, ' ')),
        ]),
        e('div', { key: 'tp', className: 'exc-celula' }, tipoCel(c)),
        e('div', { key: 'a', className: 'exc-celula' }, c.associacao),
        e('div', { key: 'h', className: 'exc-celula' }, tempo(c.abertoHaMin)),
        e('div', { key: 's' }, e(Sit, { s: c.status })),
      ])) : vazio,
    ]);
    const emCartoes = fatia.length ? e('div', { key: 'cart', ref: corpoRef, className: 'exc-cartoes' }, fatia.map((c) => e('div', Object.assign({
      key: c.id, role: 'button', className: 'exc-cartao' + (marcados.includes(c.id) ? ' selecionada' : ''), 'aria-label': 'Chamado ' + c.id + ': ' + c.titulo,
    }, abrirCom(c)), [
      e('div', { key: 't', className: 'exc-cartao-topo' }, [
        e('span', { key: 'i', style: { display: 'flex', alignItems: 'center', gap: 8 } }, [e('span', { key: 'm', onClick: (ev) => ev.stopPropagation(), style: { display: 'flex' } }, marcar(c)), e('span', { key: 'n', className: 'exc-id' }, '#' + c.id)]),
        e(Sit, { key: 's', s: c.status }),
      ]),
      e('h4', { key: 'h', title: c.titulo }, c.titulo),
      e('p', { key: 'p' }, c.descricao.replace(/\n/g, ' ')),
      e('div', { key: 'tp', style: { display: 'flex', alignItems: 'center', minWidth: 0 } }, tipoCel(c)),
      e('div', { key: 'r', className: 'exc-cartao-pe' }, [e('span', { key: 'a' }, c.solicitante + ' · ' + c.associacao), e('span', { key: 'h' }, tempo(c.abertoHaMin))]),
    ]))) : e('div', { key: 'cart', ref: corpoRef, className: 'exc-tabela' }, vazio);

    return e('div', { className: 'exu-tela' }, [
      e('header', { key: 'cab', className: 'exu-cab' }, [
        e('div', { key: 't' }, [
          e('h2', { key: 'h' }, 'Chamados'),
          e('p', { key: 'p' }, 'Entidade Sistemas · ' + lista.filter((c) => !['concluido', 'dispensado'].includes(c.status)).length + ' abertos · dados fictícios'),
        ]),
        e('div', { key: 'a', className: 'exu-acoes' }, [
          e('label', { key: 't', className: 'exu-chave', title: 'Em teste a automação preenche mas não escreve no GLPI' }, [
            e('input', { key: 'i', type: 'checkbox', className: 'admin-chave', role: 'switch', checked: teste, onChange: (ev) => setTeste(ev.target.checked) }), 'Modo teste',
          ]),
          e('label', { key: 'u', className: 'exu-chave', title: 'Roda sozinho os prontos dos tipos escolhidos' }, [
            e('input', { key: 'i', type: 'checkbox', className: 'admin-chave', role: 'switch', checked: auto, onChange: (ev) => setAuto(ev.target.checked) }), 'Automático',
          ]),
          e('button', { key: 'cfg', type: 'button', className: 'exu-btn', onClick: () => setJanela({ tipo: 'auto' }), title: 'Configurar o modo automático' }, [Icon('Settings', 14, 'currentColor'), config.porVez + ' por vez']),
          e('button', { key: 'r', type: 'button', className: 'exu-btn primario', disabled: !prontos, onClick: () => rodar(lista.filter((c) => c.status === 'pronto').map((c) => c.id)) }, [Icon('Activity', 14, 'currentColor'), 'Rodar prontos (' + prontos + ')']),
        ]),
      ]),

      !teste ? e('div', { key: 'av', className: 'exc-aviso', style: { background: 'var(--error-tint)' } }, [Icon('AlertCircle', 16, 'var(--error)'), 'Modo teste desligado: no Hub de verdade as soluções seriam escritas no GLPI.']) : null,
      auto ? e('div', { key: 'au', className: 'exc-aviso', style: { background: 'var(--accent-soft)', color: 'var(--accent-fg)' } }, [
        Icon('Activity', 16, 'currentColor'),
        e('span', { key: 't', style: { flex: 1 } }, 'Modo automático ligado: até ' + (config.porVez === 1 ? '1 chamado por vez' : config.porVez + ' chamados ao mesmo tempo') + ', de ' + (config.tipos.length === Object.keys(D.TIPOS).length ? 'todos os tipos' : config.tipos.length === 1 ? '1 tipo' : config.tipos.length + ' tipos') + '. Rodando agora: ' + rodando + '.'),
        e('button', { key: 'b', type: 'button', className: 'exu-btn pequeno', onClick: () => setJanela({ tipo: 'auto' }) }, 'Configurar'),
      ]) : null,

      e('div', { key: 'k', className: 'exu-kpis' }, [
        kpi('prontos', 'Prontos para rodar', prontos, 'reconhecidos e completos'),
        kpi('pendencia', 'Falta dado', conta((c) => c.status === 'pendencia'), 'esperando a pessoa responder'),
        kpi('manual', 'Só manual', conta((c) => c.status === 'manual'), 'precisam de confirmação'),
        kpi('erro', 'Com erro', conta((c) => c.status === 'erro'), 'podem rodar de novo'),
        kpi('feitos', 'Solucionados', conta((c) => c.status === 'concluido'), 'nesta sessão do exemplo'),
      ]),

      e('div', { key: 'abas', className: 'exu-abas', role: 'tablist' }, VISOES.map(([v, rot, fn]) => e('button', {
        key: v, type: 'button', role: 'tab', className: 'exu-aba', 'aria-selected': visao === v ? 'true' : 'false', onClick: () => setVisao(v),
      }, [rot, e('span', { key: 'n', className: 'n' }, String(lista.filter((c) => c.status !== 'dispensado' || v === 'todos').filter(fn).length))]))),

      e('div', { key: 'barra', className: 'exu-barra' }, [
        e('label', { key: 'b', className: 'exu-busca' }, [Icon('Search', 15, 'var(--muted-soft)'), e('input', { key: 'i', value: busca, onChange: (ev) => setBusca(ev.target.value), placeholder: 'Buscar por número, título ou solicitante', 'aria-label': 'Buscar chamados' })]),
        e('select', { key: 't', className: 'exu-select', value: tipo, onChange: (ev) => setTipo(ev.target.value), 'aria-label': 'Tipo' }, [
          e('option', { key: '', value: '' }, 'Todos os tipos'),
          ...Object.keys(D.TIPOS).map((k) => e('option', { key: k, value: k }, D.TIPOS[k].nome)),
          e('option', { key: '-', value: '-' }, 'Sem automação'),
        ]),
        e('select', { key: 'a', className: 'exu-select', value: assoc, onChange: (ev) => setAssoc(ev.target.value), 'aria-label': 'Associação' }, [
          e('option', { key: '', value: '' }, 'Todas as associações'), ...D.ASSOCIACOES.map((a) => e('option', { key: a, value: a }, a)),
        ]),
        e('select', { key: 'o', className: 'exu-select', value: ordem, onChange: (ev) => setOrdem(ev.target.value), 'aria-label': 'Ordem' }, [
          e('option', { key: 'r', value: 'recentes' }, 'Mais recentes'), e('option', { key: 'a', value: 'antigos' }, 'Mais antigos'),
        ]),
        e('div', { key: 'v', className: 'exu-seg', role: 'group', 'aria-label': 'Exibição' }, [
          e('button', { key: 'l', type: 'button', 'aria-pressed': exibir === 'lista' ? 'true' : 'false', onClick: () => trocarExibir('lista'), title: 'Lista' }, [Icon('FileText', 13, 'currentColor'), ' Lista']),
          e('button', { key: 'c', type: 'button', 'aria-pressed': exibir === 'cartoes' ? 'true' : 'false', onClick: () => trocarExibir('cartoes'), title: 'Cartões' }, [Icon('LayoutDashboard', 13, 'currentColor'), ' Cartões']),
        ]),
      ]),

      exibir === 'lista' ? emLista : emCartoes,

      filtrados.length ? e('nav', { key: 'pag', className: 'exc-paginacao', 'aria-label': 'Páginas' }, [
        e('span', { key: 't' }, (atual * porPagina + 1) + ' a ' + (atual * porPagina + fatia.length) + ' de ' + filtrados.length + ' chamados'),
        e('div', { key: 'b', style: { display: 'flex', gap: 6, alignItems: 'center' } }, [
          e('button', { key: 'a', type: 'button', className: 'exu-btn pequeno', disabled: atual === 0, onClick: () => setPagina(atual - 1) }, 'Anterior'),
          e('span', { key: 'p' }, 'Página ' + (atual + 1) + ' de ' + total),
          e('button', { key: 'p2', type: 'button', className: 'exu-btn pequeno', disabled: atual >= total - 1, onClick: () => setPagina(atual + 1) }, 'Próxima'),
        ]),
      ]) : null,

      marcados.length ? e('div', { key: 'lote', className: 'exc-lote', role: 'toolbar', 'aria-label': 'Ações nos selecionados' }, [
        e('b', { key: 'n' }, marcados.length === 1 ? '1 selecionado' : marcados.length + ' selecionados'),
        e('button', { key: 'r', type: 'button', className: 'exu-btn pequeno', onClick: () => rodar(marcados) }, 'Rodar'),
        e('button', { key: 'd', type: 'button', className: 'exu-btn pequeno', onClick: () => pedirDispensa(marcados) }, 'Dispensar'),
        e('button', { key: 'l', type: 'button', className: 'exu-btn pequeno', onClick: () => setMarcados([]), 'aria-label': 'Limpar seleção' }, Icon('X', 13, 'currentColor')),
      ]) : null,

      cAberto ? e(Gaveta, { key: 'g', c: cAberto, fechar: () => setAberto(null), rodar, dispensar: pedirDispensa }) : null,
      janela && janela.tipo === 'auto' ? e(ConfigAuto, { key: 'ja', config, fechar: () => setJanela(null), salvar: (c) => { setConfig(c); gravar('arxhub_exemplo_auto', c); setJanela(null); avisar('Automático: até ' + c.porVez + ' por vez, ' + c.tipos.length + ' tipos.', 'ok'); } }) : null,
      janela && janela.tipo === 'dispensa' ? e(ConfirmarDispensa, { key: 'jd', ids: janela.ids, fechar: () => setJanela(null), confirmar: (m) => dispensar(janela.ids, m) }) : null,
      avisos,
    ]);
  }

  window.ExemploChamados = ExemploChamados;
})();
