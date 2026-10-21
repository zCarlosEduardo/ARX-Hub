// Vitrine de modelos de card do painel: cada modelo desenha as mesmas automações (dados reais de /api/automations e
// execuções dos últimos 30 dias de /api/execucoes/resumo). Só mostra; abrir uma automação continua sendo no Hub.
(function () {
  const e = React.createElement;
  const { useState, useEffect } = React;
  const { Icon, CATEGORY_CHOICES } = window.Icons;
  const CATEGORIA = Object.fromEntries(CATEGORY_CHOICES.map((c) => [c.key, c]));
  const STATUS = {
    online: { classe: 'online', texto: 'Online' },
    offline: { classe: 'offline', texto: 'Offline' },
    checking: { classe: 'checking', texto: 'Verificando' },
  };
  const COR_PADRAO = '#6b7280';
  const corDe = (a) => (/^#[0-9a-f]{6}$/i.test(a.color || '') ? a.color : COR_PADRAO);
  // texto na cor do cadastro misturado com a cor do texto: mantém a identidade e passa no contraste nos dois temas
  const tinta = (cor) => 'color-mix(in srgb, ' + cor + ' var(--chip-mix), var(--text))';
  const numero = (n) => Number(n || 0).toLocaleString('pt-BR');
  const plural = (n, um, varios) => numero(n) + ' ' + (n === 1 ? um : varios);

  function diaSp(deslocamentoDias) {
    const d = new Date(Date.now() - deslocamentoDias * 86400000);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
  }

  const Status = (a) => {
    const s = STATUS[a.status] || STATUS.checking;
    return e('span', { className: 'v2-status ' + s.classe }, [e('i', { key: 'i', 'aria-hidden': true }), s.texto]);
  };
  const Categorias = (a) => {
    const cats = (a.categories || []).map((k) => CATEGORIA[k]).filter(Boolean);
    return cats.length ? e('div', { className: 'mc-cats' }, cats.map((c) => e('span', {
      key: c.key, className: 'mc-cat', style: { background: c.color + '22', color: tinta(c.color) },
    }, c.label))) : null;
  };
  const Abrir = (texto) => e('a', { className: 'mc-abrir', href: '/' }, texto || 'Abrir');
  const Quadro = (a, tam) => e('span', {
    className: 'mc-icone', 'aria-hidden': true,
    style: { width: tam, height: tam, background: corDe(a) + '22' },
  }, Icon(a.icon, Math.round(tam / 2), corDe(a)));

  // 1. o card de hoje, como referência
  const Atual = (a) => e('article', { className: 'mc-card mc-atual' }, [
    e('div', { key: 't', className: 'mc-linha' }, [Quadro(a, 38), Status(a)]),
    Categorias(a) && e('div', { key: 'c' }, Categorias(a)),
    e('h3', { key: 'n' }, a.name),
    e('p', { key: 'd', className: 'mc-desc' }, a.description || 'Sem descrição'),
    e('div', { key: 'b', className: 'mc-rodape' }, Abrir()),
  ]);

  // Atual melhorado: mesma estrutura do card de hoje. A cor do cadastro entra como variável (--c) e o CSS tinge.
  const Seta = () => e('span', { className: 'mc-seta', 'aria-hidden': true }, Icon('ArrowLeft', 15, 'currentColor', 2.25));
  const comCor = (a, extra) => ({ '--c': corDe(a), ...extra });

  // A. refinado: brilho suave na cor do cadastro, ícone com anel, rodapé com sistemas e botão com seta
  const Refinado = (a) => e('article', { className: 'mc-card mc-ref', style: comCor(a) }, [
    e('div', { key: 't', className: 'mc-linha' }, [
      e('span', { key: 'i', className: 'mc-ref-icone', 'aria-hidden': true }, Icon(a.icon, 20, corDe(a))),
      Status(a),
    ]),
    e('div', { key: 'x', className: 'mc-ref-texto' }, [
      e('h3', { key: 'n' }, a.name),
      e('p', { key: 'd', className: 'mc-desc' }, a.description || 'Sem descrição'),
    ]),
    e('div', { key: 'b', className: 'mc-ref-rodape' }, [
      Categorias(a) || e('span', { key: 'v' }),
      e('a', { key: 'a', className: 'mc-ref-abrir', href: '/' }, ['Abrir', Seta()]),
    ]),
  ]);

  // B. gradiente: fundo levemente tingido de cima para baixo e ícone maior
  const Gradiente = (a) => e('article', { className: 'mc-card mc-ref mc-grad', style: comCor(a) }, [
    e('div', { key: 't', className: 'mc-linha' }, [
      e('span', { key: 'i', className: 'mc-ref-icone mc-grad-icone', 'aria-hidden': true }, Icon(a.icon, 22, corDe(a))),
      Status(a),
    ]),
    Categorias(a) && e('div', { key: 'c' }, Categorias(a)),
    e('div', { key: 'x', className: 'mc-ref-texto' }, [
      e('h3', { key: 'n' }, a.name),
      e('p', { key: 'd', className: 'mc-desc' }, a.description || 'Sem descrição'),
    ]),
    e('a', { key: 'a', className: 'mc-grad-abrir', href: '/' }, ['Abrir automação', Seta()]),
  ]);

  // C. limpo: o card inteiro é o link, sem botão; a seta aparece ao passar o mouse
  const Limpo = (a) => e('a', { className: 'mc-card mc-ref mc-limpo', style: comCor(a), href: '/', 'aria-label': 'Abrir ' + a.name }, [
    e('div', { key: 't', className: 'mc-linha' }, [
      e('span', { key: 'i', className: 'mc-ref-icone', 'aria-hidden': true }, Icon(a.icon, 20, corDe(a))),
      Seta(),
    ]),
    e('div', { key: 'x', className: 'mc-ref-texto' }, [
      e('h3', { key: 'n' }, a.name),
      e('p', { key: 'd', className: 'mc-desc' }, a.description || 'Sem descrição'),
    ]),
    e('div', { key: 'b', className: 'mc-ref-rodape' }, [Categorias(a) || e('span', { key: 'v' }), Status(a)]),
  ]);

  function ha(iso) {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (!Number.isFinite(s)) return '';
    if (s < 60) return 'agora';
    if (s < 3600) return 'há ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'há ' + Math.floor(s / 3600) + ' h';
    const d = Math.floor(s / 86400);
    return 'há ' + d + (d === 1 ? ' dia' : ' dias');
  }
  const IconeRef = (a, tam) => e('span', { key: 'i', className: 'mc-ref-icone', 'aria-hidden': true, style: tam ? { width: tam, height: tam } : null }, Icon(a.icon, tam ? Math.round(tam / 2.1) : 20, corDe(a)));
  const Texto = (a) => e('div', { key: 'x', className: 'mc-ref-texto' }, [
    e('h3', { key: 'n' }, a.name),
    e('p', { key: 'd', className: 'mc-desc' }, a.description || 'Sem descrição'),
  ]);
  const BotaoAbrir = (largo) => e('a', { key: 'a', className: 'mc-ref-abrir' + (largo ? ' mc-ref-largo' : ''), href: '/' }, ['Abrir', Seta()]);

  // Menu ⋯ (só quem administra vê no Hub). Na vitrine os itens só fecham o menu.
  const Menu = (a, ctx) => {
    const aberto = ctx.menu === a.id;
    const fechar = () => ctx.setMenu(null);
    const item = (k, icone, texto, perigo) => e('button', {
      key: k, type: 'button', role: 'menuitem', className: 'mc-menu-item' + (perigo ? ' perigo' : ''), onClick: fechar,
    }, [Icon(icone, 14, 'currentColor'), texto]);
    return e('div', { key: 'm', className: 'mc-menu' }, [
      e('button', {
        key: 'b', type: 'button', className: 'mc-menu-btn', 'aria-label': 'Ações de ' + a.name, 'aria-haspopup': 'menu', 'aria-expanded': aberto,
        onClick: (ev) => { ev.stopPropagation(); ctx.setMenu(aberto ? null : a.id); },
      }, Icon('MoreHorizontal', 17, 'currentColor')),
      aberto ? e('div', { key: 'p', className: 'mc-menu-pop', role: 'menu', onClick: (ev) => ev.stopPropagation() }, [
        item('ed', 'Pencil', 'Editar'),
        item('na', 'ExternalLink', 'Abrir em nova aba'),
        item('cp', 'Copy', 'Copiar URL'),
        e('div', { key: 's', className: 'mc-menu-sep' }),
        item('rm', 'Trash2', 'Remover', true),
      ]) : null,
    ]);
  };

  // Refinado completo: tudo o que o card do Painel tem hoje (status, menu, sistemas, endereço, Abrir)
  const RefinadoCompleto = (a, ctx) => e('article', { className: 'mc-card mc-ref', style: comCor(a) }, [
    e('div', { key: 't', className: 'mc-linha' }, [
      IconeRef(a),
      e('div', { key: 'd', className: 'mc-ref-acoes' }, [Status(a), Menu(a, ctx)]),
    ]),
    Texto(a),
    a.endereco ? e('div', { key: 'u', className: 'mc-ref-end' }, a.endereco) : null,
    e('div', { key: 'b', className: 'mc-ref-rodape' }, [Categorias(a) || e('span', { key: 'v' }), BotaoAbrir()]),
  ]);

  // Variações do refinado
  const RefDetalhes = (a, ctx) => e('article', { className: 'mc-card mc-ref', style: comCor(a) }, [
    e('div', { key: 't', className: 'mc-linha' }, [IconeRef(a), e('div', { key: 'd', className: 'mc-ref-acoes' }, [Status(a), Menu(a, ctx)])]),
    Texto(a),
    e('dl', { key: 'k', className: 'mc-ref-info' }, [
      e('div', { key: 'e' }, [e('dt', { key: 't' }, 'Endereço'), e('dd', { key: 'd', className: 'mono' }, a.endereco || 'Oculto')]),
      // last_checked_at só é gravado quando o status muda: é "desde quando está assim", não a última checagem
      e('div', { key: 'v' }, [
        e('dt', { key: 't' }, a.status === 'offline' ? 'Fora do ar' : a.status === 'online' ? 'No ar' : 'Situação'),
        e('dd', { key: 'd' }, ha(a.lastCheckedAt) || 'Sem dados'),
      ]),
    ]),
    e('div', { key: 'b', className: 'mc-ref-rodape' }, [Categorias(a) || e('span', { key: 'v' }), BotaoAbrir()]),
  ]);

  const RefLinha = (a, ctx) => e('article', { className: 'mc-card mc-ref mc-ref-linha', style: comCor(a) }, [
    e('div', { key: 't', className: 'mc-linha' }, [
      e('div', { key: 'c', className: 'mc-ref-cats-topo' }, Categorias(a)),
      e('div', { key: 'd', className: 'mc-ref-acoes' }, [Status(a), Menu(a, ctx)]),
    ]),
    e('div', { key: 'n', className: 'mc-titulo' }, [IconeRef(a, 34), e('h3', { key: 'h' }, a.name)]),
    e('p', { key: 'd', className: 'mc-desc' }, a.description || 'Sem descrição'),
    e('div', { key: 'b', className: 'mc-ref-rodape' }, [
      e('span', { key: 'u', className: 'mc-ref-end' }, a.endereco || ''),
      BotaoAbrir(),
    ]),
  ]);

  const RefLargo = (a, ctx) => e('article', { className: 'mc-card mc-ref', style: comCor(a) }, [
    e('div', { key: 't', className: 'mc-linha' }, [IconeRef(a), e('div', { key: 'd', className: 'mc-ref-acoes' }, [Status(a), Menu(a, ctx)])]),
    Categorias(a) && e('div', { key: 'c' }, Categorias(a)),
    Texto(a),
    e('div', { key: 'b', className: 'mc-ref-botoes' }, [
      BotaoAbrir(true),
      e('a', { key: 'n', className: 'mc-ref-nova', href: '/', target: '_blank', rel: 'noopener', 'aria-label': 'Abrir ' + a.name + ' em nova aba' }, Icon('ExternalLink', 15, 'currentColor')),
    ]),
  ]);

  const RefHorizontal = (a, ctx) => e('article', { className: 'mc-card mc-ref mc-ref-horiz', style: comCor(a) }, [
    IconeRef(a, 52),
    e('div', { key: 'c', className: 'mc-ref-horiz-corpo' }, [
      e('div', { key: 't', className: 'mc-linha' }, [e('h3', { key: 'n' }, a.name), e('div', { key: 'd', className: 'mc-ref-acoes' }, [Status(a), Menu(a, ctx)])]),
      e('p', { key: 'd', className: 'mc-desc' }, a.description || 'Sem descrição'),
      e('div', { key: 'b', className: 'mc-ref-rodape' }, [Categorias(a) || e('span', { key: 'v' }), BotaoAbrir()]),
    ]),
  ]);

  const RefNumeros = (a, ctx) => {
    const u = ctx.uso[String(a.id)];
    const execs = u ? u.execucoes : 0;
    return e('article', { className: 'mc-card mc-ref', style: comCor(a) }, [
      e('div', { key: 't', className: 'mc-linha' }, [IconeRef(a), e('div', { key: 'd', className: 'mc-ref-acoes' }, [Status(a), Menu(a, ctx)])]),
      Texto(a),
      e('p', { key: 'k', className: 'mc-ref-uso' }, [
        Icon('Activity', 14, 'currentColor'),
        execs ? plural(execs, 'execução', 'execuções') + ' em 30 dias' : 'Nenhuma execução em 30 dias',
      ]),
      e('div', { key: 'b', className: 'mc-ref-rodape' }, [Categorias(a) || e('span', { key: 'v' }), BotaoAbrir()]),
    ]);
  };

  const RefFaixa = (a, ctx) => e('article', { className: 'mc-card mc-ref mc-ref-faixa', style: comCor(a) }, [
    e('div', { key: 't', className: 'mc-linha' }, [IconeRef(a), e('div', { key: 'd', className: 'mc-ref-acoes' }, [Status(a), Menu(a, ctx)])]),
    Texto(a),
    e('div', { key: 'b', className: 'mc-ref-rodape' }, [Categorias(a) || e('span', { key: 'v' }), BotaoAbrir()]),
  ]);

  // 2. lista compacta: cabe muito mais automação na tela
  const Compacto = (a) => e('article', { className: 'mc-card mc-compacto' }, [
    Quadro(a, 34),
    e('div', { key: 'x', className: 'mc-texto' }, [
      e('h3', { key: 'n' }, a.name),
      e('p', { key: 'd', className: 'mc-desc mc-1linha' }, a.description || 'Sem descrição'),
    ]),
    Status(a),
    Abrir(),
  ]);

  // 3. faixa na cor do cadastro à esquerda
  const Faixa = (a) => e('article', { className: 'mc-card mc-faixa', style: { borderLeftColor: corDe(a) } }, [
    e('div', { key: 't', className: 'mc-linha' }, [
      e('div', { key: 'i', className: 'mc-titulo' }, [Icon(a.icon, 18, corDe(a)), e('h3', { key: 'n' }, a.name)]),
      Status(a),
    ]),
    e('p', { key: 'd', className: 'mc-desc' }, a.description || 'Sem descrição'),
    e('div', { key: 'b', className: 'mc-rodape mc-entre' }, [Categorias(a) || e('span', { key: 'v' }), Abrir()]),
  ]);

  // 4. com números reais dos últimos 30 dias
  const Numeros = (a, ctx) => {
    const u = ctx.uso[String(a.id)];
    const feitos = u ? u.concluidos : 0;
    const total = u ? u.concluidos + u.erros : 0;
    const taxa = total ? Math.round((feitos / total) * 100) + '%' : 'Sem dados';
    return e('article', { className: 'mc-card mc-numeros' }, [
      e('div', { key: 't', className: 'mc-linha' }, [
        e('div', { key: 'i', className: 'mc-titulo' }, [Quadro(a, 32), e('h3', { key: 'n' }, a.name)]),
        Status(a),
      ]),
      e('dl', { key: 'k', className: 'mc-kpis' }, [
        e('div', { key: 'e' }, [e('dt', { key: 't' }, 'Execuções'), e('dd', { key: 'd' }, numero(u ? u.execucoes : 0))]),
        e('div', { key: 'c' }, [e('dt', { key: 't' }, 'Itens feitos'), e('dd', { key: 'd' }, numero(feitos))]),
        e('div', { key: 's' }, [e('dt', { key: 't' }, 'Sucesso'), e('dd', { key: 'd', className: total ? '' : 'mc-sem' }, taxa)]),
      ]),
      e('div', { key: 'b', className: 'mc-rodape mc-entre' }, [e('span', { key: 'p', className: 'mc-nota' }, 'Últimos 30 dias'), Abrir()]),
    ]);
  };

  // 5. ícone em destaque, estilo lançador de apps
  const Icone = (a) => e('article', { className: 'mc-card mc-icone-grande' }, [
    e('div', { key: 's', className: 'mc-canto' }, Status(a)),
    Quadro(a, 56),
    e('h3', { key: 'n' }, a.name),
    e('p', { key: 'd', className: 'mc-desc' }, a.description || 'Sem descrição'),
    Abrir(),
  ]);

  // 6. cabeçalho tingido com a cor do cadastro
  const Cabecalho = (a) => e('article', { className: 'mc-card mc-cabecalho' }, [
    e('div', { key: 'h', className: 'mc-topo', style: { background: corDe(a) + '1f' } }, [
      e('span', { key: 'i', className: 'mc-icone mc-icone-cheio', 'aria-hidden': true, style: { background: corDe(a) } }, Icon(a.icon, 18, '#ffffff')),
      Status(a),
    ]),
    e('div', { key: 'c', className: 'mc-corpo' }, [
      e('h3', { key: 'n' }, a.name),
      e('p', { key: 'd', className: 'mc-desc' }, a.description || 'Sem descrição'),
      Categorias(a) && e('div', { key: 'k' }, Categorias(a)),
      e('div', { key: 'b', className: 'mc-rodape' }, Abrir('Abrir automação')),
    ]),
  ]);

  const VARIACOES = [
    { chave: 'refinado', nome: 'Refinado 1: original', texto: 'O modelo escolhido, sem menu e sem endereço.', desenhar: Refinado, grade: 'mc-grade' },
    { chave: 'ref-detalhes', nome: 'Refinado 2: com detalhes', texto: 'Endereço e há quanto tempo está no ar (ou fora) em uma ficha abaixo da descrição.', desenhar: RefDetalhes, grade: 'mc-grade' },
    { chave: 'ref-linha', nome: 'Refinado 3: sistemas no topo', texto: 'Sistemas no alto, ícone ao lado do nome e endereço no rodapé.', desenhar: RefLinha, grade: 'mc-grade' },
    { chave: 'ref-largo', nome: 'Refinado 4: botão largo', texto: 'Abrir ocupa a largura do card, com um botão ao lado para abrir em nova aba.', desenhar: RefLargo, grade: 'mc-grade' },
    { chave: 'ref-horiz', nome: 'Refinado 5: horizontal', texto: 'Ícone grande à esquerda e o conteúdo ao lado. Cards mais largos e mais baixos.', desenhar: RefHorizontal, grade: 'mc-grade mc-grade-larga' },
    { chave: 'ref-numeros', nome: 'Refinado 6: com uso', texto: 'Uma linha com as execuções dos últimos 30 dias (fora o modo teste).', desenhar: RefNumeros, grade: 'mc-grade' },
    { chave: 'ref-faixa', nome: 'Refinado 7: faixa no topo', texto: 'Linha fina na cor do cadastro no alto do card, no lugar do brilho.', desenhar: RefFaixa, grade: 'mc-grade' },
  ];

  const MODELOS = [
    { chave: 'atual', nome: 'Modelo 1: atual', texto: 'O card de hoje, para comparar.', desenhar: Atual, grade: 'mc-grade' },
    { chave: 'gradiente', nome: 'Atual melhorado B: gradiente', texto: 'Fundo levemente tingido com a cor do cadastro, ícone maior e botão que ganha a cor ao passar o mouse.', desenhar: Gradiente, grade: 'mc-grade' },
    { chave: 'limpo', nome: 'Atual melhorado C: limpo', texto: 'Sem botão: o card inteiro abre a automação e a seta aparece ao passar o mouse. Status no rodapé.', desenhar: Limpo, grade: 'mc-grade' },
    { chave: 'compacto', nome: 'Modelo 2: lista compacta', texto: 'Uma linha por automação. Mostra mais automações sem rolar.', desenhar: Compacto, grade: 'mc-lista' },
    { chave: 'faixa', nome: 'Modelo 3: faixa colorida', texto: 'Borda na cor do cadastro e ícone ao lado do nome.', desenhar: Faixa, grade: 'mc-grade' },
    { chave: 'numeros', nome: 'Modelo 4: com números', texto: 'Execuções, itens feitos e taxa de sucesso dos últimos 30 dias (fora o modo teste).', desenhar: Numeros, grade: 'mc-grade' },
    { chave: 'icone', nome: 'Modelo 5: ícone em destaque', texto: 'Ícone grande e centralizado, como um lançador de apps.', desenhar: Icone, grade: 'mc-grade mc-grade-estreita' },
    { chave: 'cabecalho', nome: 'Modelo 6: cabeçalho colorido', texto: 'Topo tingido com a cor do cadastro e ícone preenchido.', desenhar: Cabecalho, grade: 'mc-grade' },
  ];

  function App() {
    const [lista, setLista] = useState(null);
    const [erro, setErro] = useState('');
    const [uso, setUso] = useState({});
    const [todas, setTodas] = useState(false);
    const [tema, setTema] = useState(document.documentElement.getAttribute('data-theme'));
    const [menu, setMenu] = useState(null);

    useEffect(() => {
      if (menu == null) return undefined;
      const fechar = () => setMenu(null);
      const tecla = (ev) => { if (ev.key === 'Escape') setMenu(null); };
      document.addEventListener('click', fechar);
      document.addEventListener('keydown', tecla);
      return () => { document.removeEventListener('click', fechar); document.removeEventListener('keydown', tecla); };
    }, [menu]);

    useEffect(() => {
      fetch('/api/automations')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
        .then((l) => setLista(Array.isArray(l) ? l : []))
        .catch(() => setErro('Não foi possível carregar as automações.'));
      fetch('/api/execucoes/resumo?desde=' + diaSp(29) + '&ate=' + diaSp(0))
        .then((r) => (r.ok ? r.json() : null))
        .then((r) => {
          if (r && Array.isArray(r.porAutomacao)) setUso(Object.fromEntries(r.porAutomacao.map((x) => [String(x.automacaoId), x])));
        })
        .catch(() => { /* sem resumo: o modelo 4 mostra zeros e "Sem dados" */ });
    }, []);

    const trocarTema = () => {
      const novo = tema === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', novo);
      try { localStorage.setItem('arx-tema', novo); } catch (err) { /* sem armazenamento: vale só nesta aba */ }
      setTema(novo);
    };

    const mostradas = lista ? (todas ? lista : lista.slice(0, 6)) : [];
    const ctx = { uso, menu, setMenu };
    // a seção Banco de Dados fica abaixo das demais, como no Painel
    const ehDb = (a) => (a.categories || []).includes('db');
    const principais = (lista || []).filter((a) => !ehDb(a));
    const doBanco = (lista || []).filter(ehDb);
    const online = (lista || []).filter((a) => a.status === 'online').length;
    const gradeCompleta = (key, l) => e('div', { key, className: 'mc-grade' }, l.map((a) => e(React.Fragment, { key: a.id }, RefinadoCompleto(a, ctx))));
    const secao = (m) => e('section', { key: m.chave, id: m.chave, className: 'mc-modelo', 'aria-labelledby': 't-' + m.chave }, [
      e('div', { key: 'c', className: 'mc-modelo-cab' }, [
        e('h2', { key: 'h', id: 't-' + m.chave }, m.nome),
        e('p', { key: 'p', className: 'mc-desc' }, m.texto),
      ]),
      e('div', { key: 'g', className: m.grade }, mostradas.map((a) => e(React.Fragment, { key: a.id }, m.desenhar(a, ctx)))),
    ]);
    const grupo = (chave, titulo, texto) => e('div', { key: chave, className: 'mc-grupo' }, [
      e('h2', { key: 'h' }, titulo), e('p', { key: 'p', className: 'mc-desc' }, texto),
    ]);
    const completo = lista && lista.length ? e('section', { key: 'completo', id: 'completo', className: 'mc-modelo', 'aria-labelledby': 't-completo' }, [
      e('div', { key: 'c', className: 'mc-modelo-cab mc-entre-cab' }, [
        e('div', { key: 't' }, [
          e('h2', { key: 'h', id: 't-completo' }, 'Refinado completo: como fica o Painel'),
          e('p', { key: 'p', className: 'mc-desc' }, 'Todas as automações com tudo o que o card tem hoje: status, menu de ações (⋯), sistemas, endereço e Abrir. Na vitrine os itens do menu não fazem nada.'),
        ]),
        e('span', { key: 's', className: 'mc-nota' }, plural(lista.length, 'automação', 'automações') + ' · ' + online + ' online · ' + (lista.length - online) + ' offline'),
      ]),
      gradeCompleta('g', principais),
      doBanco.length ? e('section', { key: 'db', className: 'db-section', 'aria-label': 'Banco de Dados' }, [
        e('div', { key: 'head', className: 'db-section-head' }, [
          e('div', { key: 'icon', className: 'db-section-icon' }, Icon('Database', 18, 'var(--db-color)')),
          e('div', { key: 'txt', style: { minWidth: 0 } }, [
            e('div', { key: 't', className: 'mc-db-titulo' }, 'Banco de Dados'),
            e('div', { key: 's', className: 'mc-desc' }, 'Rotinas que alimentam e mantêm o banco-central.'),
          ]),
          e('span', { key: 'count', className: 'db-section-count' }, plural(doBanco.length, 'automação', 'automações')),
        ]),
        gradeCompleta('grid', doBanco),
      ]) : null,
    ]) : null;
    return e('main', { className: 'mc-tela' }, [
      e('header', { key: 'h', className: 'mc-cab' }, [
        e('div', { key: 't' }, [
          e('h1', { key: 'h' }, 'Modelos de card'),
          e('p', { key: 'p', className: 'mc-desc' }, 'Os mesmos dados do painel em visuais diferentes. Diga qual modelo prefere e ele vai para o Hub.'),
        ]),
        e('div', { key: 'a', className: 'mc-acoes' }, [
          lista && lista.length > 6 ? e('button', { key: 'todas', type: 'button', className: 'mc-botao', onClick: () => setTodas(!todas) },
            todas ? 'Mostrar só 6' : 'Mostrar todas (' + lista.length + ')') : null,
          e('button', { key: 'tema', type: 'button', className: 'mc-botao', onClick: trocarTema }, tema === 'dark' ? 'Tema claro' : 'Tema escuro'),
          e('a', { key: 'hub', className: 'mc-botao', href: '/' }, 'Voltar ao Hub'),
        ]),
      ]),
      e('nav', { key: 'n', className: 'mc-indice', 'aria-label': 'Modelos' }, [
        e('a', { key: 'completo', href: '#completo', className: 'destaque' }, 'Refinado completo'),
        ...VARIACOES.map((m) => e('a', { key: m.chave, href: '#' + m.chave }, m.nome)),
        e('a', { key: 'outros', href: '#outros' }, 'Outros modelos'),
      ]),
      erro ? e('p', { key: 'erro', className: 'mc-aviso', role: 'alert' }, erro) : null,
      !lista && !erro ? e('p', { key: 'c', className: 'mc-aviso' }, 'Carregando automações…') : null,
      lista && !lista.length ? e('p', { key: 'v', className: 'mc-aviso' }, 'Nenhuma automação cadastrada.') : null,
      completo,
      mostradas.length ? grupo('gv', 'Variações do refinado', 'Mesmo estilo, com arranjos diferentes. As variações mostram 6 automações; use "Mostrar todas" para ver o resto.') : null,
      ...(mostradas.length ? VARIACOES.map(secao) : []),
      mostradas.length ? e('div', { key: 'go', id: 'outros' }, grupo('go2', 'Outros modelos', 'Os modelos da primeira rodada, para comparar.')) : null,
      ...(mostradas.length ? MODELOS.map(secao) : []),
      lista && lista.length ? e('p', { key: 'r', className: 'mc-nota' }, plural(lista.length, 'automação cadastrada', 'automações cadastradas') + '.') : null,
    ]);
  }

  ReactDOM.createRoot(document.getElementById('root')).render(e(App));
})();
