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
  const Numeros = (a, uso) => {
    const u = uso[String(a.id)];
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
        e('div', { key: 's' }, [e('dt', { key: 't' }, 'Sucesso'), e('dd', { key: 'd' }, taxa)]),
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

  const MODELOS = [
    { chave: 'atual', nome: 'Modelo 1: atual', texto: 'O card de hoje, para comparar.', desenhar: Atual, grade: 'mc-grade' },
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
    return e('main', { className: 'mc-tela' }, [
      e('header', { key: 'h', className: 'mc-cab' }, [
        e('div', { key: 't' }, [
          e('h1', { key: 'h' }, 'Modelos de card'),
          e('p', { key: 'p', className: 'mc-desc' }, 'Os mesmos dados do painel em seis visuais. Diga qual modelo prefere e ele vai para o Hub.'),
        ]),
        e('div', { key: 'a', className: 'mc-acoes' }, [
          lista && lista.length > 6 ? e('button', { key: 'todas', type: 'button', className: 'mc-botao', onClick: () => setTodas(!todas) },
            todas ? 'Mostrar só 6' : 'Mostrar todas (' + lista.length + ')') : null,
          e('button', { key: 'tema', type: 'button', className: 'mc-botao', onClick: trocarTema }, tema === 'dark' ? 'Tema claro' : 'Tema escuro'),
          e('a', { key: 'hub', className: 'mc-botao', href: '/' }, 'Voltar ao Hub'),
        ]),
      ]),
      e('nav', { key: 'n', className: 'mc-indice', 'aria-label': 'Modelos' }, MODELOS.map((m) => e('a', { key: m.chave, href: '#' + m.chave }, m.nome))),
      erro ? e('p', { key: 'erro', className: 'mc-aviso', role: 'alert' }, erro) : null,
      !lista && !erro ? e('p', { key: 'c', className: 'mc-aviso' }, 'Carregando automações…') : null,
      lista && !lista.length ? e('p', { key: 'v', className: 'mc-aviso' }, 'Nenhuma automação cadastrada.') : null,
      ...(mostradas.length ? MODELOS.map((m) => e('section', { key: m.chave, id: m.chave, className: 'mc-modelo', 'aria-labelledby': 't-' + m.chave }, [
        e('div', { key: 'c', className: 'mc-modelo-cab' }, [
          e('h2', { key: 'h', id: 't-' + m.chave }, m.nome),
          e('p', { key: 'p', className: 'mc-desc' }, m.texto),
        ]),
        e('div', { key: 'g', className: m.grade }, mostradas.map((a) => e(React.Fragment, { key: a.id }, m.desenhar(a, uso)))),
      ])) : []),
      lista && lista.length ? e('p', { key: 'r', className: 'mc-nota' }, plural(lista.length, 'automação cadastrada', 'automações cadastradas') + '.') : null,
    ]);
  }

  ReactDOM.createRoot(document.getElementById('root')).render(e(App));
})();
