// Conversas do WhatsApp (aba fixa do Hub, só para administradores): as conversas que o robô guarda (grupos atendidos, grupos
// escolhidos e, se ligado, o privado). A pessoa marca mensagens, imagens e áudios e abre o chamado com elas (categoria,
// requerente e a resposta que vai para quem pediu), ou responde direto na conversa. Expõe window.ConversasView.
(function () {
  const e = React.createElement;
  const { useState, useEffect, useRef, useCallback } = React;

  const token = () => ((window.ArxAcessosHub && window.ArxAcessosHub.ler()) || {}).userToken || '';
  async function api(metodo, caminho, corpo) {
    const resp = await fetch(caminho, {
      method: metodo, cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Glpi-Token': token() },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const dados = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error((dados && dados.error) || `Falha (${resp.status}).`);
    return dados;
  }

  const hora = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dia = (ms) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const NOME_MIDIA = { imagem: 'Imagem', audio: 'Áudio', video: 'Vídeo', documento: 'Documento' };
  const nomeConversa = (c) => c.nome || (c.privado ? `Conversa privada${c.ultima && c.ultima.nome ? ` com ${c.ultima.nome}` : ''}` : 'Grupo sem nome');

  /** Baixa a mídia com o token no cabeçalho (a tag <img> não manda cabeçalho) e devolve um endereço local. */
  function useMidia(id, ativo) {
    const [url, setUrl] = useState(null);
    const [erro, setErro] = useState(false);
    useEffect(() => {
      if (!ativo) return undefined;
      let vivo = true;
      let local = null;
      fetch(`/api/whatsapp/midia/${encodeURIComponent(id)}`, { headers: { 'X-Glpi-Token': token() }, cache: 'no-store' })
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
        .then((b) => { if (vivo) { local = URL.createObjectURL(b); setUrl(local); } })
        .catch(() => { if (vivo) setErro(true); });
      return () => { vivo = false; if (local) URL.revokeObjectURL(local); };
    }, [id, ativo]);
    return { url, erro };
  }

  function Midia({ m }) {
    const { url, erro } = useMidia(m.id, !!(m.midia && m.midia.disponivel));
    if (!m.midia.disponivel || erro) return e('span', { className: 'cv-midia-falta' }, `${NOME_MIDIA[m.tipo] || 'Arquivo'} não guardado`);
    if (!url) return e('span', { className: 'cv-midia-falta' }, 'Carregando…');
    if (m.tipo === 'imagem') return e('a', { href: url, target: '_blank', rel: 'noopener', className: 'cv-imagem' }, e('img', { src: url, alt: m.texto || 'Imagem enviada' }));
    if (m.tipo === 'audio') return e('audio', { controls: true, src: url, preload: 'metadata' });
    if (m.tipo === 'video') return e('video', { controls: true, src: url, preload: 'metadata' });
    return e('a', { href: url, download: m.midia.nome || 'arquivo', className: 'btn pequeno' }, `Baixar ${m.midia.nome || 'documento'}`);
  }

  function Mensagem({ m, marcada, alternar }) {
    const id = 'cv-m-' + m.id;
    return e('div', { className: 'cv-msg' + (m.deMim ? ' minha' : '') + (marcada ? ' marcada' : '') }, [
      m.deMim ? null : e('input', { key: 'c', type: 'checkbox', id, checked: marcada, onChange: alternar, 'aria-label': 'Marcar mensagem' }),
      e('label', { key: 'b', className: 'cv-balao', htmlFor: m.deMim ? undefined : id }, [
        e('span', { key: 'q', className: 'cv-quem' }, [
          e('b', { key: 'n' }, m.deMim ? 'Robô' : (m.nome || m.remetente || 'Não informado')),
          m.vinculo ? e('span', { key: 'v', className: 'pill pos', title: 'Telefone vinculado a este usuário do GLPI' }, m.vinculo.nome) : null,
          e('span', { key: 'h', className: 'cv-hora' }, `${dia(m.quando)} ${hora(m.quando)}`),
        ]),
        m.midia ? e('div', { key: 'm', className: 'cv-midia' }, e(Midia, { m })) : null,
        m.texto ? e('p', { key: 't' }, m.texto) : null,
      ]),
    ]);
  }

  function JanelaChamado({ conversa, marcadas, lookup, opcoes, respostas, fechar, aoAbrir }) {
    const primeira = marcadas.find((m) => m.texto);
    const vinculo = (marcadas.find((m) => m.vinculo) || {}).vinculo;
    const [f, setF] = useState({
      titulo: primeira ? primeira.texto.split('\n')[0].slice(0, 120) : '',
      categoriaId: '', requerenteId: vinculo ? String(vinculo.glpiId) : '', tipo: '',
      resposta: respostas.abertura, enviar: true, respostaMexida: false,
    });
    const [estado, setEstado] = useState({ enviando: false, erro: '' });
    const mudar = (k, v) => setF((x) => {
      const n = { ...x, [k]: v };
      // trocar o tipo troca a resposta pelo texto daquele tipo, a não ser que a pessoa já tenha escrito a dela
      if (k === 'tipo' && !x.respostaMexida) n.resposta = (respostas.porTipo || {})[v] || respostas.abertura;
      if (k === 'resposta') n.respostaMexida = true;
      return n;
    });
    const requerente = (lookup.users || []).find((u) => String(u.id) === f.requerenteId);

    // Sugestão da IA local: título, tipo (inclusive "sem automação") e categoria (a do grupo ou a dos chamados parecidos).
    // Só preenche: a pessoa confere e abre. A categoria votada vem pelo nome e é achada na lista do GLPI quando ela chega.
    const [sugestao, setSugestao] = useState({ carregando: false, erro: '', dados: null });
    async function sugerir() {
      setSugestao({ carregando: true, erro: '', dados: null });
      try {
        const d = await api('POST', '/api/whatsapp/conversas/sugerir', { jid: conversa.jid, conversa: nomeConversa(conversa), ids: marcadas.map((m) => m.id) });
        setSugestao({ carregando: false, erro: '', dados: d });
        setF((x) => {
          const n = { ...x, titulo: d.titulo || x.titulo, tipo: d.tipo || '' };
          if (!x.respostaMexida) n.resposta = (respostas.porTipo || {})[n.tipo] || respostas.abertura;
          return n;
        });
      } catch (err) {
        setSugestao({ carregando: false, erro: err.message, dados: null });
      }
    }
    useEffect(() => {
      const c = sugestao.dados && sugestao.dados.categoria;
      if (!c || !lookup.categories) return;
      const sem = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
      const achada = c.id ? lookup.categories.find((k) => k.id === c.id) : lookup.categories.find((k) => sem(k.label) === sem(c.nome)) || lookup.categories.find((k) => sem(k.label).endsWith(sem(c.nome)));
      if (achada) setF((x) => ({ ...x, categoriaId: String(achada.id) }));
    }, [sugestao.dados, lookup.categories]);
    const notaSugestao = () => {
      const d = sugestao.dados;
      if (sugestao.carregando) return 'A IA está lendo as mensagens…';
      if (sugestao.erro) return sugestao.erro;
      if (!d) return 'A IA local sugere título, tipo e categoria a partir das mensagens marcadas. Confira antes de abrir.';
      const ORIGEM = { grupo: 'Categoria do grupo.', texto: 'Associação citada nas mensagens.', ia: 'Associação reconhecida pela IA nas mensagens.', interna: 'Nenhuma associação citada: demanda interna da ARX.' };
      const cat = d.categoria ? ' ' + (ORIGEM[d.categoria.origem] || '') : ' Sem categoria sugerida: escolha abaixo.';
      return `Sugestão da IA (${Math.round((d.confianca || 0) * 100)}% de confiança): ${d.tipoNome}.${d.motivo ? ' ' + d.motivo : ''}${cat}`;
    };

    async function abrir() {
      setEstado({ enviando: true, erro: '' });
      try {
        const r = await api('POST', '/api/whatsapp/conversas/chamado', {
          jid: conversa.jid, conversa: nomeConversa(conversa), ids: marcadas.map((m) => m.id), titulo: f.titulo, categoriaId: Number(f.categoriaId) || '',
          requerenteId: f.requerenteId || null, tipo: f.tipo || undefined, resposta: f.enviar ? f.resposta : '', solicitante: requerente ? requerente.label : '',
        });
        aoAbrir(r);
      } catch (err) {
        setEstado({ enviando: false, erro: err.message });
      }
    }
    const campo = (k, rotulo, filho, ajuda) => e('div', { key: k, className: 'exu-campo' }, [
      e('label', { key: 'l', htmlFor: 'cv-' + k }, rotulo), filho, ajuda ? e('p', { key: 'a', className: 'exu-campo-ajuda' }, ajuda) : null,
    ]);
    const midias = marcadas.filter((m) => m.midia).length;
    return e(window.ExemploUI.Modal, {
      titulo: 'Abrir chamado com as mensagens marcadas', largura: 560, fechar,
      descricao: `${marcadas.length === 1 ? '1 mensagem' : `${marcadas.length} mensagens`}${midias ? `, ${midias === 1 ? '1 arquivo vai' : `${midias} arquivos vão`} como anexo` : ''}. O chamado abre com o seu token do GLPI.`,
      rodape: [
        e('button', { key: 'c', type: 'button', className: 'exu-btn', onClick: fechar }, 'Cancelar'),
        e('button', { key: 'a', type: 'button', className: 'exu-btn primario', disabled: estado.enviando || !f.titulo.trim() || !f.categoriaId, onClick: abrir }, estado.enviando ? 'Abrindo…' : 'Abrir chamado'),
      ],
    }, [
      e('div', { key: 'ia', className: 'cv-sugestao' + (sugestao.erro ? ' erro' : '') }, [
        e('p', { key: 'p', role: sugestao.erro ? 'alert' : 'status' }, notaSugestao()),
        e('button', { key: 'b', type: 'button', className: 'exu-btn', disabled: sugestao.carregando, onClick: sugerir }, sugestao.carregando ? 'Sugerindo…' : sugestao.dados ? 'Sugerir de novo' : 'Sugerir com a IA'),
      ]),
      campo('titulo', 'Título', e('input', { key: 'i', id: 'cv-titulo', value: f.titulo, maxLength: 250, onChange: (ev) => mudar('titulo', ev.target.value) })),
      campo('categoria', 'Categoria', e('select', { key: 's', id: 'cv-categoria', value: f.categoriaId, onChange: (ev) => mudar('categoriaId', ev.target.value) }, [
        e('option', { key: '', value: '' }, lookup.categories ? 'Escolha a categoria' : 'Carregando…'),
        ...(lookup.categories || []).map((c) => e('option', { key: c.id, value: String(c.id) }, c.label)),
      ])),
      campo('requerente', 'Requerente', e('select', { key: 's', id: 'cv-requerente', value: f.requerenteId, onChange: (ev) => mudar('requerenteId', ev.target.value) }, [
        e('option', { key: '', value: '' }, 'Não informado (fica o seu usuário)'),
        ...(lookup.users || []).map((u) => e('option', { key: u.id, value: String(u.id) }, u.label)),
      ]), vinculo ? `Sugerido pelo vínculo do telefone: ${vinculo.nome}.` : 'Telefone sem vínculo: escolha quem pediu.'),
      campo('tipo', 'Tipo de solicitação (opcional)', e('select', { key: 's', id: 'cv-tipo', value: f.tipo, onChange: (ev) => mudar('tipo', ev.target.value) }, [
        e('option', { key: '', value: '' }, 'Nenhum'),
        ...(opcoes.tipos || []).map((t) => e('option', { key: t.chave, value: t.chave }, t.nome)),
      ]), 'Escolhe a resposta automática daquele tipo (Administração > WhatsApp).'),
      e('label', { key: 'env', className: 'troca-linha' }, [
        e('input', { key: 'c', type: 'checkbox', className: 'chave', checked: f.enviar, onChange: (ev) => mudar('enviar', ev.target.checked) }),
        e('b', { key: 't' }, 'Responder na conversa'),
      ]),
      f.enviar ? campo('resposta', 'Resposta para quem pediu', e('textarea', { key: 't', id: 'cv-resposta', value: f.resposta, maxLength: 2000, onChange: (ev) => mudar('resposta', ev.target.value) }), 'Use {chamado}, {solicitante} e {tipo}.') : null,
      estado.erro ? e('p', { key: 'erro', className: 'exu-campo-erro', role: 'alert' }, estado.erro) : null,
    ]);
  }

  function ConversasView() {
    const [lista, setLista] = useState(null); // { ativo, conversas }
    const [erro, setErro] = useState('');
    const [atual, setAtual] = useState(null); // jid
    const [msgs, setMsgs] = useState([]);
    const [marcadas, setMarcadas] = useState({});
    const [texto, setTexto] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [aviso, setAviso] = useState(null); // { tipo, texto }
    const [janela, setJanela] = useState(false);
    const [lookup, setLookup] = useState({});
    const fimRef = useRef(null);
    const atualRef = useRef(null);
    atualRef.current = atual;

    const carregarLista = useCallback(() => api('GET', '/api/whatsapp/conversas').then((d) => { setLista(d); setErro(''); }).catch((err) => setErro(err.message)), []);
    const carregarMsgs = useCallback((jid, rolar) => api('GET', '/api/whatsapp/conversas/mensagens?jid=' + encodeURIComponent(jid)).then((d) => {
      if (atualRef.current !== jid) return;
      setMsgs(d);
      if (rolar) setTimeout(() => fimRef.current && fimRef.current.scrollIntoView({ block: 'end' }), 30);
    }).catch((err) => setAviso({ tipo: 'erro', texto: err.message })), []);

    useEffect(() => {
      carregarLista();
      // com a aba visível, a lista e a conversa aberta se atualizam a cada 15 s
      const t = setInterval(() => {
        if (document.hidden) return;
        carregarLista();
        if (atualRef.current) carregarMsgs(atualRef.current, false);
      }, 15000);
      return () => clearInterval(t);
    }, []);

    function abrirConversa(jid) {
      setAtual(jid);
      setMsgs([]);
      setMarcadas({});
      setAviso(null);
      carregarMsgs(jid, true);
    }
    const conversa = lista && lista.conversas.find((c) => c.jid === atual);
    const selecionadas = msgs.filter((m) => marcadas[m.id]);

    function abrirJanela() {
      setJanela(true);
      if (!lookup.categories) {
        fetch('/api/glpi/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userToken: token() }) })
          .then((r) => r.json()).then((d) => setLookup({ categories: d.categories || [], users: d.users || [] })).catch(() => setLookup({ categories: [], users: [] }));
      }
    }
    async function enviar() {
      if (!texto.trim()) return;
      setEnviando(true);
      try {
        await api('POST', '/api/whatsapp/conversas/responder', { jid: atual, texto });
        setTexto('');
        carregarMsgs(atual, true);
      } catch (err) {
        setAviso({ tipo: 'erro', texto: err.message });
      } finally {
        setEnviando(false);
      }
    }

    let corpo;
    if (erro) corpo = e('div', { className: 'vazio' }, erro);
    else if (!lista) corpo = e('div', { className: 'vazio' }, 'Carregando…');
    else if (!lista.ativo) corpo = e('div', { className: 'vazio' }, 'As Conversas estão desligadas. Ligue em Administração > WhatsApp > Conversas.');
    else if (!lista.conversas.length) corpo = e('div', { className: 'vazio' }, 'Nenhuma mensagem guardada ainda. As mensagens aparecem aqui assim que chegarem nos grupos escolhidos.');
    else {
      corpo = e('div', { className: 'cv-grade' }, [
        e('nav', { key: 'l', className: 'cartao cv-lista', 'aria-label': 'Conversas' }, lista.conversas.map((c) =>
          e('button', { key: c.jid, type: 'button', className: 'cv-item', 'aria-current': c.jid === atual ? 'true' : undefined, onClick: () => abrirConversa(c.jid) }, [
            e('span', { key: 'n', className: 'cv-item-nome' }, [e('b', { key: 'b' }, nomeConversa(c)), e('span', { key: 'h', className: 'cv-hora' }, hora(c.ultima.quando))]),
            e('span', { key: 'u', className: 'cv-item-ultima' }, `${c.ultima.nome ? c.ultima.nome + ': ' : ''}${c.ultima.texto || NOME_MIDIA[c.ultima.tipo] || ''}`),
          ]))),
        conversa ? e('section', { key: 'c', className: 'cartao cv-conversa' }, [
          e('header', { key: 'h', className: 'cv-cab' }, [
            e('div', { key: 't' }, [e('h2', { key: 'h' }, nomeConversa(conversa)), e('p', { key: 'p', className: 'cv-hora' }, selecionadas.length ? `${selecionadas.length === 1 ? '1 mensagem marcada' : `${selecionadas.length} mensagens marcadas`}` : 'Marque as mensagens do pedido')]),
            e('div', { key: 'a', className: 'cv-acoes' }, [
              selecionadas.length ? e('button', { key: 'l', type: 'button', className: 'btn texto', onClick: () => setMarcadas({}) }, 'Limpar') : null,
              e('button', { key: 'c', type: 'button', className: 'btn primario', disabled: !selecionadas.length, onClick: abrirJanela }, 'Abrir chamado'),
            ]),
          ]),
          aviso ? e('p', { key: 'av', className: 'cv-aviso ' + aviso.tipo, role: aviso.tipo === 'erro' ? 'alert' : 'status' }, aviso.texto) : null,
          e('div', { key: 'm', className: 'cv-mensagens' }, [
            ...msgs.map((m) => e(Mensagem, { key: m.id, m, marcada: !!marcadas[m.id], alternar: () => setMarcadas((x) => ({ ...x, [m.id]: !x[m.id] })) })),
            e('div', { key: 'fim', ref: fimRef }),
          ]),
          e('div', { key: 'r', className: 'cv-responder' }, [
            e('textarea', {
              key: 't', value: texto, rows: 2, maxLength: 2000, placeholder: 'Responder na conversa (Enter envia, Shift+Enter quebra a linha)', 'aria-label': 'Resposta',
              onChange: (ev) => setTexto(ev.target.value),
              onKeyDown: (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); enviar(); } },
            }),
            e('button', { key: 'b', type: 'button', className: 'btn', disabled: enviando || !texto.trim(), onClick: enviar }, enviando ? 'Enviando…' : 'Enviar'),
          ]),
        ]) : e('div', { key: 'v', className: 'vazio cv-escolha' }, 'Escolha uma conversa.'),
      ]);
    }

    return e('div', { className: 'coluna cv-tela' }, [
      e('div', { key: 't', className: 'titulo' }, [
        e('div', { key: 'a' }, [e('h1', { key: 'h' }, 'Conversas do WhatsApp'), e('p', { key: 's', className: 'sub' }, 'Marque mensagens, imagens e áudios e abra o chamado com eles, ou responda direto na conversa.')]),
        e('div', { key: 'b', className: 'acoes' }, e('button', { type: 'button', className: 'btn', onClick: () => { carregarLista(); if (atual) carregarMsgs(atual, false); } }, 'Atualizar')),
      ]),
      corpo,
      janela && conversa ? e(JanelaChamado, {
        key: 'j', conversa, marcadas: selecionadas, lookup, opcoes: { tipos: lista.tipos || [] }, respostas: lista.respostas || { abertura: '', porTipo: {} }, fechar: () => setJanela(false),
        aoAbrir: (r) => {
          setJanela(false);
          setMarcadas({});
          const partes = [`Chamado ${r.ticketId} aberto.`];
          if (r.falhas && r.falhas.length) partes.push(`Não anexou: ${r.falhas.join(', ')}.`);
          if (r.erroResposta) partes.push(`A resposta não foi enviada: ${r.erroResposta}`);
          else if (r.respondido) partes.push('Resposta enviada na conversa.');
          setAviso({ tipo: r.erroResposta || (r.falhas && r.falhas.length) ? 'alerta' : 'ok', texto: partes.join(' ') });
          carregarMsgs(atual, true);
        },
      }) : null,
    ]);
  }

  /**
   * true quando a pessoa (token do GLPI do cofre) pode ver a aba: Conversas ligadas e ela é admin, está num grupo do GLPI
   * liberado ou a aba é de todos (o servidor decide). Confere de novo quando o token muda ou a Administração salva.
   */
  function usePodeConversas() {
    const [pode, setPode] = useState(false);
    useEffect(() => {
      let vivo = true;
      async function checar() {
        const t = token();
        if (!t) return setPode(false);
        try {
          const resp = await fetch('/api/whatsapp/conversas/acesso', { headers: { 'X-Glpi-Token': t }, cache: 'no-store' });
          const d = await resp.json().catch(() => ({}));
          if (vivo) setPode(resp.ok && !!d.pode);
        } catch {
          if (vivo) setPode(false); // sem resposta: a aba simplesmente não aparece
        }
      }
      checar();
      const parar = window.ArxAcessosHub ? window.ArxAcessosHub.aoMudar(checar) : () => {};
      window.addEventListener('arx-config-conversas', checar);
      return () => {
        vivo = false;
        parar();
        window.removeEventListener('arx-config-conversas', checar);
      };
    }, []);
    return pode;
  }

  window.ConversasView = ConversasView;
  window.usePodeConversas = usePodeConversas;
})();
