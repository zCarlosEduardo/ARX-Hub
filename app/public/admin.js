// Painel de administração do Hub. O botão "Administração" só aparece para quem é administrador: o Hub não tem login próprio,
// a pessoa é identificada pelo token do GLPI (guardado no cofre dos acessos) e a lista de admins fica no servidor.
//
// Páginas agrupadas no menu (GRUPOS_ABAS): Acesso (Cofre, Administradores, Histórico), Automações, IA local (IA e
// Revisão da IA) e WhatsApp (Configuração, Vínculos, Conexão e pedidos). Layout no padrão das telas de configuração:
// cada página com título e subtítulo, seções em cartões (secao) com rodapé de salvar, chaves liga/desliga e cartões
// de opção; classes .admin-* em styles.css.
// Expõe window.AdminAba (aba do cabeçalho, só para administradores) e window.AdminView (a tela, como Chamados e Resultados).
(function () {
  const e = React.createElement;
  const { useState, useEffect, useRef } = React;
  const { Icon } = window.Icons;
  const hub = () => window.ArxAcessosHub;
  const tokenAtual = () => ((hub() && hub().ler()) || {}).userToken || '';

  /** Chamada autenticada: o token do GLPI vai no cabeçalho; o servidor decide se a pessoa é admin. */
  async function api(metodo, caminho, corpo) {
    const resp = await fetch(caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', 'X-Glpi-Token': tokenAtual() },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const dados = resp.status === 204 ? null : await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error((dados && dados.error) || `Falha (${resp.status}).`);
    return dados;
  }

  const copia = (x) => JSON.parse(JSON.stringify(x));
  const proximoId = (prefixo, lista) => {
    let n = lista.length + 1;
    while (lista.some((x) => x.id === prefixo + n)) n += 1;
    return prefixo + n;
  };

  // ---------- peças de tela ----------
  const ui = () => hub().ui;
  const S = () => ui().S;
  const rotulo = (texto) => e('div', { className: 'admin-rotulo' }, texto);
  const dica = (texto) => e('div', { className: 'admin-dica' }, texto);
  /** Liga/desliga (chave): o texto é a pergunta, à esquerda; a chave fica à direita, como nas telas de configuração. */
  const caixa = (marcado, onChange, texto, { key, ...estilo } = {}) =>
    e('label', { key, className: 'admin-chave-linha', style: estilo }, [
      e('span', { key: 't', className: 'admin-chave-texto' }, texto),
      e('input', { key: 'c', type: 'checkbox', role: 'switch', className: 'admin-chave', checked: !!marcado, onChange: (ev) => onChange(ev.target.checked) }),
    ]);
  /** Escolha entre opções que se excluem: cartão com título e explicação (rádio). */
  const opcao = (nomeGrupo, marcado, onChange, titulo, descricao) =>
    e('label', { key: titulo, className: 'admin-opcao' + (marcado ? ' marcada' : '') }, [
      e('input', { key: 'r', type: 'radio', name: nomeGrupo, checked: !!marcado, onChange: () => onChange() }),
      e('span', { key: 't', className: 'admin-opcao-texto' }, [e('strong', { key: 'a' }, titulo), descricao ? e('span', { key: 'b' }, descricao) : null]),
    ]);
  const selecao = (valor, onChange, opcoes, { key, ...extra } = {}) =>
    e('select', { key, value: valor, onChange: (ev) => onChange(ev.target.value), style: { ...S().input, ...extra } }, opcoes.map(([v, t]) => e('option', { key: v, value: v }, t)));
  const botao = (texto, onClick, tipo = 'sec', { key, ...extra } = {}) =>
    e('button', { key, type: 'button', className: tipo === 'prim' ? 'btn-primary' : tipo === 'perigo' ? 'btn-outline btn-outline-danger' : 'btn-outline', style: { ...(tipo === 'prim' ? S().btnPrim : S().btnSec), ...(tipo === 'perigo' ? { color: 'var(--error)' } : {}), ...extra }, onClick, disabled: extra.disabled }, texto);
  /** Rodapé de uma seção: situação à esquerda (erro, salvo ou dica) e o botão Salvar à direita. */
  const rodape = (salvar, salvando, erro, ok, texto = 'Salvar', nota = '') =>
    e('div', { className: 'admin-rodape-conteudo' }, [
      erro ? e('span', { key: 'e', className: 'admin-erro' }, erro) : ok ? e('span', { key: 'o', className: 'admin-ok' }, 'Salvo.') : e('span', { key: 'n', className: 'admin-dica' }, nota),
      botao(salvando ? 'Salvando…' : texto, salvar, 'prim', { key: 'b', opacity: salvando ? 0.7 : 1, disabled: salvando }),
    ]);
  /** Bloco de configuração (cartão): título, explicação curta, conteúdo e rodapé opcional com a ação. */
  const secao = (chave, titulo, descricao, filhos, pe = null, acao = null) =>
    e('section', { key: chave, className: 'admin-secao' }, [
      titulo ? e('div', { key: 'c', className: 'admin-secao-cab' }, [
        e('div', { key: 't' }, [e('h3', { key: 'h' }, titulo), descricao ? e('p', { key: 'p' }, descricao) : null]),
        acao,
      ]) : null,
      e('div', { key: 'b', className: 'admin-secao-corpo' }, filhos),
      pe ? e('div', { key: 'r', className: 'admin-secao-rodape' }, pe) : null,
    ]);
  /** Campo com rótulo, controle e dica embaixo. */
  const campo = (chave, titulo, controle, ajuda) => e('div', { key: chave, className: 'admin-campo' }, [rotulo(titulo), controle, ajuda ? dica(ajuda) : null]);
  /** Número em destaque (cartão pequeno). */
  const kpi = (chave, titulo, valor, detalhe, tom) =>
    e('div', { key: chave, className: 'admin-kpi' + (tom ? ' ' + tom : '') }, [e('div', { key: 'r', className: 'admin-kpi-rotulo' }, titulo), e('div', { key: 'v', className: 'admin-kpi-valor' }, valor), detalhe ? e('div', { key: 'd', className: 'admin-kpi-detalhe' }, detalhe) : null]);
  const selo = (texto, tom = '') => e('span', { className: 'admin-selo ' + tom }, texto);
  const progresso = (feito, total) => e('div', { className: 'admin-progresso', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total || 0, 'aria-valuenow': feito || 0 }, e('div', { style: { width: `${total ? Math.min(100, (feito / total) * 100) : 0}%` } }));
  const mensagem = (erro, info) => (erro ? e('div', { key: 'msg-e', className: 'admin-aviso erro' }, erro) : info ? e('div', { key: 'msg-i', className: 'admin-aviso ok' }, info) : null);
  const iniciais = (nome) => String(nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

  /** Estado comum das abas que salvam uma seção. */
  function useSalvar(fn) {
    const [erro, setErro] = useState(null);
    const [ok, setOk] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const salvar = async () => {
      setErro(null);
      setOk(false);
      setSalvando(true);
      try {
        await fn();
        setOk(true);
      } catch (err) {
        setErro(err.message);
      }
      setSalvando(false);
    };
    return { erro, ok, salvando, salvar };
  }

  // ---------- aba: Cofre ----------
  const DESC_SESSAO = {
    dia: 'Até o fim do dia (padrão): depois de destravar, o F5 e as outras abas não pedem a senha; vira o dia, pede de novo.',
    horas: 'Por um número de horas depois de destravar.',
    aba: 'Só nesta aba: o F5 não pede a senha, mas trava sozinho em 15 minutos parado ou ao fechar a aba.',
    pedir: 'Pedir a senha mestra toda vez que o Hub for aberto (o mais seguro).',
  };

  function AbaCofre({ config, aoSalvar }) {
    const [c, setC] = useState(() => copia(config.cofre));
    const { erro, ok, salvando, salvar } = useSalvar(async () => {
      const novo = await api('PUT', '/api/admin/config/cofre', { ...c, horas: Number(c.horas) });
      setC(novo);
      aoSalvar({ ...config, cofre: novo });
      if (hub().recarregarPolitica) await hub().recarregarPolitica(); // vale já neste navegador
    });
    return e('div', { className: 'admin-pilha' }, [
      secao('m', 'Senha mestra', 'Logins, senhas e o token do GLPI de cada pessoa ficam só no navegador dela. Aqui você decide se eles ficam cifrados.', [
        e('div', { key: 'o', className: 'admin-opcoes' }, [
          opcao('cofre-modo', c.modo === 'ativo', () => setC({ ...c, modo: 'ativo' }), 'Ativa (recomendado)', 'Os acessos ficam cifrados neste navegador com uma senha mestra.'),
          opcao('cofre-modo', c.modo === 'desativado', () => setC({ ...c, modo: 'desativado' }), 'Desativada', 'Ninguém precisa de senha mestra e os acessos novos voltam a ficar em texto puro no navegador (menos seguro).'),
        ]),
        dica('A mudança vale para navegadores que ainda não criaram o cofre. Quem já tem cofre continua usando a senha mestra.'),
      ]),
      secao('s', 'Tempo liberado', 'Quanto tempo o cofre fica aberto depois de destravar.', [
        e('div', { key: 'l', className: 'admin-linha-campos' }, [
          campo('se', 'Sessão', selecao(c.sessao, (v) => setC({ ...c, sessao: v }), [['dia', 'Até o fim do dia'], ['horas', 'Por horas'], ['aba', 'Só nesta aba'], ['pedir', 'Pedir a senha toda vez']]), DESC_SESSAO[c.sessao]),
          c.sessao === 'horas' ? campo('h', 'Horas (1 a 72)', e('input', { className: 'field-input admin-horas', type: 'number', min: 1, max: 72, value: c.horas, onChange: (ev) => setC({ ...c, horas: ev.target.value }), style: S().input })) : null,
        ]),
        e('div', { key: 'av', className: 'admin-aviso' }, 'Com a sessão guardada (dia, horas), quem tiver acesso ao perfil deste navegador dentro do prazo consegue abrir o cofre. "Travar agora" ou limpar os dados do navegador encerram a sessão na hora.'),
      ], rodape(salvar, salvando, erro, ok, 'Salvar', 'Vale para as duas seções desta página.')),
    ]);
  }

  // ---------- aba: Administradores ----------
  function AbaAdmins() {
    const [admins, setAdmins] = useState(null);
    const [eu, setEu] = useState(null);
    const [usuarios, setUsuarios] = useState(null);
    const [busca, setBusca] = useState('');
    const [escolhido, setEscolhido] = useState('');
    const [login, setLogin] = useState('');
    const [erro, setErro] = useState(null);
    const [info, setInfo] = useState(null);

    const carregar = async () => {
      try {
        const [lista, quem] = await Promise.all([api('GET', '/api/admin/admins'), api('GET', '/api/admin/eu')]);
        setAdmins(lista);
        setEu(quem.usuario);
      } catch (err) {
        setErro(err.message);
      }
    };
    useEffect(() => {
      carregar();
      // lista de pessoas do GLPI (a mesma do "Abrir chamado") para escolher o novo administrador
      fetch('/api/glpi/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userToken: tokenAtual() }) })
        .then((r) => r.json())
        .then((d) => setUsuarios(Array.isArray(d.users) ? d.users : []))
        .catch(() => setUsuarios([]));
    }, []);

    async function adicionar(corpo) {
      setErro(null);
      setInfo(null);
      try {
        await api('POST', '/api/admin/admins', corpo);
        setInfo('Administrador adicionado.');
        setEscolhido('');
        setLogin('');
        await carregar();
      } catch (err) {
        setErro(err.message);
      }
    }
    async function remover(a) {
      setErro(null);
      setInfo(null);
      try {
        await api('DELETE', `/api/admin/admins/${a.id}`);
        setInfo('Administrador removido.');
        await carregar();
      } catch (err) {
        setErro(err.message);
      }
    }

    const filtrados = (usuarios || []).filter((u) => !busca || u.label.toLowerCase().includes(busca.toLowerCase())).slice(0, 60);
    return e('div', { className: 'admin-pilha' }, [
      mensagem(erro, info),
      secao('l', 'Administradores', eu ? `Você entrou como ${eu.nome || eu.login}${eu.login ? ` (login ${eu.login})` : ''}.` : null,
        !admins ? [dica('Carregando…')] : [e('div', { key: 'lista', className: 'admin-lista' }, admins.map((a) =>
          e('div', { key: a.id, className: 'admin-item' }, [
            e('span', { key: 'av', className: 'admin-avatar', 'aria-hidden': true }, iniciais(a.nome || a.login)),
            e('div', { key: 'n', className: 'admin-item-texto' }, [
              e('strong', { key: 'a' }, a.nome || a.login || `GLPI ${a.glpiId}`),
              e('span', { key: 'b' }, [a.login ? `login ${a.login}` : null, a.glpiId ? `id ${a.glpiId}` : 'ainda não confirmado pelo GLPI', a.criadoPor ? `adicionado por ${a.criadoPor}` : null].filter(Boolean).join(' · ')),
            ]),
            botao('Remover', () => remover(a), 'perigo', { key: 'r', padding: '5px 10px' }),
          ])))]),
      secao('novo', 'Adicionar administrador', 'Escolha uma pessoa do GLPI ou informe o login de quem não aparece na lista.', [
        e('div', { key: 'busca', className: 'admin-linha-campos' }, [
          campo('b', 'Buscar pessoa', e('input', { className: 'field-input admin-busca', value: busca, onChange: (ev) => setBusca(ev.target.value), placeholder: usuarios ? 'Nome da pessoa no GLPI' : 'Carregando as pessoas do GLPI…', style: S().input })),
          campo('p', 'Pessoa', selecao(escolhido, setEscolhido, [['', filtrados.length ? 'Escolha a pessoa' : 'Nenhuma pessoa encontrada'], ...filtrados.map((u) => [String(u.id), u.label])])),
        ]),
        botao('Adicionar a pessoa escolhida', () => {
          const u = (usuarios || []).find((x) => String(x.id) === escolhido);
          if (u) adicionar({ glpiId: u.id, nome: u.label });
        }, 'prim', { key: 'ad', alignSelf: 'flex-start', disabled: !escolhido, opacity: escolhido ? 1 : 0.6 }),
        e('div', { key: 'sep', className: 'admin-separador' }, 'ou'),
        campo('lg', 'Login do GLPI', e('div', { className: 'admin-linha-acao' }, [
          e('input', { key: 'i', className: 'field-input admin-login', value: login, onChange: (ev) => setLogin(ev.target.value), placeholder: 'login do GLPI', style: { ...S().input, flex: 1 } }),
          botao('Adicionar pelo login', () => login.trim() && adicionar({ login: login.trim() }), 'sec', { key: 'b' }),
        ])),
      ]),
    ]);
  }

  // ---------- aba: Automações (quem gerencia, como o endereço aparece, cadastro e ordem) ----------
  function AbaAutomacoes({ config, aoSalvar }) {
    const [c, setC] = useState(() => copia(config.automacoes));
    const acesso = useSalvar(async () => {
      const novo = await api('PUT', '/api/admin/config/automacoes', c);
      setC(novo);
      aoSalvar({ ...config, automacoes: novo });
      window.dispatchEvent(new CustomEvent('arx-config-automacoes', { detail: novo })); // o painel muda na hora
    });
    return e('div', { className: 'admin-pilha' }, [
      secao('acesso', 'Acesso e endereço', 'Quem gerencia as automações e o que os outros veem.', [
        campo('c', 'Quem pode cadastrar, editar e remover', e('div', { className: 'admin-opcoes' }, [
          opcao('auto-cadastro', c.cadastro === 'admins', () => setC({ ...c, cadastro: 'admins' }), 'Só administradores (recomendado)', 'Os outros só abrem as automações.'),
          opcao('auto-cadastro', c.cadastro === 'todos', () => setC({ ...c, cadastro: 'todos' }), 'Todo mundo', 'Qualquer pessoa no Hub cadastra, edita, remove e vê o endereço real.'),
        ])),
        campo('en', 'Endereço para quem não gerencia', selecao(c.endereco, (v) => setC({ ...c, endereco: v }), [['mascarado', 'Mascarado (xxx.xxx.xxx.xxx:4016)'], ['oculto', 'Oculto (não aparece)']], { maxWidth: 360 }),
          'As telas sempre abrem pelo proxy do Hub: o navegador nunca recebe o endereço real de quem não gerencia.'),
        caixa(c.novaAba, (v) => setC({ ...c, novaAba: v }), 'Quem não gerencia pode abrir a automação em nova aba (pelo proxy, sem o endereço real)', { key: 'na' }),
        campo('mc', 'Nome na barra de abas', e('input', { className: 'field-input', value: c.marca || '', maxLength: 30, onChange: (ev) => setC({ ...c, marca: ev.target.value }), placeholder: 'Ex.: ARX Aut', style: { ...S().input, maxWidth: 360 } }),
          'Aparece no começo da barra de abas do Hub. Vazio deixa a barra sem nome.'),
      ], rodape(acesso.salvar, acesso.salvando, acesso.erro, acesso.ok)),
      e(ListaAutomacoes, { key: 'lista' }),
    ]);
  }

  /** Escolha dos grupos do GLPI que veem uma automação (nenhum marcado = todos veem). */
  // ---------- aba: Extensões (extensões de navegador que o Hub oferece para baixar) ----------
  /**
   * Qual GLPI o Hub e o chamados-glpi usam: produção ou o GLPI de teste desta máquina. O App-Token nunca volta do
   * servidor: o campo vazio mantém o guardado. "Testar conexão" entra com o token do GLPI do seu cofre.
   */
  // Webhooks do GLPI em uso: o túnel sem conta muda de endereço quando reinicia, e o GLPI passa a avisar o endereço velho
  function SecaoWebhook() {
    const [w, setW] = useState({ carregando: true });
    async function ler(aplicar) {
      setW((x) => ({ ...x, carregando: true, erro: '' }));
      try {
        setW(await api('POST', '/api/admin/glpi/webhook', { aplicar }));
      } catch (err) {
        setW({ erro: err.message });
      }
    }
    useEffect(() => { ler(false); }, []);
    const lista = w.webhooks || [];
    const errados = lista.filter((x) => !x.certo);
    const pronto = !w.carregando && !w.erro;
    return secao('webhook', 'Atualização em tempo real (webhook)', 'O GLPI avisa os Chamados quando um chamado muda. Vale o GLPI em uso.', [
      w.carregando ? e('div', { key: 'c' }, dica('Lendo os webhooks do GLPI…')) : null,
      w.erro ? e('div', { key: 'er', role: 'alert', className: 'admin-erro' }, w.erro) : null,
      pronto ? campo('end', 'Endereço do receptor', e('code', { key: 'v', style: { fontSize: 12, wordBreak: 'break-all' } }, w.esperado || 'Sem endereço: o túnel do webhook não respondeu'), w.ambiente === 'teste' ? 'GLPI de teste: entrega direto, sem túnel.' : 'Muda quando o container do túnel reinicia.') : null,
      pronto && lista.length ? e('ul', { key: 'l', style: { margin: 0, paddingLeft: 18, fontSize: 13 } }, lista.map((x) => e('li', { key: x.id }, `${x.nome || 'Webhook ' + x.id}: ${x.certo ? 'apontando para o endereço certo' : 'apontando para outro endereço'}${x.ativo ? '' : ' (desativado)'}`))) : null,
      pronto && !lista.length ? e('div', { key: 'n' }, dica('Nenhum webhook do GLPI aponta para os Chamados. Crie em Configurar > Webhooks (POST, cabeçalho X-Webhook-Token).')) : null,
      pronto && errados.length && w.esperado ? e('div', { key: 'b', className: 'admin-linha', style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } }, [
        botao(errados.length === 1 ? 'Apontar o webhook para o endereço atual' : `Apontar os ${errados.length} webhooks para o endereço atual`, () => ler(true), 'prim', { key: 'a' }),
        e('span', { key: 'd' }, dica('Grava só a URL do webhook no GLPI, com o token do GLPI do seu cofre.')),
      ]) : null,
    ]);
  }

  function AbaGlpi({ config, aoSalvar }) {
    const [g, setG] = useState(() => copia(config.glpi));
    const [teste, setTeste] = useState({});
    const salvar = useSalvar(async () => {
      const novo = await api('PUT', '/api/admin/config/glpi', g);
      setG(novo);
      aoSalvar({ ...config, glpi: novo });
      window.dispatchEvent(new Event('arx-config-glpi')); // o selo "GLPI de teste" da barra muda na hora
    });
    const mudar = (amb, k, v) => setG((x) => ({ ...x, [amb]: { ...x[amb], [k]: v } }));
    async function testar(amb) {
      setTeste((t) => ({ ...t, [amb]: { carregando: true } }));
      try {
        const r = await api('POST', '/api/admin/glpi/testar', { ambiente: amb });
        setTeste((t) => ({ ...t, [amb]: r.ok ? { ok: `Conectou como ${r.usuario}.` } : { erro: r.erro } }));
      } catch (err) {
        setTeste((t) => ({ ...t, [amb]: { erro: err.message } }));
      }
    }
    const entrada = (amb, k, rotulo, nota, extra = {}) => campo(k, rotulo, e('input', { className: 'field-input', value: g[amb][k] == null ? '' : g[amb][k], onChange: (ev) => mudar(amb, k, ev.target.value), style: S().input, ...extra }), nota);
    const ambiente = (amb, titulo, descricao) => secao(amb, titulo, descricao, [
      entrada(amb, 'url', 'Endereço da API', 'Termina em /api.php/v1.', { placeholder: 'https://suporte.exemplo.com.br/api.php/v1', id: `glpi-${amb}-url` }),
      entrada(amb, 'site', 'Endereço do site (links dos chamados)', 'Vazio = a raiz do endereço da API.', { placeholder: 'https://suporte.exemplo.com.br' }),
      entrada(amb, 'appToken', 'App-Token', g[amb].appTokenDefinido ? 'Já está guardado. Deixe vazio para manter; digite só para trocar.' : 'Configuração > Geral > API > Cliente da API, no GLPI.', { type: 'password', autoComplete: 'off', placeholder: g[amb].appTokenDefinido ? 'Guardado' : 'Não informado' }),
      e('div', { key: 'ent', className: 'admin-linha-campos' }, [
        entrada(amb, 'entidades', 'Entidades lidas pelos chamados', 'Nomes ou IDs, separados por vírgula.', { placeholder: 'Sistemas' }),
        entrada(amb, 'entidadeId', 'ID da entidade padrão', 'Onde o Hub abre chamado e a entidade de reserva dos chamados.', { inputMode: 'numeric', placeholder: 'Não informado' }),
      ]),
      e('div', { key: 'testar', className: 'admin-linha', style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } }, [
        botao(teste[amb] && teste[amb].carregando ? 'Testando…' : 'Testar conexão', () => testar(amb), 'sec', { key: 'b', disabled: !!(teste[amb] && teste[amb].carregando) }),
        teste[amb] && teste[amb].ok ? e('span', { key: 'ok', role: 'status', style: { color: 'var(--success, #16a34a)', fontSize: 13 } }, teste[amb].ok) : null,
        teste[amb] && teste[amb].erro ? e('span', { key: 'er', role: 'alert', className: 'admin-erro' }, teste[amb].erro) : null,
        dica('Usa o token do GLPI do seu cofre; o de produção não entra no GLPI de teste. Salve antes de testar.'),
      ]),
    ]);
    return e('div', { className: 'admin-pilha' }, [
      secao('em-uso', 'GLPI em uso', 'Vale para o Hub (abrir chamado, Conversas, administradores) e para os Chamados. Troca na hora, sem reiniciar nada.', [
        campo('amb', 'Ambiente', selecao(g.ambiente, (v) => setG((x) => ({ ...x, ambiente: v })), [['producao', 'Produção'], ['teste', 'Teste (GLPI desta máquina)']]),
          g.ambiente === 'teste' ? 'Com o teste ligado, cada pessoa precisa do token do GLPI de teste no cofre. A barra do Hub mostra "GLPI de teste".' : 'Os chamados reais.'),
        g.ambiente === 'teste' ? e('div', { key: 'av', className: 'admin-aviso alerta' }, 'Nada do GLPI de produção aparece com o teste ligado: Chamados, Conversas e o botão do GLPI passam a usar o de teste.') : null,
      ]),
      ambiente('producao', 'Produção', 'O GLPI de verdade.'),
      ambiente('teste', 'Teste', 'GLPI de teste nesta máquina (pasta glpi-teste do ARX Automações). A pasta guarda o App-Token e os tokens dos usuários de teste no .env.'),
      e(SecaoWebhook, { key: 'webhook-' + (config.glpi && config.glpi.ambiente) }),
      e('div', { key: 'salvar', className: 'admin-barra-salvar' }, rodape(salvar.salvar, salvar.salvando, salvar.erro, salvar.ok, 'Salvar GLPI', 'Salva as três seções desta página.')),
    ]);
  }

  function AbaExtensoes({ config, opcoes, aoSalvar }) {
    const [c, setC] = useState(() => copia(config.extensoes));
    const lista = (opcoes && opcoes.extensoes) || [];
    const salvar = useSalvar(async () => {
      const novo = await api('PUT', '/api/admin/config/extensoes', c);
      setC(novo);
      aoSalvar({ ...config, extensoes: novo });
      window.dispatchEvent(new CustomEvent('arx-config-extensoes', { detail: novo })); // o botão do Hub muda na hora
    });
    const alternar = (id, disponivel) => setC({ ...c, ocultas: disponivel ? c.ocultas.filter((x) => x !== id) : [...c.ocultas, id] });
    return e('div', { className: 'admin-pilha' }, [
      secao('ext', 'Extensões para baixar', 'Ficam no botão "Extensões" da barra de endereço do Hub, com o passo a passo de instalação.', [
        caixa(c.mostrar, (v) => setC({ ...c, mostrar: v }), 'Mostrar o botão "Extensões" para todo mundo', { key: 'mostrar' }),
        !lista.length ? dica('Nenhuma extensão na pasta extensoes do Hub.') : e('div', { key: 'l', className: 'admin-chaves' }, lista.map((x) =>
          caixa(!c.ocultas.includes(x.id), (v) => alternar(x.id, v), [e('strong', { key: 'n' }, x.nome + (x.versao ? ' ' + x.versao : '')), e('span', { key: 'd', className: 'admin-dica', style: { display: 'block' } }, x.descricao || 'Sem descrição')], { key: x.id }))),
      ], rodape(salvar.salvar, salvar.salvando, salvar.erro, salvar.ok)),
    ]);
  }

  function EditorGrupos({ automacao, grupos, aoSalvar }) {
    const [marcados, setMarcados] = useState(() => new Set(automacao.grupos || []));
    const [busca, setBusca] = useState('');
    const { erro, salvando, salvar } = useSalvar(async () => {
      const r = await api('PUT', `/api/admin/automations/${automacao.id}/grupos`, { grupos: [...marcados] });
      aoSalvar(r.grupos);
    });
    if (!grupos) return dica('Carregando os grupos do GLPI…');
    if (!grupos.length) return dica('Não consegui ler os grupos do GLPI com o seu token.');
    const termo = busca.trim().toLowerCase();
    const visiveis = grupos.filter((g) => !termo || g.label.toLowerCase().includes(termo));
    const alternar = (id) => setMarcados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    return e('div', { className: 'admin-editor-grupos' }, [
      e('input', { key: 'b', className: 'field-input', value: busca, onChange: (ev) => setBusca(ev.target.value), placeholder: 'Buscar grupo', style: S().input }),
      e('div', { key: 'l', className: 'admin-grupos-lista' },
        visiveis.map((g) => e('label', { key: g.id, className: 'admin-marcar' }, [e('input', { key: 'c', type: 'checkbox', checked: marcados.has(g.id), onChange: () => alternar(g.id) }), e('span', { key: 't' }, g.label)]))),
      e('div', { key: 'r', className: 'admin-rodape-conteudo' }, [
        erro ? e('span', { key: 'e', className: 'admin-erro' }, erro) : dica(marcados.size ? `${marcados.size === 1 ? '1 grupo marcado' : marcados.size + ' grupos marcados'}: só eles (e os administradores) veem.` : 'Nenhum grupo marcado: todos veem.'),
        botao(salvando ? 'Salvando…' : 'Salvar grupos', salvar, 'prim', { key: 's', disabled: salvando, opacity: salvando ? 0.7 : 1 }),
      ]),
    ]);
  }

  /** Cadastro (pelo formulário do painel, app.js) e ordem das automações. */
  function ListaAutomacoes() {
    const [lista, setLista] = useState(null);
    const [urls, setUrls] = useState({});
    const { erro, ok, salvando, salvar } = useSalvar(async () => {
      await api('PUT', '/api/admin/automations/ordem', { ids: lista.map((a) => a.id) });
    });
    const [gruposGlpi, setGruposGlpi] = useState(null); // [{ id, label }] do GLPI, para dar nome aos ids
    const [editando, setEditando] = useState(null); // id da automação com o editor de grupos aberto
    useEffect(() => {
      api('GET', '/api/automations').then(setLista).catch(() => setLista([]));
      api('GET', '/api/admin/grupos-glpi').then(setGruposGlpi).catch(() => setGruposGlpi([]));
      // o painel avisa a cada mudança (cadastro, edição, remoção, status): a lista acompanha
      // mantém a ordem ainda não salva: as que já estavam ficam onde estão, as novas entram no fim
      const aoMudar = (ev) => setLista((atual) => {
        const novos = new Map(ev.detail.map((a) => [String(a.id), a]));
        if (!atual) return ev.detail;
        const ficam = atual.filter((a) => novos.has(String(a.id))).map((a) => novos.get(String(a.id)));
        return [...ficam, ...ev.detail.filter((a) => !ficam.some((f) => String(f.id) === String(a.id)))];
      });
      window.addEventListener('arx-automacoes', aoMudar);
      return () => window.removeEventListener('arx-automacoes', aoMudar);
    }, []);
    const quantas = lista ? lista.length : 0;
    useEffect(() => {
      api('GET', '/api/admin/automations/urls').then(setUrls).catch(() => setUrls({}));
    }, [quantas]);
    const painel = () => window.ArxHubAutomacoes || {};
    const mover = (i, d) => setLista((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const n = l.slice();
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
    const enderecoDe = (a) => (urls[a.id] || '').replace(/^https?:\/\//, '') || a.endereco;
    const nomeGrupo = (id) => ((gruposGlpi || []).find((g) => g.id === id) || { label: `Grupo ${id}` }).label;
    const quemVe = (a) => ((a.grupos || []).length ? 'Grupos: ' + a.grupos.map(nomeGrupo).join(', ') : 'Todos veem');
    return secao('lista', 'Automações cadastradas', 'Editar e Remover usam o mesmo formulário do painel. Em Grupos, escolha quem vê cada automação (nenhum grupo = todos veem). As setas mudam a posição para todos depois de salvar.', [
      e('div', { key: 'l', className: 'admin-lista' }, !lista ? [dica('Carregando…')] : lista.map((a, i) =>
        e('div', { key: a.id, className: 'admin-automacao admin-item-bloco' }, [
          e('div', { key: 'linha', className: 'admin-item' }, [
            e('span', { key: 'p', className: 'admin-posicao' }, i + 1),
            e('div', { key: 'n', className: 'admin-item-texto' }, [
              e('strong', { key: 't' }, a.name),
              e('span', { key: 'u', className: 'admin-mono' }, enderecoDe(a)),
              e('span', { key: 'g', className: 'admin-grupos-resumo' }, quemVe(a)),
            ]),
            e('div', { key: 'acoes', className: 'admin-item-acoes' }, [
              botao('Grupos', () => setEditando(editando === a.id ? null : a.id), 'sec', { key: 'gr', padding: '4px 10px' }),
              botao('Editar', () => painel().editar && painel().editar(a.id), 'sec', { key: 'ed', padding: '4px 10px' }),
              botao('Remover', () => painel().remover && painel().remover(a.id), 'perigo', { key: 'rm', padding: '4px 10px' }),
              e('span', { key: 'ordem', className: 'admin-ordem' }, [
                e('button', { key: 'up', type: 'button', className: 'admin-seta', 'aria-label': `Subir ${a.name}`, disabled: i === 0, onClick: () => mover(i, -1) }, '↑'),
                e('button', { key: 'dn', type: 'button', className: 'admin-seta', 'aria-label': `Descer ${a.name}`, disabled: i === lista.length - 1, onClick: () => mover(i, 1) }, '↓'),
              ]),
            ]),
          ]),
          editando === a.id ? e(EditorGrupos, {
            key: 'ed',
            automacao: a,
            grupos: gruposGlpi,
            aoSalvar: (grupos) => {
              setLista((l) => l.map((x) => (x.id === a.id ? { ...x, grupos } : x)));
              setEditando(null);
            },
          }) : null,
        ]))),
    ], lista && lista.length ? rodape(salvar, salvando, erro, ok, 'Salvar ordem') : null,
    botao('Nova automação', () => painel().nova && painel().nova(), 'prim', { key: 'n', padding: '6px 12px' }));
  }

  // ---------- aba: WhatsApp ----------
  const NOTAS_MODO = {
    observacao: 'Observação (recomendado no início): o robô só lê e registra o que faria. Não abre chamado e não reage.',
    ativo: 'Ativo: o robô identifica quem pediu e o que pediu, abre o chamado no GLPI e reage na mensagem.',
  };
  const NOTAS_OPERACAO = {
    fila_automatico: 'Pela fila do Chamados automático: o pedido espera na fila e o navegador de quem está com o Chamados automático ligado abre o chamado (com o token dessa pessoa) e o automático executa. Se ninguém pegar o pedido em 1 minuto e houver token de serviço no servidor, o servidor abre o chamado; sem token de serviço, o pedido espera um navegador.',
    so_abrir: 'Só abrir o chamado, 24 horas: o servidor abre o chamado com o token de um usuário de serviço do GLPI. A execução continua pelo Chamados (manual ou automático). Exige HUB_GLPI_TOKEN_SERVICO no servidor.',
  };

  function AbaWhatsapp({ config, opcoes, aoSalvar }) {
    const [w, setW] = useState(() => {
      const x = copia(config.whatsapp);
      x.remetentesTexto = (x.remetentesAutorizados || []).join('\n');
      return x;
    });
    const { erro, ok, salvando, salvar } = useSalvar(async () => {
      const corpo = { ...w, remetentesAutorizados: w.remetentesTexto.split(/[\n,;]+/).map((t) => t.trim()).filter(Boolean) };
      delete corpo.remetentesTexto;
      const novo = await api('PUT', '/api/admin/config/whatsapp', corpo);
      setW({ ...novo, remetentesTexto: novo.remetentesAutorizados.join('\n') });
      aoSalvar({ ...config, whatsapp: novo });
      window.dispatchEvent(new Event('arx-config-conversas')); // a aba Conversas aparece ou some sem recarregar
    });
    const mudar = (fn) => setW((x) => fn(copia(x)));
    const tipos = (opcoes && opcoes.tipos) || [];
    const [categorias, setCategorias] = useState([]);
    const { painel } = usePainelWhatsapp(0);
    const gruposVisiveis = (painel && painel.estado && painel.estado.grupos) || [];
    useEffect(() => {
      fetch('/api/glpi/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userToken: tokenAtual() }) })
        .then((r) => r.json()).then((d) => setCategorias(Array.isArray(d.categories) ? d.categories : [])).catch(() => setCategorias([]));
      api('GET', '/api/admin/grupos-glpi').then((g) => setGruposGlpi(Array.isArray(g) ? g : [])).catch(() => setGruposGlpi([]));
    }, []);
    const [gruposGlpi, setGruposGlpi] = useState(null);
    const [buscaGrupo, setBuscaGrupo] = useState('');
    const campoTexto = (valor, onChange, placeholder, extra = {}) => e('input', { className: 'field-input', value: valor || '', onChange: (ev) => onChange(ev.target.value), placeholder, style: { ...S().input, ...extra } });

    const chips = (lista, aoAlternar, classe) => e('div', { className: 'admin-chips' }, tipos.map((t) => {
      const sel = lista.includes(t.chave);
      return e('button', { key: t.chave, type: 'button', className: classe, 'aria-pressed': sel, style: S().chip(sel), onClick: () => aoAlternar(t.chave, sel) }, t.nome);
    }));
    return e('div', { className: 'admin-pilha' }, [
      e('div', { key: 'aviso', className: 'admin-aviso info' },
        'Fluxo: o robô lê a mensagem no grupo, identifica quem pediu (pelo telefone vinculado a um usuário do GLPI) e o tipo de solicitação, abre o chamado e reage na mensagem: a fazer, em andamento, concluído ou erro. A conexão do chip fica em "Conexão e pedidos".'),
      secao('geral', 'Funcionamento', 'Liga o robô e define como o chamado é aberto.', [
        caixa(w.ativo, (v) => mudar((x) => ((x.ativo = v), x)), 'Automação do WhatsApp ligada', { key: 'at', fontWeight: 600 }),
        e('div', { key: 'l', className: 'admin-linha-campos' }, [
          campo('m', 'Modo de funcionamento', selecao(w.modo, (v) => mudar((x) => ((x.modo = v), x)), (opcoes.modosWhatsapp || ['observacao', 'ativo']).map((m) => [m, { observacao: 'Observação', ativo: 'Ativo' }[m] || m])), NOTAS_MODO[w.modo] || ''),
          campo('o', 'Como o chamado é aberto', selecao(w.operacao, (v) => mudar((x) => ((x.operacao = v), x)), [['fila_automatico', 'Pela fila do Chamados automático'], ['so_abrir', 'Só abrir o chamado, 24 horas (token de serviço)']]), NOTAS_OPERACAO[w.operacao] || ''),
        ]),
        w.operacao === 'so_abrir' && painel && painel.disponivel && painel.disponivel.so_abrir === false ? e('div', { key: 'av', className: 'admin-aviso alerta' }, 'O token de serviço do GLPI não está configurado no servidor: os pedidos vão dar erro até configurar.') : null,
        dica('Totalmente automático no servidor (abrir e executar sem ninguém com o navegador aberto) ainda não está disponível: exigiria guardar logins do SGA e do PowerCRM no servidor.'),
        campo('r', 'Resposta no grupo quando o chamado for solucionado', campoTexto(w.respostaModelo, (v) => mudar((x) => ((x.respostaModelo = v), x)), 'Chamado {chamado} concluído.'), 'Use {chamado}, {solicitante} e {tipo}. Só responde nos grupos com "Responder no grupo" ligado.'),
      ]),
      secao('numeros', 'Números (chips)', 'Os números do WhatsApp que o robô usa.', [
        e('div', { key: 'l', className: 'admin-lista' }, w.numeros.length ? w.numeros.map((n, i) =>
          e('div', { key: n.id, className: 'wa-numero admin-grade-numero' }, [
            campoTexto(n.rotulo, (v) => mudar((x) => ((x.numeros[i].rotulo = v), x)), 'Nome (ex.: Chip dedicado)'),
            campoTexto(n.telefone, (v) => mudar((x) => ((x.numeros[i].telefone = v), x)), 'Telefone com DDI e DDD (pode ficar vazio)'),
            caixa(n.ativo !== false, (v) => mudar((x) => ((x.numeros[i].ativo = v), x)), 'Ativo', { key: 'a' }),
            botao('Remover', () => mudar((x) => ((x.numeros = x.numeros.filter((_, j) => j !== i)), x.grupos.forEach((g) => { if (g.numeroId === n.id) g.numeroId = ''; }), x)), 'perigo', { key: 'r', padding: '5px 10px' }),
          ])) : [dica('Nenhum número cadastrado.')]),
        botao('+ Adicionar número', () => mudar((x) => (x.numeros.push({ id: proximoId('n', x.numeros), rotulo: '', telefone: '', ativo: true }), x)), 'sec', { key: 'add', alignSelf: 'flex-start' }),
      ]),
      e('datalist', { key: 'dl', id: 'wa-grupos-visiveis' }, gruposVisiveis.map((gv) => e('option', { key: gv.jid, value: gv.nome }))),
      secao('grupos', 'Grupos atendidos', 'Para cada grupo: qual número responde, a categoria do chamado e os tipos de solicitação que o robô pode tratar.', [
        ...(w.grupos.length ? w.grupos.map((g, i) =>
          e('div', { key: g.id, className: 'wa-grupo admin-subcartao' }, [
            e('div', { key: 'a', className: 'admin-linha-campos' }, [
              campo('n', 'Nome do grupo', e('input', { className: 'field-input', list: 'wa-grupos-visiveis', value: g.nome || '', placeholder: 'Como aparece no WhatsApp', style: S().input, onChange: (ev) => { const v = ev.target.value; mudar((x) => { x.grupos[i].nome = v; const achado = gruposVisiveis.find((gv) => gv.nome === v); if (achado) x.grupos[i].jid = achado.jid; return x; }); } })),
              campo('j', 'Identificador (opcional)', campoTexto(g.jid, (v) => mudar((x) => ((x.grupos[i].jid = v), x)), 'termina em @g.us')),
            ]),
            e('div', { key: 'b', className: 'admin-linha-campos' }, [
              campo('nr', 'Número que responde', selecao(g.numeroId || '', (v) => mudar((x) => ((x.grupos[i].numeroId = v), x)), [['', 'Nenhum definido'], ...w.numeros.map((n) => [n.id, n.rotulo || n.id])])),
              campo('ct', 'Categoria do chamado no GLPI', selecao(g.categoriaId ? String(g.categoriaId) : '', (v) => mudar((x) => { const c = categorias.find((k) => String(k.id) === v); x.grupos[i].categoriaId = v ? Number(v) : null; x.grupos[i].categoriaLabel = c ? c.label : ''; return x; }),
                [['', 'Nenhuma (o chamado abre sem categoria)'], ...(g.categoriaId && !categorias.some((k) => k.id === g.categoriaId) ? [[String(g.categoriaId), g.categoriaLabel || String(g.categoriaId)]] : []), ...categorias.map((k) => [String(k.id), k.label])])),
            ]),
            e('div', { key: 'c', className: 'admin-chaves' }, [
              caixa(g.ativo !== false, (v) => mudar((x) => ((x.grupos[i].ativo = v), x)), 'Grupo ativo', { key: 'a' }),
              caixa(g.responder, (v) => mudar((x) => ((x.grupos[i].responder = v), x)), 'Responder no grupo', { key: 'r' }),
              caixa(g.reagir !== false, (v) => mudar((x) => ((x.grupos[i].reagir = v), x)), 'Reagir às mensagens', { key: 'g' }),
            ]),
            campo('t', 'Tipos de solicitação deste grupo', chips(g.tipos, (k, sel) => mudar((x) => ((x.grupos[i].tipos = sel ? x.grupos[i].tipos.filter((q) => q !== k) : [...x.grupos[i].tipos, k]), x)), 'wa-tipo')),
            botao('Remover grupo', () => mudar((x) => ((x.grupos = x.grupos.filter((_, j) => j !== i)), x)), 'perigo', { key: 'rm', alignSelf: 'flex-start', padding: '5px 10px' }),
          ])) : [dica('Nenhum grupo cadastrado.')]),
        botao('+ Adicionar grupo', () => mudar((x) => (x.grupos.push({ id: proximoId('g', x.grupos), nome: '', jid: '', categoriaId: null, categoriaLabel: '', numeroId: x.numeros[0] ? x.numeros[0].id : '', tipos: [], ativo: true, responder: false, reagir: true }), x)), 'sec', { key: 'add', alignSelf: 'flex-start' }),
      ]),
      secao('privado', 'Conversa privada com o robô', 'A pessoa manda o pedido direto para o número do chip. A primeira linha diz a categoria do GLPI, por exemplo "Categoria Ancore". Só atende quem tem vínculo.', [
        e('div', { key: 'a', className: 'admin-chaves wa-privado' }, [
          caixa(w.privado.ativo, (v) => mudar((x) => ((x.privado.ativo = v), x)), 'Atender no privado', { key: 'at', fontWeight: 600 }),
          caixa(w.privado.responder, (v) => mudar((x) => ((x.privado.responder = v), x)), 'Responder na conversa', { key: 'r' }),
          caixa(w.privado.reagir !== false, (v) => mudar((x) => ((x.privado.reagir = v), x)), 'Reagir às mensagens', { key: 'g' }),
          caixa(w.privado.explicarDuvida !== false, (v) => mudar((x) => ((x.privado.explicarDuvida = v), x)), 'Explicar na conversa quando faltar algo', { key: 'd' }),
        ]),
        campo('tipos', 'Tipos atendidos no privado (nenhum marcado = todos)', chips(w.privado.tipos, (k, sel) => mudar((x) => ((x.privado.tipos = sel ? x.privado.tipos.filter((q) => q !== k) : [...x.privado.tipos, k]), x)), 'wa-tipo wa-tipo-privado')),
        campo('cats', 'Categorias que a pessoa pode escrever (o nome pode vir sem espaço ou acento)', e('div', { className: 'admin-lista' }, w.privado.categorias.map((c, i) =>
          e('div', { key: i, className: 'wa-categoria admin-grade-categoria' }, [
            campoTexto(c.apelido, (v) => mudar((x) => ((x.privado.categorias[i].apelido = v), x)), 'Nome (ex.: Ancore)'),
            selecao(c.categoriaId ? String(c.categoriaId) : '', (v) => mudar((x) => { const k = categorias.find((q) => String(q.id) === v); x.privado.categorias[i].categoriaId = v ? Number(v) : null; x.privado.categorias[i].categoriaLabel = k ? k.label : ''; return x; }),
              [['', 'Escolha a categoria do GLPI'], ...(c.categoriaId && !categorias.some((q) => q.id === c.categoriaId) ? [[String(c.categoriaId), c.categoriaLabel || String(c.categoriaId)]] : []), ...categorias.map((q) => [String(q.id), q.label])]),
            botao('Remover', () => mudar((x) => ((x.privado.categorias = x.privado.categorias.filter((_, j) => j !== i)), x)), 'perigo', { key: 'r', padding: '5px 10px' }),
          ])))),
        botao('+ Adicionar categoria', () => mudar((x) => (x.privado.categorias.push({ apelido: '', categoriaId: null, categoriaLabel: '' }), x)), 'sec', { key: 'add', alignSelf: 'flex-start' }),
      ]),
      secao('conversas', 'Conversas e respostas', 'Liga a aba Conversas do Hub: o robô guarda as mensagens (com imagens e áudios) por 7 dias, e quem tem acesso marca mensagens e abre o chamado com elas, com sugestão da IA local. A IA também lê as mensagens anteriores da mesma pessoa.', [
        e('div', { key: 'a', className: 'admin-chaves' }, [
          caixa(w.conversas.ativo, (v) => mudar((x) => ((x.conversas.ativo = v), x)), 'Aba Conversas ligada (guarda as conversas)', { key: 'at', fontWeight: 600 }),
          caixa(w.conversas.privado, (v) => mudar((x) => ((x.conversas.privado = v), x)), 'Guardar também as conversas privadas com o chip', { key: 'pv' }),
        ]),
        campo('quem', 'Quem pode ver a aba Conversas', selecao(w.conversas.quem || 'admins', (v) => mudar((x) => ((x.conversas.quem = v), x)), [['admins', 'Só administradores'], ['grupos', 'Administradores e os grupos do GLPI marcados'], ['todos', 'Todos que entram com o token do GLPI']]),
          'Quem vê pode ler as mensagens das pessoas, responder na conversa e abrir chamado com o próprio token.'),
        w.conversas.quem === 'grupos' ? campo('gv', 'Grupos do GLPI que veem', gruposGlpi === null ? dica('Carregando os grupos do GLPI…') : !gruposGlpi.length ? dica('Não consegui ler os grupos do GLPI com o seu token.') : e('div', { className: 'admin-editor-grupos' }, [
          e('input', { key: 'b', className: 'field-input', value: buscaGrupo, onChange: (ev) => setBuscaGrupo(ev.target.value), placeholder: 'Buscar grupo', style: S().input }),
          e('div', { key: 'l', className: 'admin-grupos-lista' }, gruposGlpi.filter((g) => !buscaGrupo.trim() || g.label.toLowerCase().includes(buscaGrupo.trim().toLowerCase())).map((g) => {
            const sel = (w.conversas.grupos || []).includes(g.id);
            return e('label', { key: g.id, className: 'admin-marcar' }, [
              e('input', { key: 'c', type: 'checkbox', checked: sel, onChange: () => mudar((x) => ((x.conversas.grupos = sel ? x.conversas.grupos.filter((k) => k !== g.id) : [...(x.conversas.grupos || []), g.id]), x)) }),
              e('span', { key: 't' }, g.label),
            ]);
          })),
        ]), `${(w.conversas.grupos || []).length === 1 ? '1 grupo marcado' : `${(w.conversas.grupos || []).length} grupos marcados`}.`) : null,
        campo('g', 'Outros grupos para guardar (além dos grupos atendidos)', gruposVisiveis.length
          ? e('div', { className: 'admin-chips' }, gruposVisiveis.map((gv) => {
            const sel = w.conversas.jids.includes(gv.jid);
            return e('button', { key: gv.jid, type: 'button', className: 'wa-conversa', 'aria-pressed': sel, style: S().chip(sel), onClick: () => mudar((x) => ((x.conversas.jids = sel ? x.conversas.jids.filter((j) => j !== gv.jid) : [...x.conversas.jids, gv.jid]), x)) }, gv.nome || gv.jid);
          }))
          : dica('O robô ainda não informou os grupos (confira em Conexão e pedidos).')),
        campo('ab', 'Resposta ao abrir o chamado pelas Conversas', campoTexto(w.respostas.abertura, (v) => mudar((x) => ((x.respostas.abertura = v), x)), 'Recebemos seu pedido. Chamado {chamado} aberto.'), 'Use {chamado}, {solicitante} e {tipo}. Vale para os tipos sem resposta própria; pode ser editada antes de enviar.'),
        campo('pt', 'Resposta por tipo de solicitação (vazio = a de cima)', e('div', { className: 'admin-lista' }, tipos.map((t) =>
          e('div', { key: t.chave, className: 'wa-resposta-tipo', style: { display: 'grid', gridTemplateColumns: 'minmax(0, 200px) minmax(0, 1fr)', alignItems: 'center', gap: 12 } }, [
            e('div', { key: 'n', className: 'admin-dica' }, t.nome),
            campoTexto((w.respostas.porTipo || {})[t.chave] || '', (v) => mudar((x) => ((x.respostas.porTipo = { ...(x.respostas.porTipo || {}), [t.chave]: v }), x)), w.respostas.abertura),
          ])))),
      ]),
      secao('rem', 'Quem pode pedir e reações', null, [
        campo('t', 'Telefones autorizados', e('textarea', { className: 'field-input wa-remetentes', value: w.remetentesTexto, onChange: (ev) => mudar((x) => ((x.remetentesTexto = ev.target.value), x)), rows: 3, placeholder: 'Um telefone por linha, com DDI e DDD', style: { ...S().input, resize: 'vertical' } }), 'Vazio = qualquer pessoa dos grupos acima.'),
        campo('r', 'Reações usadas nas mensagens', e('div', { className: 'admin-grade-reacoes' }, [['aFazer', 'A fazer'], ['andamento', 'Em andamento'], ['sucesso', 'Deu certo'], ['erro', 'Deu erro'], ['duvida', 'Faltou dado']].map(([k, t]) =>
          e('div', { key: k }, [e('div', { key: 'd', className: 'admin-dica' }, t), campoTexto(w.reacoes[k], (v) => mudar((x) => ((x.reacoes[k] = v), x)), '', { textAlign: 'center' })])))),
      ]),
      e('div', { key: 'salvar', className: 'admin-barra-salvar' }, rodape(salvar, salvando, erro, ok, 'Salvar WhatsApp', 'Salva todas as seções desta página.')),
    ]);
  }

  // ---------- abas: vínculos, conexão e pedidos do WhatsApp ----------
  const NOMES_STATUS = { pendente: 'Na fila', abrindo: 'Abrindo o chamado', aberto: 'Chamado aberto', concluido: 'Concluído', erro: 'Erro', sem_vinculo: 'Sem vínculo', sem_categoria: 'Sem categoria', observado: 'Só observado' };
  const COR_STATUS = { pendente: 'var(--warn)', abrindo: 'var(--accent)', aberto: 'var(--accent)', concluido: 'var(--success, #16a34a)', erro: 'var(--error)', sem_vinculo: 'var(--warn)', sem_categoria: 'var(--warn)', observado: 'var(--muted)' };
  const dataHora = (s) => (s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Não informado');

  /** Carrega o painel do WhatsApp (vínculos, pedidos recentes, estado do robô) e se atualiza sozinho de tempos em tempos. */
  function usePainelWhatsapp(intervaloMs) {
    const [painel, setPainel] = useState(null);
    const [erro, setErro] = useState(null);
    const carregar = async () => {
      try {
        setPainel(await api('GET', '/api/admin/whatsapp/painel'));
        setErro(null);
      } catch (err) {
        setErro(err.message);
      }
    };
    useEffect(() => {
      carregar();
      if (!intervaloMs) return undefined;
      const t = setInterval(carregar, intervaloMs);
      return () => clearInterval(t);
    }, []);
    return { painel, erro, recarregar: carregar };
  }

  function AbaVinculos() {
    const { painel, erro: erroPainel, recarregar } = usePainelWhatsapp(0);
    const [usuarios, setUsuarios] = useState([]);
    const [telefone, setTelefone] = useState('');
    const [escolhido, setEscolhido] = useState('');
    const [erro, setErro] = useState(null);
    const [info, setInfo] = useState(null);
    useEffect(() => {
      fetch('/api/glpi/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userToken: tokenAtual() }) })
        .then((r) => r.json()).then((d) => setUsuarios(Array.isArray(d.users) ? d.users : [])).catch(() => setUsuarios([]));
    }, []);
    async function adicionar() {
      setErro(null);
      setInfo(null);
      const u = usuarios.find((x) => String(x.id) === escolhido);
      try {
        await api('POST', '/api/admin/whatsapp/vinculos', { telefone, glpiId: escolhido, nome: u ? u.label : '' });
        setTelefone('');
        setEscolhido('');
        setInfo('Vínculo salvo.');
        await recarregar();
      } catch (err) {
        setErro(err.message);
      }
    }
    async function remover(v) {
      setErro(null);
      setInfo(null);
      try {
        await api('DELETE', `/api/admin/whatsapp/vinculos/${v.telefone}`);
        setInfo('Vínculo removido.');
        await recarregar();
      } catch (err) {
        setErro(err.message);
      }
    }
    return e('div', { className: 'admin-pilha' }, [
      mensagem(erro || erroPainel, info),
      secao('novo', 'Novo vínculo', 'Cada telefone que pede no grupo precisa estar ligado a um usuário do GLPI: é ele que vai como requerente do chamado. Telefone sem vínculo recebe só a reação de dúvida.', [e('div', { key: 'f', className: 'admin-grade-vinculo' }, [
        e('input', { key: 't', className: 'field-input wa-vinculo-telefone', value: telefone, onChange: (ev) => setTelefone(ev.target.value), placeholder: 'Telefone com DDD', style: S().input }),
        selecao(escolhido, setEscolhido, [['', 'Escolha o usuário do GLPI'], ...usuarios.map((u) => [String(u.id), u.label])]),
        botao('Salvar vínculo', adicionar, 'prim', { key: 'b', padding: '8px 14px' }),
      ])]),
      secao('lista', 'Vínculos', painel ? `${painel.vinculos.length === 1 ? '1 telefone vinculado' : painel.vinculos.length + ' telefones vinculados'}.` : null,
        [!painel ? dica('Carregando…') : painel.vinculos.length === 0 ? dica('Nenhum vínculo ainda.') : e('div', { key: 'lista', className: 'admin-lista' }, painel.vinculos.map((v) =>
          e('div', { key: v.telefone, className: 'admin-item' }, [
            e('span', { key: 'av', className: 'admin-avatar', 'aria-hidden': true }, iniciais(v.nome)),
            e('div', { key: 'n', className: 'admin-item-texto' }, [
              e('strong', { key: 'a' }, v.nome || 'Não informado'),
              e('span', { key: 'b' }, `${v.telefone} · usuário ${v.glpiId} no GLPI`),
            ]),
            botao('Remover', () => remover(v), 'perigo', { key: 'r', padding: '5px 10px' }),
          ])))]),
    ]);
  }

  function AbaConexao() {
    const { painel, erro, recarregar } = usePainelWhatsapp(8000);
    // troca de número em dois cliques: "Desconectar este número" e depois "Sim, desconectar"
    const [troca, setTroca] = useState({ confirmar: false, enviando: false, erro: '' });
    async function desconectar() {
      setTroca({ confirmar: true, enviando: true, erro: '' });
      try {
        await api('POST', '/api/admin/whatsapp/desconectar');
        setTroca({ confirmar: false, enviando: false, erro: '' });
        recarregar();
      } catch (err) {
        setTroca({ confirmar: true, enviando: false, erro: err.message });
      }
    }
    if (erro && !painel) return mensagem(erro);
    if (!painel) return dica('Carregando…');
    const est = painel.estado;
    const semSinal = !est.atualizadoEm || Date.now() - new Date(est.atualizadoEm).getTime() > 120000;
    const situacao = !est.botConfigurado ? 'O robô ainda não está configurado neste Hub (falta o segredo WHATSAPP_BOT_TOKEN).'
      : semSinal ? 'O robô do WhatsApp não está enviando sinal.'
        : est.conectado ? `Conectado${est.numero ? ` ao número ${est.numero}` : ''}.`
          : 'Desconectado: leia o QR code abaixo com o WhatsApp do chip dedicado (Aparelhos conectados).';
    const cor = est.botConfigurado && !semSinal && est.conectado ? 'var(--success, #16a34a)' : 'var(--warn)';
    return e('div', { className: 'admin-pilha' }, [
      secao('situacao', 'Situação do robô', null, [
      e('div', { key: 'sit', className: 'wa-situacao', style: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 } }, [
        e('span', { key: 'p', style: { width: 9, height: 9, borderRadius: '50%', background: cor, flexShrink: 0 } }),
        e('span', { key: 't', style: { flex: 1 } }, situacao),
        botao('Atualizar', recarregar, 'sec', { key: 'b', padding: '5px 10px' }),
      ]),
      est.botConfigurado && !semSinal && est.conectado ? e('div', { key: 'troca', className: 'wa-trocar-numero', style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13 } }, troca.confirmar ? [
        e('span', { key: 't', style: { flex: 1, minWidth: 220 } }, `Desconectar${est.numero ? ` o número ${est.numero}` : ''}? O robô para de ler os grupos até alguém ler o QR code novo. As conversas guardadas continuam até vencer o prazo.`),
        botao('Cancelar', () => setTroca({ confirmar: false, enviando: false, erro: '' }), 'sec', { key: 'c', padding: '5px 10px' }),
        botao(troca.enviando ? 'Desconectando…' : 'Sim, desconectar', desconectar, 'perigo', { key: 's', padding: '5px 10px', disabled: troca.enviando }),
        troca.erro ? e('span', { key: 'e', className: 'admin-erro', role: 'alert', style: { flexBasis: '100%' } }, troca.erro) : null,
      ] : [
        e('span', { key: 't', style: { flex: 1, color: 'var(--muted)' } }, 'Para trocar o número do robô, desconecte este e leia o QR code novo com o outro chip.'),
        botao('Desconectar este número', () => setTroca({ confirmar: true, enviando: false, erro: '' }), 'perigo', { key: 'b', padding: '5px 10px' }),
      ]) : null,
      est.qr && !est.conectado && !semSinal ? e('img', { key: 'qr', className: 'wa-qr', src: est.qr, alt: 'QR code para conectar o WhatsApp', style: { width: 240, height: 240, background: '#fff', padding: 8, borderRadius: 10, border: '1px solid var(--border)', alignSelf: 'flex-start' } }) : null,
      painel.disponivel && painel.disponivel.so_abrir === false ? dica('O modo "só abrir o chamado" precisa do token de um usuário de serviço do GLPI no servidor (HUB_GLPI_TOKEN_SERVICO). Hoje não está configurado.') : null,
      ]),
      secao('legenda', 'O que cada reação significa', null, [
      e('div', { key: 'legenda', className: 'wa-legenda', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 6, fontSize: 12.5 } }, [
        ['aFazer', 'Na fila: espera alguém abrir o chamado.'],
        ['andamento', 'Chamado aberto, em andamento.'],
        ['sucesso', 'Chamado solucionado.'],
        ['erro', 'Deu erro: o motivo aparece em Pedidos recentes.'],
        ['duvida', 'Faltou algo: o vínculo do telefone (grupo) ou a categoria (privado). O motivo aparece em Mensagens recebidas.'],
      ].map(([k, t]) => e('div', { key: k, style: { display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)' } }, [
        e('span', { key: 'e', style: { fontSize: 16, lineHeight: 1.2 } }, (painel.reacoes && painel.reacoes[k]) || ''),
        e('span', { key: 't', style: { color: 'var(--muted)' } }, t),
      ]))),
      ]),
      secao('msgs', 'Mensagens recebidas', 'As últimas 100, inclusive as ignoradas, com o que a IA local achou de cada uma.', [
      !painel.mensagens || painel.mensagens.length === 0 ? dica('Nenhuma mensagem chegou ao Hub desde a última vez que ele reiniciou.') : e('div', { key: 'msgs', className: 'wa-mensagens', style: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' } }, painel.mensagens.map((m, i) =>
        e('div', { key: i, className: 'wa-mensagem', style: { padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 3 } }, [
          e('div', { key: 'a', style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } }, [
            e('span', { key: 's', style: { display: 'inline-flex', padding: '2px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 600, color: COR_STATUS[m.resultado] || 'var(--muted)', border: '1px solid currentColor' } }, m.resultado === 'ignorado' ? 'Ignorada' : (NOMES_STATUS[m.resultado] || m.resultado)),
            e('span', { key: 'g', style: { fontWeight: 600 } }, m.onde),
            e('span', { key: 'q', style: { color: 'var(--muted)' } }, `${m.remetente} · ${dataHora(m.quando)}`),
          ]),
          e('div', { key: 't', style: { color: 'var(--muted)' } }, m.trecho),
          m.motivo ? e('div', { key: 'm' }, m.motivo) : null,
          // o que a IA local achou e a resposta que ela daria (mostrada sempre, mesmo no modo só reagir)
          m.ia ? e('div', { key: 'ia', className: 'wa-ia', style: { borderTop: '1px dashed var(--border)', paddingTop: 4, color: 'var(--muted)' } }, [
            e('div', { key: 'c' }, `IA: ${m.ia.tipo === 'sem_automacao' ? 'não é pedido de automação' : m.ia.tipo} (${Math.round((Number(m.ia.confianca) || 0) * 100)}%)${m.ia.tipoRegra ? `; regra: ${m.ia.tipoRegra}` : '; a regra não reconheceu'}${m.ia.motivo ? `. ${m.ia.motivo}` : ''}`),
            m.ia.resposta ? e('div', { key: 'r', style: { color: 'var(--text)' } }, `Resposta da IA: ${m.ia.resposta}`) : null,
          ]) : null,
        ]))),
      ]),
      secao('ped', 'Pedidos recentes', null, [
      painel.pedidos.length === 0 ? dica('Nenhum pedido ainda.') : e('div', { key: 'ped', style: { display: 'flex', flexDirection: 'column', gap: 6 } }, painel.pedidos.map((p) =>
        e('div', { key: p.id, className: 'wa-pedido', style: { padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 3 } }, [
          e('div', { key: 'a', style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } }, [
            e('span', { key: 's', style: { display: 'inline-flex', padding: '2px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 600, color: COR_STATUS[p.status] || 'var(--muted)', border: '1px solid currentColor' } }, NOMES_STATUS[p.status] || p.status),
            e('span', { key: 'g', style: { fontWeight: 600 } }, p.grupo || 'Não informado'),
            e('span', { key: 'q', style: { color: 'var(--muted)' } }, `${p.solicitante || 'Sem vínculo'} · ${dataHora(p.criadoEm)}`),
            p.ticketId ? e('span', { key: 't', style: { color: 'var(--muted)' } }, `Chamado ${p.ticketId}`) : null,
          ]),
          e('div', { key: 'x', style: { color: 'var(--muted)' } }, p.texto),
          p.erro ? e('div', { key: 'r', style: { color: 'var(--error)' } }, p.erro) : null,
        ]))),
      ]),
    ]);
  }

  // ---------- tela ----------
  // ---------- aba: Histórico (quem mudou o quê pela administração e pelo cadastro de automações) ----------
  const ACOES_HISTORICO = {
    'ia.ligar': 'Ligou a IA local',
    'ia.desligar': 'Desligou a IA local',
    'ia.exportar': 'Exportou os chamados para a IA',
    'ia.treinar': 'Treinou a IA',
    'ia.revisao.iniciar': 'Começou a revisão da IA',
    'ia.revisao.parar': 'Parou a revisão da IA',
    'config.alterar': 'Alterou a configuração',
    'admin.adicionar': 'Adicionou administrador',
    'admin.remover': 'Removeu administrador',
    'automacao.criar': 'Cadastrou automação',
    'automacao.editar': 'Editou automação',
    'automacao.remover': 'Removeu automação',
    'automacao.ordem': 'Mudou a ordem das automações',
    'automacao.grupos': 'Mudou os grupos que veem a automação',
  };
  const SECOES_HISTORICO = { cofre: 'Cofre', automacoes: 'Automações', whatsapp: 'WhatsApp', ia: 'IA local' };
  const curto = (v) => {
    const t = v === undefined || v === null || v === '' ? 'Não informado' : typeof v === 'string' ? v : JSON.stringify(v);
    return t.length > 120 ? t.slice(0, 117) + '...' : t;
  };
  /** Campos que mudaram entre antes e depois (um nível; o que for objeto aparece como JSON curto). */
  function diferencas(antes, depois) {
    const a = antes && typeof antes === 'object' ? antes : {};
    const d = depois && typeof depois === 'object' ? depois : {};
    return [...new Set([...Object.keys(a), ...Object.keys(d)])]
      .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(d[k]))
      .map((k) => ({ campo: k, antes: antes ? curto(a[k]) : null, depois: depois ? curto(d[k]) : null }));
  }

  function AbaHistorico() {
    const [itens, setItens] = useState(null);
    const [fim, setFim] = useState(false);
    const [erro, setErro] = useState(null);
    const carregar = async (antesDe) => {
      setErro(null);
      try {
        const lote = await api('GET', '/api/admin/historico?limite=50' + (antesDe ? '&antesDe=' + antesDe : ''));
        setItens((x) => (antesDe ? [...(x || []), ...lote] : lote));
        setFim(lote.length < 50);
      } catch (err) {
        setErro(err.message);
      }
    };
    useEffect(() => { carregar(); }, []);
    const quando = (q) => new Date(q).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    return e('div', { className: 'admin-pilha' }, [
      mensagem(erro),
      secao('h', 'Alterações', 'Quem fez, quando e o que estava antes e depois. As mais recentes primeiro.', [
        !itens ? dica('Carregando…') : !itens.length ? dica('Sem alterações registradas.') : e('ol', { key: 'l', className: 'admin-linha-tempo' }, itens.map((h) =>
          e('li', { key: h.id, className: 'admin-historico' }, [
            e('div', { key: 'c', className: 'admin-historico-cab' }, [
              e('strong', { key: 'p' }, h.quem || 'Sem identificação'),
              e('span', { key: 'a' }, ACOES_HISTORICO[h.acao] || h.acao),
              h.alvo ? selo(SECOES_HISTORICO[h.alvo] || h.alvo) : null,
              e('time', { key: 'q', className: 'admin-historico-quando', dateTime: h.quando }, quando(h.quando)),
            ]),
            ...diferencas(h.antes, h.depois).slice(0, 12).map((d) =>
              e('div', { key: d.campo, className: 'admin-mono admin-historico-dif' },
                d.campo + ': ' + (d.antes === null ? '' : d.antes + ' → ') + (d.depois === null ? 'removido' : d.depois))),
          ]))),
        itens && itens.length && !fim ? botao('Carregar mais', () => carregar(itens[itens.length - 1].id), 'sec', { key: 'mais', alignSelf: 'flex-start' }) : null,
      ]),
    ]);
  }

  // ---------- aba: IA local (ligar/desligar de verdade, exportar e treinar, como ela age) ----------
  const ETAPAS_TREINO = { vetores: 'calculando os vetores dos chamados', avaliacao: 'medindo o acerto (validação cruzada)', gravando: 'gravando o modelo', pronto: 'pronto', erro: 'erro' };
  const pctTxt = (x) => (x === null || x === undefined ? 'Sem dados' : `${String(x).replace('.', ',')}%`);

  function AbaIa({ config, opcoes, aoSalvar }) {
    const [estado, setEstado] = useState(null);
    const [erroEstado, setErroEstado] = useState(null);
    const [ocupado, setOcupado] = useState('');
    const [msg, setMsg] = useState(null);
    const [c, setC] = useState(() => copia(config.ia));
    const atualizar = async () => {
      try {
        setEstado(await api('GET', '/api/admin/ia/estado'));
        setErroEstado(null);
      } catch (err) {
        setErroEstado(err.message);
      }
    };
    const andamento = estado && ((estado.exportacao && estado.exportacao.rodando) || (estado.ia && estado.ia.treino && estado.ia.treino.rodando));
    useEffect(() => {
      atualizar();
      const t = setInterval(atualizar, andamento ? 3000 : 15000);
      return () => clearInterval(t);
    }, [andamento]);
    const acao = (nome, caminho, texto) => async () => {
      setOcupado(nome);
      setMsg(null);
      try {
        await api('POST', caminho);
        setMsg({ ok: true, texto });
      } catch (err) {
        setMsg({ ok: false, texto: err.message });
      }
      setOcupado('');
      atualizar();
    };
    const { erro, ok, salvando, salvar } = useSalvar(async () => {
      const novo = await api('PUT', '/api/admin/config/ia', { ...c, ligada: estado && estado.config ? estado.config.ligada : c.ligada, confiancaMinima: Number(String(c.confiancaMinima).replace(',', '.')), maxTentativas: Number(c.maxTentativas) });
      setC(novo);
      aoSalvar({ ...config, ia: novo });
    });

    // ligada = containers no ar E a chave da configuração (é ela que o chamados-glpi obedece); containers de pé por um
    // deploy com a chave desligada aparecem como desligada, com o botão "Ligar IA"
    const ligada = !!(estado && estado.controle && estado.controle.ligada) && !(estado && estado.config && estado.config.ligada === false);
    const ia = estado && estado.ia;
    const exp = estado && estado.exportacao;
    const treino = ia && ia.treino;
    const tipos = (opcoes && opcoes.tipos) || [];

    const met = ia && ia.metricas;
    const rev = ia && ia.revisao;
    return e('div', { className: 'admin-pilha' }, [
      erroEstado ? mensagem(erroEstado) : null,
      estado && !estado.configurada ? e('div', { key: 'nc', className: 'admin-aviso alerta' }, 'IA não configurada no servidor (rode scripts/gerar-segredo-ia.sh e suba ia-local, ia-controle, chamados-glpi e hub).') : null,
      e('div', { key: 'kpis', className: 'admin-kpis' }, !estado ? [dica('Carregando…')] : [
        kpi('s', 'Situação', ligada ? 'Ligada' : 'Desligada', ligada ? 'containers rodando' : 'containers parados', ligada ? 'ok' : 'apagado'),
        kpi('m', 'Modelo treinado', ia && ia.treinado ? `${ia.exemplos.toLocaleString('pt-BR')}` : 'Sem dados', ia && ia.treinado ? `chamados, em ${new Date(ia.treinadoEm).toLocaleDateString('pt-BR')}` : ia ? 'ainda não treinado' : 'IA desligada'),
        kpi('a', 'Acerto (validação cruzada)', met ? pctTxt(met.acertoIa) : 'Sem dados', met ? `regras de hoje ${pctTxt(met.acertoRegras)}` : null),
        kpi('r', 'Acerto no resultado real', met && met.confirmados ? pctTxt(met.confirmados.acertoIa) : 'Sem dados', met && met.confirmados ? `${met.confirmados.total} chamados que rodaram` : null),
        kpi('h', 'Acerto no gabarito humano', met && met.humanos ? pctTxt(met.humanos.acertoIa) : 'Sem dados', met && met.humanos ? `${met.humanos.total} decididos por pessoas` : 'decida em Revisão da IA'),
        rev ? kpi('v', 'Revisão de todos', rev.total ? `${Math.floor((rev.feito / rev.total) * 100)}%` : 'Sem dados', rev.total ? `${rev.feito.toLocaleString('pt-BR')} de ${rev.total.toLocaleString('pt-BR')}, ${rev.divergencias} divergências` : 'não iniciada') : null,
      ]),
      secao('est', 'Situação', 'IA local, grátis e sem internet: roda nesta rede, num container isolado, e nenhum dado sai para outra empresa. Desligada, os containers param e tudo segue só pelas regras de hoje.', !estado ? [dica('Carregando…')] : [
        e('dl', { key: 'd', className: 'admin-detalhes' }, [
          ...((estado.controle && estado.controle.containers) || []).map((x) => [e('dt', { key: 't' + x.nome }, 'Container ' + x.nome), e('dd', { key: 'd' + x.nome }, x.estado === 'running' ? selo('rodando', 'ok') : x.estado === 'nao_criado' ? selo('não criado', 'alerta') : selo('parado'))]).flat(),
          estado.controle && estado.controle.erro ? [e('dt', { key: 'ct' }, 'Controle'), e('dd', { key: 'cd' }, 'fora do ar: ' + estado.controle.erro)] : null,
          ia && ia.modelos ? [e('dt', { key: 'mt' }, 'Modelos'), e('dd', { key: 'md' }, `${ia.modelos.texto} (dia a dia), ${ia.modelos.revisao || ia.modelos.texto} (revisão) e ${ia.modelos.embed} (vetores)`)] : null,
          exp && exp.etapa && exp.etapa !== 'pronto' && exp.rodando !== undefined ? [e('dt', { key: 'et' }, 'Exportação'), e('dd', { key: 'ed' }, exp.rodando ? `${exp.etapa}${exp.total ? ` (${exp.feito} de ${exp.total})` : ''}` : exp.erro ? 'Erro: ' + exp.erro : exp.etapa)] : null,
          exp && exp.resumo ? [e('dt', { key: 'ut' }, 'Última exportação'), e('dd', { key: 'ud' }, `${exp.resumo.chamados} chamados (${exp.resumo.comHistorico} com resultado real de automação, ${exp.resumo.reabertos} reabertos)`)] : null,
          treino && treino.etapa ? [e('dt', { key: 'tt' }, 'Treino'), e('dd', { key: 'td' }, treino.rodando ? `${ETAPAS_TREINO[treino.etapa] || treino.etapa}${treino.total ? ` (${treino.feito} de ${treino.total})` : ''}` : treino.erro ? 'Erro: ' + treino.erro : ETAPAS_TREINO[treino.etapa] || treino.etapa)] : null,
        ].flat().filter(Boolean)),
        treino && treino.rodando && treino.total ? progresso(treino.feito, treino.total) : null,
        dica('A exportação lê, só para leitura, todos os chamados da entidade Sistemas com o seu token do GLPI (não fica guardado). CPF, telefone, e-mail, placa, chassi e senhas são mascarados antes de qualquer gravação.'),
        msg ? e('div', { key: 'm', className: 'admin-aviso ' + (msg.ok ? 'ok' : 'erro') }, msg.texto) : null,
      ], e('div', { className: 'admin-acoes' }, [
        ligada
          ? botao(ocupado === 'desligar' ? 'Desligando…' : 'Desligar IA', acao('desligar', '/api/admin/ia/desligar', 'IA desligada: containers parados.'), 'sec', { key: 'd', disabled: !!ocupado })
          : botao(ocupado === 'ligar' ? 'Ligando…' : 'Ligar IA', acao('ligar', '/api/admin/ia/ligar', 'IA ligada.'), 'prim', { key: 'l', disabled: !!ocupado }),
        botao(ocupado === 'exportar' ? 'Iniciando…' : 'Exportar do GLPI e treinar', acao('exportar', '/api/admin/ia/exportar', 'Exportação iniciada: o treino começa sozinho no fim.'), 'sec', { key: 'x', disabled: !ligada || !!ocupado || andamento }),
        botao(ocupado === 'treinar' ? 'Iniciando…' : 'Treinar de novo', acao('treinar', '/api/admin/ia/treinar', 'Treino iniciado.'), 'sec', { key: 't', disabled: !ligada || !!ocupado || andamento }),
        e('a', { key: 'au', href: '/ia-auditoria.html', target: '_blank', rel: 'noopener', className: 'btn-outline', style: { ...S().btnSec, textDecoration: 'none', marginLeft: 'auto' } }, 'Abrir auditoria'),
      ])),
      secao('cfg', 'Como a IA age', 'Cada chave liga uma ajuda da IA. Desligada ou fora do ar, tudo segue pelas regras de hoje.', [
        estado && !ligada ? e('div', { key: 'off', className: 'admin-aviso alerta', role: 'status' }, 'A IA está desligada: as opções abaixo ficam guardadas, mas só valem depois de clicar em "Ligar IA" acima. Até lá, os chamados usam o texto fixo e não leem as respostas pela IA.') : null,
        campo('ta', 'Tipos que rodam no automático com a validação da IA', e('div', { className: 'admin-grade-tipos' },
          tipos.map((t) => e('label', { key: t.chave, className: 'admin-marcar' }, [e('input', { key: 'c', type: 'checkbox', checked: c.automaticoTipos.includes(t.chave), onChange: (ev) => setC({ ...c, automaticoTipos: ev.target.checked ? [...c.automaticoTipos, t.chave] : c.automaticoTipos.filter((x) => x !== t.chave) }) }), e('span', { key: 't' }, t.nome)]))),
          'Nestes tipos, se a IA discordar da regra com confiança acima do mínimo, o chamado vai para o automático com o tipo que ela sugeriu. Nos outros, a sugestão aparece e o chamado fica manual.'),
        e('div', { key: 'nums', className: 'admin-linha-campos' }, [
          campo('cm', 'Confiança mínima (0,5 a 1)', e('input', { className: 'field-input', inputMode: 'decimal', value: String(c.confiancaMinima).replace('.', ','), onChange: (ev) => setC({ ...c, confiancaMinima: ev.target.value }), style: S().input })),
          c.repetirErros ? campo('mt', 'Tentativas automáticas (1 a 5)', e('input', { className: 'field-input', type: 'number', min: 1, max: 5, value: c.maxTentativas, onChange: (ev) => setC({ ...c, maxTentativas: ev.target.value }), style: S().input })) : null,
          campo('wm', 'WhatsApp', selecao(c.whatsappModo, (v) => setC({ ...c, whatsappModo: v }), [['reagir', 'Só reagir (a resposta da IA aparece nos pedidos)'], ['responder', 'Responder a mensagem com o texto da IA']])),
        ]),
        e('div', { key: 'chaves', className: 'admin-chaves' }, [
          caixa(c.repetirErros, (v) => setC({ ...c, repetirErros: v }), 'Quando uma automação der erro, a IA decide se dá para tentar de novo sozinho (falha momentânea) ou se precisa de alguém', { key: 're' }),
          caixa(c.textoPelaIa, (v) => setC({ ...c, textoPelaIa: v }), 'A IA escreve a resposta do chamado no lugar do texto fixo; se ela falhar ou perder o pedido de resposta, vai o texto fixo', { key: 'tx' }),
          c.textoPelaIa ? e('div', { key: 'txo', className: 'admin-subcartao', style: { display: 'grid', gap: 10, marginLeft: 24 } }, [
            e('div', { key: 's', className: 'admin-chaves' }, [
              caixa((c.textoSituacoes || []).includes('solucao'), (v) => setC({ ...c, textoSituacoes: v ? [...new Set([...(c.textoSituacoes || []), 'solucao'])] : (c.textoSituacoes || []).filter((x) => x !== 'solucao') }), 'Na solução (deu certo)', { key: 'sol' }),
              caixa((c.textoSituacoes || []).includes('devolutiva'), (v) => setC({ ...c, textoSituacoes: v ? [...new Set([...(c.textoSituacoes || []), 'devolutiva'])] : (c.textoSituacoes || []).filter((x) => x !== 'devolutiva') }), 'Na devolutiva de erro (pede a correção e deixa o chamado Pendente)', { key: 'dev' }),
            ]),
            campo('txt', 'Tipos em que a IA escreve (nenhum marcado = todos; tipos com senha nunca)', e('div', { className: 'admin-grade-tipos' },
              tipos.map((t) => e('label', { key: t.chave, className: 'admin-marcar' }, [e('input', { key: 'c', type: 'checkbox', checked: (c.textoTipos || []).includes(t.chave), onChange: (ev) => setC({ ...c, textoTipos: ev.target.checked ? [...(c.textoTipos || []), t.chave] : (c.textoTipos || []).filter((x) => x !== t.chave) }) }), e('span', { key: 't' }, t.nome)])))),
          ]) : null,
          caixa(c.pedirPendencias, (v) => setC({ ...c, pedirPendencias: v }), 'Pedir o que falta: no erro de exportação, sincronização de vistoria e cadastro de modelo sem placa, código do card ou código FIPE, a IA procura nos acompanhamentos e nos prints; se não achar, pede no chamado e deixa Pendente, sem atribuir', { key: 'pp' }),
          caixa(c.reabertos, (v) => setC({ ...c, reabertos: v }), 'Chamado reaberto com pedido de outra categoria: a IA encerra explicando que o chamado era de uma categoria e o novo pedido é de outra', { key: 'ra' }),
        ]),
      ], rodape(salvar, salvando, erro, ok)),
    ]);
  }

  // ---------- aba: Revisão da IA (a IA local lê todos os chamados; as divergências são decididas aqui) ----------
  function AbaRevisao() {
    const [estado, setEstado] = useState(null);
    const [pagina, setPagina] = useState(null); // { total, itens, tipos }
    const [i, setI] = useState(0);
    const [escolha, setEscolha] = useState('');
    const [erro, setErro] = useState(null);
    const [ocupado, setOcupado] = useState(false);
    const lerEstado = () => api('GET', '/api/admin/ia/revisao').then(setEstado).catch((err) => setErro(err.message));
    const lerPagina = () => api('GET', '/api/admin/ia/revisao/divergencias?limite=20').then((p) => { setPagina(p); setI(0); setEscolha(''); }).catch((err) => setErro(err.message));
    useEffect(() => {
      lerEstado();
      lerPagina();
      const t = setInterval(lerEstado, 10000);
      return () => clearInterval(t);
    }, []);
    const acao = (nome) => async () => {
      setErro(null);
      try { await api('POST', `/api/admin/ia/revisao/${nome}`); } catch (err) { setErro(err.message); }
      lerEstado();
    };
    const tipos = (pagina && pagina.tipos) || {};
    const nome = (t) => (t === 'sem_automacao' ? 'Sem automação' : tipos[t] || t);
    const item = pagina && pagina.itens[i];
    const decidir = async (tipo) => {
      if (!item || !tipo) return;
      setOcupado(true);
      setErro(null);
      try {
        await api('POST', '/api/admin/ia/revisao/decidir', { id: item.id, tipo });
        if (i + 1 < pagina.itens.length) { setI(i + 1); setEscolha(''); } else await lerPagina();
        lerEstado();
      } catch (err) {
        setErro(err.message);
      }
      setOcupado(false);
    };
    const pular = () => { if (pagina && i + 1 < pagina.itens.length) { setI(i + 1); setEscolha(''); } };
    const e2 = estado && !estado.indisponivel ? estado : null;
    const ritmo = e2 && e2.rodando && e2.iniciouEm ? (Date.now() - Date.parse(e2.iniciouEm)) / Math.max(1, e2.feito - (e2.feitoNoInicio || 0)) : null;
    const opinioes = item ? [['Regras de hoje', item.regra, null], ['Classificador (chamados parecidos)', item.classificador && item.classificador.tipo, item.classificador && item.classificador.confianca], ['IA lendo o chamado', item.llm && item.llm.tipo, item.llm && item.llm.confianca], ['Resultado real da automação', item.real, null]].filter((o) => o[1]) : [];
    const sugeridos = [...new Set(opinioes.map((o) => o[1]))];
    const restanteH = ritmo ? Math.ceil(((e2.total - e2.feito) * ritmo) / 3600000) : null;
    return e('div', { className: 'admin-pilha' }, [
      mensagem(erro),
      !estado ? dica('Carregando…') : estado.indisponivel ? e('div', { key: 'ind', className: 'admin-aviso alerta' }, 'IA desligada ou fora do ar: ligue na página IA local.') : e('div', { key: 'kpis', className: 'admin-kpis' }, [
        kpi('f', 'Revisados', e2.total ? `${Math.floor((e2.feito / e2.total) * 100)}%` : 'Sem dados', `${e2.feito.toLocaleString('pt-BR')} de ${(e2.total || 0).toLocaleString('pt-BR')}`),
        kpi('c', 'Consenso', e2.consenso.toLocaleString('pt-BR'), 'todas as opiniões iguais', 'ok'),
        kpi('d', 'Divergências', e2.divergencias.toLocaleString('pt-BR'), 'para uma pessoa decidir', e2.divergencias ? 'alerta' : ''),
        kpi('p', 'Decididos por pessoas', e2.decididasPorPessoas.toLocaleString('pt-BR'), 'viram gabarito no treino'),
      ]),
      e2 ? secao('and', 'Andamento', `A IA local lê todos os chamados exportados, um por um, com o modelo ${e2.modeloTexto || 'de texto'}, e compara quatro opiniões: as regras de hoje, os chamados mais parecidos, a leitura do chamado e o resultado real. Nada sai desta rede.`, [
        progresso(e2.feito, e2.total),
        e('div', { key: 's', className: 'admin-dica' }, e2.rodando
          ? (e2.parando ? 'Parando depois do chamado atual…' : `Revisando agora${restanteH ? `; cerca de ${restanteH === 1 ? '1 hora' : restanteH + ' horas'} para terminar` : ''}.`)
          : e2.erro ? 'Erro: ' + e2.erro : e2.terminouEm ? `Terminou em ${new Date(e2.terminouEm).toLocaleString('pt-BR')}.` : 'Parada.'),
        e2.falhas ? dica(`${e2.falhas === 1 ? '1 chamado ficou' : e2.falhas + ' chamados ficaram'} sem resposta do modelo e ${e2.falhas === 1 ? 'volta' : 'voltam'} na próxima retomada.`) : null,
      ], e('div', { className: 'admin-acoes' }, [
        e2.rodando ? botao('Parar', acao('parar'), 'sec', { key: 'p' }) : botao(e2.feito ? 'Continuar a revisão' : 'Começar a revisão', acao('iniciar'), 'prim', { key: 'i' }),
        botao('Atualizar divergências', lerPagina, 'sec', { key: 'a' }),
      ])) : null,
      secao('item', 'Decidir divergência', pagina && pagina.porGrupo && Object.keys(pagina.porGrupo).length ? null : 'Escolha o tipo certo de cada chamado. Cada decisão vira gabarito com peso máximo no próximo treino.', !pagina ? [dica('Carregando…')] : !item ? [e('div', { key: 'v', className: 'admin-vazio' }, pagina.total ? 'Fim desta página: atualize para ver mais.' : 'Nenhuma divergência esperando decisão.')] : [
        pagina.porGrupo ? e('div', { key: 'g', className: 'admin-chips' }, Object.entries(pagina.porGrupo).map(([g, n]) => e('span', { key: g, className: 'admin-selo' + (item.grupo === g ? ' ativo' : '') }, `${g}: ${n}`))) : null,
        e('div', { key: 'cab', className: 'admin-revisao-cab' }, [
          e('div', { key: 't' }, [
            e('div', { key: 'm', className: 'admin-dica' }, `Chamado ${item.id}${item.categoria ? ' · ' + item.categoria : ''}`),
            e('h4', { key: 'h' }, item.titulo || 'Sem título'),
          ]),
          e('span', { key: 'n', className: 'admin-contador' }, `${i + 1} de ${pagina.itens.length} · ${pagina.total} na fila`),
        ]),
        e('pre', { key: 'x', className: 'revisao-texto admin-texto-chamado' }, item.texto || 'Sem descrição'),
        e('div', { key: 'o', className: 'admin-opinioes' }, opinioes.map(([quem, tipo, conf]) =>
          e('div', { key: quem, className: 'admin-opiniao' }, [
            e('span', { key: 'q', className: 'admin-dica' }, quem),
            e('strong', { key: 't' }, nome(tipo)),
            conf !== null && conf !== undefined ? e('span', { key: 'c', className: 'admin-dica' }, `confiança ${Math.round(conf * 100)}%`) : null,
          ]))),
        item.llm && item.llm.motivo ? e('div', { key: 'm', className: 'admin-aviso info' }, 'Motivo da IA: ' + item.llm.motivo) : null,
      ], item ? e('div', { className: 'admin-acoes' }, [
        ...sugeridos.map((t) => botao(`É ${nome(t)}`, () => decidir(t), 'sec', { key: t, disabled: ocupado })),
        selecao(escolha, setEscolha, [['', 'Outro tipo…'], ['sem_automacao', 'Sem automação'], ...Object.entries(tipos).map(([k, v]) => [k, v])], { key: 'sel', maxWidth: 220, width: 'auto' }),
        botao('Salvar este', () => decidir(escolha), 'prim', { key: 'sv', disabled: !escolha || ocupado }),
        botao('Pular', pular, 'sec', { key: 'pl', disabled: ocupado, marginLeft: 'auto' }),
      ]) : null),
    ]);
  }

  // Menu agrupado por assunto (como as telas de configuração do GitHub e da Vercel); a descrição vira o subtítulo da página.
  const GRUPOS_ABAS = [
    ['Acesso', [
      ['cofre', 'Cofre', 'Lock', 'Senha mestra dos acessos e quanto tempo o cofre fica liberado.'],
      ['admins', 'Administradores', 'Users', 'Quem pode abrir esta administração.'],
      ['historico', 'Histórico', 'History', 'Tudo o que muda pela administração e pelo cadastro de automações.'],
    ]],
    ['Automações', [
      ['automacoes', 'Automações', 'Workflow', 'Quem gerencia, como o endereço aparece, quem vê cada automação e a ordem no painel.'],
      ['extensoes', 'Extensões', 'FileText', 'Extensões de navegador que o Hub oferece para baixar.'],
      ['glpi', 'GLPI', 'Server', 'Qual GLPI o Hub e os Chamados usam: produção ou o de teste desta máquina.'],
    ]],
    ['IA local', [
      ['ia', 'IA local', 'Bot', 'Ligar e desligar, treinar e escolher como a IA ajuda nos chamados.'],
      ['revisao', 'Revisão da IA', 'Eye', 'A IA local revisa todos os chamados; você decide as divergências.'],
    ]],
    ['WhatsApp', [
      ['whatsapp', 'Configuração', 'MessageCircle', 'Grupos, números, conversa privada e reações do robô do WhatsApp.'],
      ['vinculos', 'Vínculos', 'Headset', 'Telefones ligados a usuários do GLPI.'],
      ['conexao', 'Conexão e pedidos', 'Activity', 'Situação do robô, mensagens recebidas e pedidos recentes.'],
    ]],
  ];
  const ABAS = GRUPOS_ABAS.flatMap(([, abas]) => abas);
  const CHAVE_ABA = 'arxhub_admin_aba';

  function AdminView() {
    const [aba, setAbaEstado] = useState(() => {
      try {
        const salva = localStorage.getItem(CHAVE_ABA);
        return ABAS.some((a) => a[0] === salva) ? salva : 'cofre';
      } catch {
        return 'cofre'; // navegador sem armazenamento: começa no Cofre
      }
    });
    const setAba = (k) => {
      setAbaEstado(k);
      try { localStorage.setItem(CHAVE_ABA, k); } catch { /* só não lembra a aba na próxima visita */ }
    };
    const [dados, setDados] = useState(null); // { config, opcoes }
    const [erro, setErro] = useState(null);
    useEffect(() => {
      api('GET', '/api/admin/config').then(setDados).catch((err) => setErro(err.message));
    }, []);
    const atualizarConfig = (config) => setDados((d) => ({ ...d, config }));

    let corpo;
    if (erro) corpo = mensagem(erro);
    else if (!dados) corpo = dica('Carregando…');
    else if (aba === 'cofre') corpo = e(AbaCofre, { key: 'cofre', config: dados.config, aoSalvar: atualizarConfig });
    else if (aba === 'admins') corpo = e(AbaAdmins, { key: 'admins' });
    else if (aba === 'automacoes') corpo = e(AbaAutomacoes, { key: 'automacoes', config: dados.config, aoSalvar: atualizarConfig });
    else if (aba === 'glpi') corpo = e(AbaGlpi, { key: 'glpi', config: dados.config, aoSalvar: atualizarConfig });
    else if (aba === 'extensoes') corpo = e(AbaExtensoes, { key: 'extensoes', config: dados.config, opcoes: dados.opcoes, aoSalvar: atualizarConfig });
    else if (aba === 'historico') corpo = e(AbaHistorico, { key: 'historico' });
    else if (aba === 'revisao') corpo = e(AbaRevisao, { key: 'revisao' });
    else if (aba === 'ia') corpo = e(AbaIa, { key: 'ia', config: dados.config, opcoes: dados.opcoes, aoSalvar: atualizarConfig });
    else if (aba === 'vinculos') corpo = e(AbaVinculos, { key: 'vinculos' });
    else if (aba === 'conexao') corpo = e(AbaConexao, { key: 'conexao' });
    else corpo = e(AbaWhatsapp, { key: 'whatsapp', config: dados.config, opcoes: dados.opcoes, aoSalvar: atualizarConfig });

    const atual = ABAS.find((a) => a[0] === aba) || ABAS[0];
    return e('div', { className: 'admin-tela' }, [
      e('header', { key: 'cab', className: 'admin-cabecalho' }, [
        e('span', { key: 'i', className: 'glpi-head-icon' }, Icon('Settings', 16)),
        e('div', { key: 't' }, [e('h1', { key: 'h' }, 'Administração do Hub'), e('p', { key: 'p' }, 'Configurações que valem para todo mundo que usa o Hub.')]),
      ]),
      e('div', { key: 'grade', className: 'admin-grid' }, [
        e('nav', { key: 'nav', className: 'admin-nav', 'aria-label': 'Seções da administração' }, GRUPOS_ABAS.map(([grupo, abas]) =>
          e('div', { key: grupo, className: 'admin-nav-grupo' }, [
            e('div', { key: 'g', className: 'admin-nav-titulo' }, grupo),
            ...abas.map(([k, t, ic]) =>
              e('button', { key: k, type: 'button', className: `admin-nav-item admin-aba admin-aba-${k}` + (aba === k ? ' ativo' : ''), 'aria-current': aba === k ? 'page' : undefined, onClick: () => setAba(k) }, [Icon(ic, 16), e('span', { key: 't' }, t)])),
          ]))),
        e('main', { key: 'corpo', className: 'admin-corpo' }, [
          e('div', { key: 'pc', className: 'admin-pagina-cab' }, [e('h2', { key: 'h' }, atual[1]), e('p', { key: 'p' }, atual[3])]),
          e('div', { key: aba, className: 'admin-pagina' }, corpo),
        ]),
      ]),
    ]);
  }

  /** true quando o token do GLPI do cofre é de um administrador (o servidor confere). Usado também pelo app.js. */
  function useEhAdmin() {
    const [admin, setAdmin] = useState(false);
    const ultimo = useRef(null);
    useEffect(() => {
      let vivo = true;
      async function checar(token) {
        if (token === ultimo.current) return;
        ultimo.current = token;
        if (!token) return setAdmin(false);
        try {
          const resp = await fetch('/api/admin/eu', { headers: { 'X-Glpi-Token': token }, cache: 'no-store' });
          const d = await resp.json().catch(() => ({}));
          if (vivo) setAdmin(resp.ok && !!d.admin);
        } catch {
          if (vivo) setAdmin(false); // sem resposta: a aba simplesmente não aparece
        }
      }
      checar(tokenAtual());
      const parar = hub() ? hub().aoMudar((a) => checar((a && a.userToken) || '')) : () => {};
      return () => {
        vivo = false;
        parar();
      };
    }, []);
    return admin;
  }

  /** Aba do cabeçalho: só existe para administradores. */
  function AdminAba({ ativa, aoAbrir, compacto }) {
    if (!useEhAdmin()) return null;
    return e('button', {
      type: 'button',
      className: 'panel-tab admin-btn' + (ativa ? ' ativa' : '') + (compacto ? ' compact' : ''),
      onClick: aoAbrir,
      title: 'Administração do Hub',
      'aria-label': 'Administração',
      style: { display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', background: 'transparent', border: 'none', borderBottom: '2px solid ' + (ativa ? 'var(--accent)' : 'transparent'), color: ativa ? 'var(--text)' : 'var(--muted)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' },
    }, [Icon('Settings', 14), e('span', { key: 't', className: 'panel-tab-label' }, 'Administração')]);
  }

  window.useEhAdmin = useEhAdmin;
  window.AdminAba = AdminAba;
  window.AdminView = AdminView;
})();
