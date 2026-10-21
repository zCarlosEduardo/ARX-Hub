// Barra do topo do Hub de exemplo: abrir chamado no GLPI, alertas, Meus acessos (cofre), ajuda e aviso de nova versão.
// Tudo FICTÍCIO: nada sai do navegador e nenhum segredo de verdade é pedido ou guardado.
(function () {
  const e = React.createElement;
  const { useState, useEffect, useRef } = React;
  const { Modal, Campo, Ico } = window.ExemploUI;
  const D = window.ExemploDados;

  // Cofre de exemplo: começa travado; abrir e travar avisam quem depende dele (Abrir chamado).
  const ouvintes = new Set();
  const cofre = {
    aberto: true, pedirAbrir: null,
    mudar(v) { cofre.aberto = v; ouvintes.forEach((f) => f(v)); },
    assinar(f) { ouvintes.add(f); return () => ouvintes.delete(f); },
  };
  function useCofre() {
    const [aberto, setAberto] = useState(cofre.aberto);
    useEffect(() => cofre.assinar(setAberto), []);
    return aberto;
  }

  const USUARIOS = Array.from({ length: 14 }, () => D.pessoa()).filter((v, i, l) => l.indexOf(v) === i);
  const CATEGORIAS = D.ASSOCIACOES.flatMap((a) => [a + ' > Sistemas > Acesso', a + ' > Sistemas > Erro ou instabilidade', a + ' > Sistemas > Cadastro']);

  // Caixa de escolha com busca (requerente e atribuído): digita, filtra e escolhe com o teclado.
  function Escolha({ id, valor, mudar, opcoes, placeholder }) {
    const [texto, setTexto] = useState('');
    const [aberta, setAberta] = useState(false);
    const [sel, setSel] = useState(0);
    const lista = opcoes.filter((o) => o.toLowerCase().includes(texto.toLowerCase())).slice(0, 8);
    const escolher = (o) => { mudar(o); setTexto(''); setAberta(false); };
    return e('div', { className: 'ext-escolha' }, [
      e('input', {
        key: 'i', id, role: 'combobox', 'aria-expanded': aberta ? 'true' : 'false', autoComplete: 'off',
        value: aberta ? texto : valor, placeholder: valor || placeholder,
        onFocus: () => { setAberta(true); setSel(0); }, onBlur: () => setTimeout(() => setAberta(false), 120),
        onChange: (ev) => { setTexto(ev.target.value); setAberta(true); setSel(0); },
        onKeyDown: (ev) => {
          if (ev.key === 'ArrowDown') { ev.preventDefault(); setSel((s) => Math.min(s + 1, lista.length - 1)); }
          if (ev.key === 'ArrowUp') { ev.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          if (ev.key === 'Enter' && lista[sel]) { ev.preventDefault(); escolher(lista[sel]); }
        },
      }),
      aberta ? e('ul', { key: 'l', className: 'ext-escolha-lista', role: 'listbox' }, lista.length ? lista.map((o, i) => e('li', {
        key: o, role: 'option', 'aria-selected': i === sel ? 'true' : 'false', onMouseDown: (ev) => { ev.preventDefault(); escolher(o); }, onMouseEnter: () => setSel(i),
      }, [e('span', { key: 'a', className: 'ext-avatar' }, o.split(' ').map((p) => p[0]).join('').slice(0, 2)), o, o === valor ? e('span', { key: 'c', style: { marginLeft: 'auto' } }, Ico('Check', 14, 'var(--accent)')) : null]))
        : [e('li', { key: 'v', className: 'ext-escolha-vazio' }, 'Ninguém com esse nome')]) : null,
    ]);
  }

  // Painel que sai do botão flutuante (não cobre a tela: dá para consultar o Hub enquanto escreve o chamado).
  function PainelFlutuante({ titulo, descricao, fechar, rodape, children }) {
    return ReactDOM.createPortal(e('div', { className: 'ext-fab-painel', role: 'dialog', 'aria-label': titulo }, [
      e('div', { key: 'c', className: 'exu-modal-cab' }, [
        e('div', { key: 't', style: { flex: 1, minWidth: 0 } }, [e('h3', { key: 'h' }, titulo), e('p', { key: 'p' }, descricao)]),
        e('button', { key: 'x', type: 'button', className: 'exu-btn pequeno exu-modal-x', onClick: fechar, 'aria-label': 'Fechar' }, Ico('X', 14, 'currentColor')),
      ]),
      e('div', { key: 'b', className: 'exu-modal-corpo' }, children),
      rodape ? e('div', { key: 'r', className: 'exu-modal-pe' }, rodape) : null,
    ]), document.body);
  }

  const SIT_CHAMADO = { 1: ['Novo', 'pronto'], 2: ['Em atendimento', 'rodando'], 4: ['Pendente', 'pendencia'], 5: ['Solucionado', 'concluido'] };
  function AbrirChamado({ avisar }) {
    const [aberto, setAberto] = useState(false);
    const [aba, setAba] = useState('novo');
    const vazio = { categoria: '', requerente: '', atribuido: '', titulo: '', descricao: '', anexo: '' };
    const [f, setF] = useState(vazio);
    const [tocado, setTocado] = useState(false);
    const [estado, setEstado] = useState('form'); // form, enviando, ok
    const [meus, setMeus] = useState(() => [
      { id: 48690, titulo: 'Liberar acesso ao relatório de boletos', categoria: CATEGORIAS[0], status: 2, quando: 'Ontem, 16:40' },
      { id: 48655, titulo: 'Usuário do SGA bloqueado', categoria: CATEGORIAS[4], status: 5, quando: '18/10, 09:12' },
      { id: 48601, titulo: 'Erro ao exportar card', categoria: CATEGORIAS[7], status: 4, quando: '16/10, 14:05' },
    ]);
    const [ultimo, setUltimo] = useState(null);
    const cofreAberto = useCofre();
    const erros = { categoria: !f.categoria && 'Escolha a categoria.', titulo: !f.titulo.trim() && 'Escreva um título curto.' };
    const mudar = (k) => (ev) => setF(Object.assign({}, f, { [k]: ev.target ? ev.target.value : ev }));
    const enviar = () => {
      setTocado(true);
      if (erros.categoria || erros.titulo) return;
      setEstado('enviando');
      setTimeout(() => {
        const novo = { id: 48700 + Math.floor(Math.random() * 90), titulo: f.titulo.trim(), categoria: f.categoria, status: 1, quando: 'Agora' };
        setMeus((m) => [novo, ...m]);
        setUltimo(novo);
        setEstado('ok');
        avisar('Chamado #' + novo.id + ' aberto no GLPI (exemplo).', 'ok');
      }, 900);
    };
    const fechar = () => { setAberto(false); setEstado('form'); setF(vazio); setTocado(false); setAba('novo'); };
    const rodape = aba === 'novo' && estado !== 'ok' && cofreAberto ? [
      e('button', { key: 'c', type: 'button', className: 'exu-btn', onClick: fechar }, 'Cancelar'),
      e('button', { key: 'e', type: 'button', className: 'exu-btn primario', disabled: estado === 'enviando', onClick: enviar }, estado === 'enviando' ? 'Abrindo…' : 'Abrir chamado'),
    ] : null;

    useEffect(() => {
      if (!aberto) return undefined;
      const esc = (ev) => { if (ev.key === 'Escape') fechar(); };
      document.addEventListener('keydown', esc);
      return () => document.removeEventListener('keydown', esc);
    }, [aberto]);
    return e(React.Fragment, null, [
      e('button', { key: 'b', type: 'button', className: 'ext-fab' + (aberto ? ' aberto' : ''), onClick: () => (aberto ? fechar() : setAberto(true)), title: 'Abrir chamado no GLPI', 'aria-label': 'Abrir chamado no GLPI', 'aria-expanded': aberto ? 'true' : 'false' },
        aberto ? Ico('X', 22, 'currentColor', 2.25) : Ico('Headset', 22, 'currentColor', 2)),
      aberto ? e(PainelFlutuante, { key: 'm', titulo: 'Chamado no GLPI', descricao: 'Abre na entidade Sistemas com o seu usuário do GLPI.', fechar, rodape }, [
        e('div', { key: 'a', className: 'exu-abas', role: 'tablist' }, [['novo', 'Novo chamado'], ['meus', 'Meus chamados']].map(([k, t]) => e('button', {
          key: k, type: 'button', role: 'tab', className: 'exu-aba', 'aria-selected': aba === k ? 'true' : 'false', onClick: () => setAba(k),
        }, [t, k === 'meus' ? e('span', { key: 'n', className: 'n' }, String(meus.length)) : null]))),
        aba === 'meus' ? e('ul', { key: 'l', className: 'ext-meus' }, meus.map((c) => e('li', { key: c.id }, [
          e('div', { key: 't' }, [e('b', { key: 'b' }, [e('span', { key: 'i', className: 'exc-id' }, '#' + c.id + ' '), c.titulo]), e('small', { key: 's' }, c.categoria + ' · ' + c.quando)]),
          e('span', { key: 's', className: 'exu-sit ' + SIT_CHAMADO[c.status][1] }, [e('i', { key: 'i' }), SIT_CHAMADO[c.status][0]]),
        ])))
          : !cofreAberto ? e('div', { key: 't', className: 'ext-travado' }, [
            Ico('Lock', 28, 'var(--muted)'),
            e('b', { key: 'b' }, 'Destrave Meus acessos para abrir chamados'),
            e('p', { key: 'p' }, 'O chamado sai com o seu token do GLPI, que fica no cofre deste navegador.'),
            e('button', { key: 'd', type: 'button', className: 'exu-btn primario', onClick: () => cofre.pedirAbrir && cofre.pedirAbrir() }, 'Destravar Meus acessos'),
          ])
            : estado === 'ok' ? e('div', { key: 'ok', className: 'ext-sucesso' }, [
              e('span', { key: 'i', className: 'ext-sucesso-icone' }, Ico('Check', 26, 'var(--accent)', 2.5)),
              e('b', { key: 'b' }, 'Chamado #' + ultimo.id + ' aberto'),
              e('p', { key: 'p' }, ultimo.titulo + ' · ' + ultimo.categoria),
              e('div', { key: 'a', style: { display: 'flex', gap: 8 } }, [
                e('button', { key: 'o', type: 'button', className: 'exu-btn', onClick: () => { setEstado('form'); setF(vazio); setTocado(false); } }, 'Abrir outro'),
                e('button', { key: 'm', type: 'button', className: 'exu-btn primario', onClick: () => setAba('meus') }, 'Ver meus chamados'),
              ]),
            ])
              : e('div', { key: 'f', style: { display: 'flex', flexDirection: 'column', gap: 14 } }, [
                e(Campo, { key: 'c', rotulo: 'Categoria', id: 'gcCat', erro: tocado && erros.categoria }, e('select', { id: 'gcCat', value: f.categoria, onChange: mudar('categoria'), 'aria-invalid': !!(tocado && erros.categoria) }, [e('option', { key: '', value: '' }, 'Escolha a categoria'), ...CATEGORIAS.map((c) => e('option', { key: c, value: c }, c))])),
                e('div', { key: 'p', className: 'exu-duas-col' }, [
                  e(Campo, { key: 'r', rotulo: 'Requerente', id: 'gcReq', ajuda: 'Vazio: você mesmo.' }, e(Escolha, { id: 'gcReq', valor: f.requerente, mudar: mudar('requerente'), opcoes: USUARIOS, placeholder: 'Buscar pessoa' })),
                  e(Campo, { key: 'a', rotulo: 'Atribuído a', id: 'gcAtr', ajuda: 'Vazio: fila da equipe.' }, e(Escolha, { id: 'gcAtr', valor: f.atribuido, mudar: mudar('atribuido'), opcoes: USUARIOS, placeholder: 'Buscar pessoa' })),
                ]),
                e(Campo, { key: 't', rotulo: 'Título', id: 'gcTit', erro: tocado && erros.titulo }, e('input', { id: 'gcTit', value: f.titulo, onChange: mudar('titulo'), maxLength: 120, placeholder: 'Ex.: Erro ao bloquear usuário', 'aria-invalid': !!(tocado && erros.titulo) })),
                e(Campo, { key: 'd', rotulo: 'Descrição', id: 'gcDesc', ajuda: 'Conte o que aconteceu e o que já tentou.' }, e('textarea', { id: 'gcDesc', value: f.descricao, onChange: mudar('descricao'), maxLength: 2000, style: { height: 110 } })),
                e('div', { key: 'x', className: 'ext-anexo' }, f.anexo
                  ? [Ico('Image', 16, 'var(--muted)'), e('span', { key: 'n' }, f.anexo), e('button', { key: 'r', type: 'button', className: 'exu-btn pequeno', onClick: () => setF(Object.assign({}, f, { anexo: '' })) }, 'Remover')]
                  : [Ico('Upload', 16, 'var(--muted)'), e('span', { key: 't' }, 'Arraste um print aqui ou'), e('button', { key: 'b', type: 'button', className: 'exu-btn pequeno', onClick: () => setF(Object.assign({}, f, { anexo: 'print-da-tela.png · 184 KB' })) }, 'escolha um arquivo')]),
              ]),
      ]) : null,
    ]);
  }

  const ALERTAS = [
    { id: 1, tipo: 'erro', titulo: 'GLPI fora do ar', texto: 'Não respondeu às últimas 3 checagens.', quando: 'há 12 min', ativo: true },
    { id: 2, tipo: 'alerta', titulo: 'Token do SGA perto de vencer', texto: 'Associação Boreal: vence em 3 dias.', quando: 'há 2 h', ativo: true },
    { id: 3, tipo: 'ok', titulo: 'Relatórios SGA voltou', texto: 'Ficou fora por 6 min.', quando: 'hoje, 09:14', ativo: false },
    { id: 4, tipo: 'ok', titulo: 'Redis voltou', texto: 'O automático voltou a reservar chamados.', quando: 'ontem, 17:02', ativo: false },
    { id: 5, tipo: 'erro', titulo: 'Converter planilha caiu', texto: 'Reiniciado na atualização.', quando: 'ontem, 11:40', ativo: false },
  ];
  function Alertas({ avisar }) {
    const [aberto, setAberto] = useState(false);
    const [aba, setAba] = useState('ativos');
    const [lidos, setLidos] = useState([]);
    const [checando, setChecando] = useState(false);
    const caixa = useRef(null);
    useEffect(() => {
      if (!aberto) return undefined;
      const fora = (ev) => { if (!caixa.current.contains(ev.target)) setAberto(false); };
      const esc = (ev) => { if (ev.key === 'Escape') setAberto(false); };
      document.addEventListener('mousedown', fora);
      document.addEventListener('keydown', esc);
      return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
    }, [aberto]);
    const naoLidos = ALERTAS.filter((a) => a.ativo && !lidos.includes(a.id)).length;
    const lista = ALERTAS.filter((a) => (aba === 'ativos' ? a.ativo : !a.ativo));
    const checar = () => { setChecando(true); setTimeout(() => { setChecando(false); avisar('Checagem feita: 1 serviço fora do ar.', 'erro'); }, 1200); };
    return e('div', { ref: caixa, className: 'ext-alertas' }, [
      e('button', { key: 'b', type: 'button', className: 'ex-icone-btn', onClick: () => setAberto(!aberto), 'aria-expanded': aberto ? 'true' : 'false', 'aria-label': 'Alertas' + (naoLidos ? ': ' + naoLidos + ' novos' : '') }, [
        Ico('Bell', 16, 'currentColor'), naoLidos ? e('span', { key: 'n', className: 'ext-contagem' }, String(naoLidos)) : null,
      ]),
      aberto ? e('div', { key: 'p', className: 'ext-pop', role: 'dialog', 'aria-label': 'Alertas' }, [
        e('div', { key: 'c', className: 'ext-pop-cab' }, [
          e('b', { key: 't' }, 'Alertas'),
          e('button', { key: 'l', type: 'button', className: 'exu-btn pequeno', disabled: !naoLidos, onClick: () => setLidos(ALERTAS.map((a) => a.id)) }, 'Marcar como lidos'),
        ]),
        e('div', { key: 'a', className: 'exu-abas', style: { padding: '0 8px' } }, [['ativos', 'Ativos'], ['hist', 'Histórico']].map(([k, t]) => e('button', {
          key: k, type: 'button', className: 'exu-aba', 'aria-selected': aba === k ? 'true' : 'false', onClick: () => setAba(k),
        }, [t, e('span', { key: 'n', className: 'n' }, String(ALERTAS.filter((x) => (k === 'ativos' ? x.ativo : !x.ativo)).length))]))),
        e('ul', { key: 'l', className: 'ext-pop-lista' }, lista.map((a) => e('li', { key: a.id, className: lidos.includes(a.id) || !a.ativo ? '' : 'novo' }, [
          e('span', { key: 'i', className: 'ext-alerta-icone ' + a.tipo }, Ico(a.tipo === 'ok' ? 'Check' : 'AlertCircle', 14, 'currentColor')),
          e('div', { key: 't' }, [e('b', { key: 'b' }, a.titulo), e('small', { key: 's' }, a.texto), e('small', { key: 'q', className: 'quando' }, a.quando)]),
        ]))),
        e('div', { key: 'r', className: 'ext-pop-pe' }, [
          e('span', { key: 't' }, 'Checagem a cada 1 minuto'),
          e('button', { key: 'c', type: 'button', className: 'exu-btn pequeno', disabled: checando, onClick: checar }, [Ico('RefreshCw', 13, 'currentColor'), checando ? 'Checando…' : 'Checar agora']),
        ]),
      ]) : null,
    ]);
  }

  // Meus acessos: cofre travado pede a senha mestra; aberto mostra os logins (todos fictícios e mascarados).
  function MeusAcessos({ avisar }) {
    const [aberto, setAberto] = useState(false);
    const destravado = useCofre();
    const [senha, setSenha] = useState('');
    const [erro, setErro] = useState('');
    const [ver, setVer] = useState({});
    const [logins, setLogins] = useState([
      { usuario: 'ana.lima', empresas: ['Associação Aurora', 'Associação Boreal', 'Associação Cerrado'] },
      { usuario: 'ana.lima.delta', empresas: ['Associação Delta'] },
    ]);
    useEffect(() => { cofre.pedirAbrir = () => setAberto(true); return () => { cofre.pedirAbrir = null; }; }, []);
    const destravar = () => {
      if (senha.length < 4) { setErro('A senha mestra tem pelo menos 4 caracteres.'); return; }
      setErro(''); setSenha(''); cofre.mudar(true); avisar('Cofre destravado neste navegador.', 'ok');
    };
    const segredo = (k, final) => e('span', { className: 'ext-segredo' }, [
      e('code', { key: 'c' }, ver[k] ? 'exemplo-' + final : '•••••••••' + final),
      e('button', { key: 'b', type: 'button', className: 'exu-btn pequeno', onClick: () => setVer(Object.assign({}, ver, { [k]: !ver[k] })), 'aria-label': ver[k] ? 'Ocultar' : 'Mostrar' }, Ico('Eye', 13, 'currentColor')),
    ]);
    const linha = (rot, valor, acao) => e('div', { className: 'ext-acesso' }, [e('div', { key: 'r' }, rot), e('div', { key: 'v' }, valor), acao || null]);
    return e(React.Fragment, null, [
      e('button', { key: 'b', type: 'button', className: 'exu-btn', onClick: () => setAberto(true) }, [Ico(destravado ? 'Unlock' : 'Lock', 15, 'currentColor'), e('span', { key: 't', className: 'ext-rotulo' }, 'Meus acessos'), e('i', { key: 'i', className: 'ext-ponto ' + (destravado ? 'ok' : 'travado') })]),
      aberto ? e(Modal, {
        key: 'm', titulo: 'Meus acessos', largura: destravado ? 620 : 440, fechar: () => setAberto(false),
        descricao: destravado ? 'Ficam só neste navegador, cifrados no cofre. As automações recebem o que precisam ao abrir.' : 'O cofre está travado. Digite a senha mestra para usar os logins nas automações.',
        rodape: destravado ? [
          e('button', { key: 't', type: 'button', className: 'exu-btn', style: { marginRight: 'auto' }, onClick: () => { cofre.mudar(false); avisar('Cofre travado: os logins saíram da memória.', 'ok'); } }, [Ico('Lock', 14, 'currentColor'), 'Travar agora']),
          e('button', { key: 'c', type: 'button', className: 'exu-btn', onClick: () => setAberto(false) }, 'Fechar'),
          e('button', { key: 's', type: 'button', className: 'exu-btn primario', onClick: () => { setAberto(false); avisar('Acessos salvos no cofre (exemplo, nada foi gravado).', 'ok'); } }, 'Salvar'),
        ] : [e('button', { key: 'd', type: 'button', className: 'exu-btn primario', onClick: destravar }, 'Destravar')],
      }, destravado ? [
        e('section', { key: 'g', className: 'ext-grupo' }, [e('h4', { key: 'h' }, 'GLPI'), linha('Token pessoal', segredo('glpi', 'a41f'), e('button', { key: 'a', type: 'button', className: 'exu-btn pequeno' }, 'Trocar'))]),
        e('section', { key: 's', className: 'ext-grupo' }, [
          e('h4', { key: 'h' }, ['Logins do SGA ', e('span', { key: 'n', className: 'exu-tipo', style: { marginLeft: 6 } }, String(logins.length))]),
          e('p', { key: 'a', className: 'exu-campo-ajuda', style: { margin: 0 } }, 'Marque em quais associações cada login vale. Use mais de um login quando uma senha vale só para parte delas.'),
          ...logins.map((l, i) => e('div', { key: i, className: 'ext-login' }, [
            e('div', { key: 'c', className: 'ext-login-cab' }, [
              e('input', { key: 'u', className: 'ext-login-usuario', value: l.usuario, 'aria-label': 'Usuário do SGA', onChange: (ev) => setLogins(logins.map((x, j) => (j === i ? Object.assign({}, x, { usuario: ev.target.value }) : x))) }),
              segredo('sga' + i, '7k' + i),
              e('button', { key: 'r', type: 'button', className: 'exu-btn pequeno perigo', onClick: () => setLogins(logins.filter((_, j) => j !== i)), 'aria-label': 'Remover login ' + l.usuario }, Ico('Trash2', 13, 'currentColor')),
            ]),
            e('div', { key: 'e', className: 'ext-login-assoc', role: 'group', 'aria-label': 'Associações em que ' + l.usuario + ' vale' }, D.ASSOCIACOES.map((a) => {
              const usada = logins.some((x, j) => j !== i && x.empresas.includes(a));
              const marcada = l.empresas.includes(a);
              return e('button', {
                key: a, type: 'button', 'aria-pressed': marcada ? 'true' : 'false', title: usada && !marcada ? 'Já está em outro login' : '',
                className: usada && !marcada ? 'usada' : '',
                onClick: () => setLogins(logins.map((x, j) => (j === i ? Object.assign({}, x, { empresas: marcada ? x.empresas.filter((y) => y !== a) : [...x.empresas, a] }) : x))),
              }, [marcada ? Ico('Check', 12, 'currentColor', 2.5) : null, a.replace('Associação ', '')]);
            })),
            !l.empresas.length ? e('p', { key: 'v', className: 'exu-campo-erro', style: { margin: 0 } }, 'Marque pelo menos uma associação.') : null,
          ])),
          e('button', { key: 'add', type: 'button', className: 'exu-btn pequeno', style: { alignSelf: 'flex-start' }, onClick: () => setLogins([...logins, { usuario: 'novo.login', empresas: [] }]) }, [Ico('Plus', 13, 'currentColor'), 'Adicionar login do SGA']),
        ]),
        e('section', { key: 'c', className: 'ext-grupo' }, [e('h4', { key: 'h' }, 'PowerCRM'), linha('E-mail', 'ana.lima@exemplo.com'), linha('Senha', segredo('crm', 'x9'))]),
        e('section', { key: 'p', className: 'ext-grupo' }, [e('h4', { key: 'h' }, 'Novos usuários'), linha('Senha padrão', segredo('padrao', '20'))]),
        e('section', { key: 'v', className: 'ext-grupo' }, [e('h4', { key: 'h' }, 'Cofre'), linha('Trava sozinho', e('span', null, ['após 15 min parado ', e('small', { key: 's', style: { color: 'var(--muted)' } }, '(definido na Administração)')]))]),
      ] : [
        e(Campo, { key: 's', rotulo: 'Senha mestra', id: 'cofreSenha', erro, ajuda: 'No exemplo qualquer senha com 4 caracteres ou mais destrava.' }, e('input', { id: 'cofreSenha', type: 'password', value: senha, autoComplete: 'off', onChange: (ev) => setSenha(ev.target.value), onKeyDown: (ev) => { if (ev.key === 'Enter') destravar(); } })),
        e('p', { key: 'e', className: 'exu-campo-ajuda' }, 'Esqueceu a senha mestra? O cofre precisa ser apagado e os logins cadastrados de novo.'),
      ]) : null,
    ]);
  }

  const TUTORIAIS = [
    ['geral', 'Conhecendo o Hub', '1:42', 'Painel, abas, busca geral (Ctrl K) e como abrir uma automação.'],
    ['acessos', 'Meus acessos e o cofre', '2:10', 'Cadastrar os logins do SGA e do PowerCRM e travar o cofre.'],
    ['chamados', 'Rodando chamados', '3:05', 'Filtros, painel do chamado, rodar em lote e o modo teste.'],
    ['chamados', 'Modo automático', '1:58', 'Quantos rodam por vez, tipos e o que fica de fora.'],
    ['resultados', 'Lendo os resultados', '2:24', 'Períodos, comparação e disponibilidade das automações.'],
    ['alertas', 'Alertas', '0:56', 'O que cada alerta quer dizer e quando agir.'],
  ];
  function Ajuda() {
    const [aberto, setAberto] = useState(false);
    const [atual, setAtual] = useState(0);
    const t = TUTORIAIS[atual];
    return e(React.Fragment, null, [
      e('button', { key: 'b', type: 'button', className: 'ex-icone-btn', onClick: () => setAberto(true), 'aria-label': 'Como usar o Hub', title: 'Como usar o Hub' }, '?'),
      aberto ? e(Modal, { key: 'm', titulo: 'Como usar o Hub', descricao: 'Vídeos curtos de cada parte. No exemplo os vídeos são só a moldura.', largura: 760, fechar: () => setAberto(false) },
        e('div', { className: 'ext-ajuda' }, [
          e('ul', { key: 'l', className: 'ext-ajuda-lista' }, TUTORIAIS.map((x, i) => e('li', { key: i }, e('button', { type: 'button', 'aria-current': i === atual ? 'true' : undefined, onClick: () => setAtual(i) }, [
            e('span', { key: 't' }, x[1]), e('small', { key: 'd' }, x[2]),
          ])))),
          e('div', { key: 'v' }, [
            e('div', { key: 'p', className: 'ext-video' }, [e('span', { key: 'b', className: 'ext-play' }, Ico('Play', 22, 'currentColor')), e('small', { key: 'd' }, t[2])]),
            e('b', { key: 't', style: { display: 'block', marginTop: 12, fontSize: 14 } }, t[1]),
            e('p', { key: 'd', style: { margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' } }, t[3]),
          ]),
        ])) : null,
    ]);
  }

  // Aviso de nova versão: aparece uma vez, 25 s depois de abrir (no Hub de verdade, quando o front muda).
  function AvisoVersao() {
    const [ver, setVer] = useState(false);
    useEffect(() => { const t = setTimeout(() => setVer(true), 25000); return () => clearTimeout(t); }, []);
    if (!ver) return null;
    return e('div', { className: 'ext-versao', role: 'status' }, [
      Ico('Zap', 15, 'currentColor'), e('span', { key: 't' }, 'Nova versão do Hub disponível.'),
      e('button', { key: 'r', type: 'button', className: 'exu-btn pequeno primario', onClick: () => location.reload() }, 'Recarregar'),
      e('button', { key: 'd', type: 'button', className: 'exu-btn pequeno', onClick: () => setVer(false) }, 'Depois'),
    ]);
  }

  window.ExemploTopo = { AbrirChamado, Alertas, MeusAcessos, Ajuda, AvisoVersao, cofre };
})();
