// ARX Hub v1: só visual. Cada rota desenha uma tela a partir de dados.js (automações reais, o resto de exemplo) com
// os mesmos campos do Hub de hoje; nenhum botão chama servidor. Rotas: #painel[/lista|/nova], #chamados/<visão>[/ver/<id>],
// #resultados[/disp], #admin/<página>, #acessos, #glpi, #a/<id da automação>[/<aba>].
(() => {
  const V = window.V1;
  const nf = (v, d = 0) => Charts.fmt.dec(d)(v);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const plural = (n, um, varios) => `${nf(n)} ${n === 1 ? um : varios}`;

  // ícones da moldura (os das automações vêm do icons.js do Hub, abaixo)
  const ICONE = {
    painel: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    chamados: '<path d="M4 4h16v12H8l-4 4z"/>',
    resultados: '<path d="M3 3v18h18"/><path d="M8 17v-5M13 17V8M18 17v-9"/>',
    admin: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>', mais: '<path d="M12 5v14M5 12h14"/>',
    voltar: '<path d="m15 18-6-6 6-6"/>', avancar: '<path d="m9 18 6-6-6-6"/>',
    recarregar: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    sino: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    chave: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    ajuda: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5V14M12 17h.01"/>',
    fone: '<path d="M3 14v-2a9 9 0 0 1 18 0v2"/><path d="M21 16a2 2 0 0 1-2 2h-1v-6h3zM3 16a2 2 0 0 0 2 2h1v-6H3z"/>',
    ponto: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    engrenagem: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>',
    grade: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  };
  const ic = (n, t = 16) => `<svg viewBox="0 0 24 24" width="${t}" height="${t}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONE[n]}</svg>`;
  // o ícone que a pessoa escolheu no cadastro, desenhado pelo icons.js do Hub (montado sobre um React de mentira)
  const svgDoNo = (n) => {
    if (n == null || typeof n !== 'object') return '';
    const at = Object.entries(n.p || {}).filter(([k, v]) => k !== 'style' && k !== 'key' && v != null).map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}="${esc(v)}"`).join(' ');
    return `<${n.t} ${at}>${(n.c || []).map(svgDoNo).join('')}</${n.t}>`;
  };
  const icAuto = (a, t = 18) => svgDoNo(window.Icons.Icon(a.icone, t, a.cor)) || ic('painel', t);
  const MARCA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 4 5.5v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10v-6z" fill="#5bd68a"/><path d="m8.2 12.2 2.6 2.6 5-5.2" fill="none" stroke="#0c0d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const ABERTAS = ['9', '22', '15'].filter((id) => V.nomeAuto(id)); // abas de automação abertas no exemplo
  const abertaId = { 9: 'alt', 22: 'foto', 15: 'rel' };
  const online = V.automacoes.filter((a) => a.status === 'online').length;
  const chip = (k) => `<span class="pill">${V.CATEGORIAS[k] || k}</span>`;
  const status = (a) => a.status === 'online' ? '<span class="pill pos">Online</span>' : a.status === 'offline' ? '<span class="pill neg">Offline</span>' : '<span class="pill warn">Verificando</span>';
  const SIT = {
    pronto: ['pos', 'Pronto para rodar', '<button class="btn" type="button">Rodar</button>'],
    falta: ['warn', 'Falta escolher', '<button class="btn texto" type="button">Escolher</button>'],
    confirmar: ['', 'Só manual', '<button class="btn texto" type="button">Conferir e rodar</button>'],
    erro: ['neg', 'Com erro', '<button class="btn" type="button">Rodar novamente</button>'],
    manual: ['', 'Análise manual', ''], feitos: ['pos', 'Solucionado', ''], naorodar: ['', 'Não rodar', ''],
  };

  // ---------- moldura de navegador ----------
  const FIXAS = [['painel', 'painel', 'Painel'], ['chamados', 'chamados', 'Chamados'], ['resultados', 'resultados', 'Resultados'], ['admin', 'admin', 'Administração']];
  function moldura(rota, trilha, conteudo) {
    const prontos = V.conta('pronto');
    const base = rota.split('/')[0];
    const fixa = ([href, icone, rot]) => `<a class="aba fixa${href === 'chamados' && prontos ? ' com-conta' : ''}" href="#${href}" title="${rot}" aria-label="${rot}" ${base === href ? 'aria-current="page"' : ''}>${ic(icone)}${href === 'chamados' && prontos ? `<span class="conta">${prontos}</span>` : ''}</a>`;
    const aberta = (id) => { const a = V.automacoes.find((x) => x.id === id); return `<a class="aba" href="#a/${id}" ${rota.startsWith('a/' + id) ? 'aria-current="page"' : ''}>${icAuto(a, 14)}<span class="rot">${a.nome}</span><span class="fechar" title="Fechar ${a.nome}">${ic('x', 12)}</span></a>`; };
    return `<header class="navegador">
  <nav class="faixa" aria-label="Abas">
    <span class="marca">${MARCA}ARX Hub</span>
    ${FIXAS.map(fixa).join('')}${ABERTAS.map(aberta).join('')}
    <a class="aba-nova" href="#painel" title="Abrir outra automação" aria-label="Abrir outra automação">${ic('mais')}</a>
  </nav>
  <div class="endereco">
    <div class="lado"><button class="icone-btn" type="button" aria-label="Voltar">${ic('voltar')}</button><button class="icone-btn" type="button" aria-label="Avançar" disabled>${ic('avancar')}</button><button class="icone-btn" type="button" aria-label="Recarregar">${ic('recarregar')}</button>
      <span class="no-ar some"><i></i>${online}/${V.automacoes.length} online</span></div>
    <label class="campo-endereco"><span class="trilha"><span>Sistemas</span><span>/</span>${trilha}</span><span class="busca">${ic('busca', 13)}Buscar <kbd>Ctrl K</kbd></span></label>
    <div class="lado dir"><a class="icone-btn some" href="#ajuda" aria-label="Como usar o Hub: tutoriais em vídeo">${ic('ajuda')}</a><a class="icone-btn alerta some" href="#resultados/disp" aria-label="Alertas: 1 erro">${ic('sino')}</a>
      <a class="btn some" href="#acessos">${ic('chave', 14)}Meus acessos<i class="cofre-ok" title="Cofre destravado"></i></a><span class="inicial" title="Carla Menezes, administradora">CM</span></div>
  </div>
</header>
<main class="coluna">${conteudo}</main>
<a class="fab" href="#glpi" aria-label="Abrir chamado no GLPI" title="Abrir chamado no GLPI">${ic('fone', 20)}</a>`;
  }
  const titulo = (h1, sub, acoes = '') => `<div class="titulo"><div><h1>${h1}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div><div class="acoes">${acoes}</div></div>`;
  const kpi = (rot, valor, delta = '', classe = '') => `<div class="kpi"><div class="kpi-label">${rot}</div><div class="kpi-value ${classe}">${valor}</div>${delta ? `<div class="delta">${delta}</div>` : ''}</div>`;
  const sec = (classe, id, h2, extra, corpo) => `<section class="cartao ${classe}" aria-labelledby="t-${id}"><header><h2 id="t-${id}">${h2}</h2>${extra}</header>${corpo}</section>`;
  const seg = (rotulo, itens, marcado) => `<div class="segmentado" role="group" aria-label="${rotulo}">${itens.map((x) => `<button type="button" aria-pressed="${x === marcado}">${x}</button>`).join('')}</div>`;
  const sel = (rotulo, opcoes) => `<select class="input curto" aria-label="${rotulo}">${opcoes.map((o) => `<option>${o}</option>`).join('')}</select>`;
  const chave = (rot, on, extra = '') => `<label class="troca-linha"><input class="chave" type="checkbox" ${on ? 'checked' : ''} aria-label="${rot}"><span><b>${rot}</b>${extra ? ` <span class="faint">${extra}</span>` : ''}</span></label>`;
  const tabela = (cab, linhas, classe = '') => `<table class="${classe}"><thead><tr>${cab.map((c) => `<th class="${/^(Execuções|Itens|Concluídos|Erros|Chamados|Resolvidos|Com erro|Taxa|Parte|Qtd\.|Ficou fora)$/.test(c) ? 'dir' : ''}">${c}</th>`).join('')}</tr></thead><tbody>${linhas.join('')}</tbody></table>`;
  const dialogo = (titulo, corpo, rodape) => `<div class="veu"><section class="dialogo" role="dialog" aria-label="${titulo}"><header><h2>${titulo}</h2><a class="icone-btn" href="#painel" aria-label="Fechar">${ic('x')}</a></header><div class="dialogo-corpo">${corpo}</div>${rodape ? `<footer>${rodape}</footer>` : ''}</section></div>`;

  // ---------- Painel: as automações cadastradas ----------
  function painel(modo) {
    const lista = modo === 'lista';
    const doBanco = (a) => a.sistemas.includes('db');
    const cartao = (a) => `<article class="cartao auto">
      <header><span class="auto-ic">${icAuto(a, 20)}</span>${status(a)}<button class="icone-btn" type="button" aria-label="Opções de ${a.nome}">${ic('ponto')}</button></header>
      <div class="chips">${a.sistemas.map(chip).join('')}</div>
      <h3>${a.nome}</h3><p class="desc">${esc(a.desc || 'Sem descrição')}</p>
      ${a.endereco ? `<p class="mono faint">${a.endereco}</p>` : ''}
      <a class="btn largo" href="${abertaId[a.id] ? '#a/' + a.id : '#painel'}">Abrir</a></article>`;
    const linha = (a) => `<a class="linha" href="${abertaId[a.id] ? '#a/' + a.id : '#painel'}"><span class="auto-ic">${icAuto(a, 18)}</span><div class="nome"><b>${a.nome}</b><small>${esc(a.desc || 'Sem descrição')}</small></div><div class="chips some">${a.sistemas.map(chip).join('')}</div>${status(a)}</a>`;
    const bloco = (l) => lista ? `<div class="cartao"><div class="linhas">${l.map(linha).join('')}</div></div>` : `<div class="autos">${l.map(cartao).join('')}</div>`;
    const principais = V.automacoes.filter((a) => !doBanco(a)), banco = V.automacoes.filter(doBanco);
    return titulo('Automações', `${plural(V.automacoes.length, 'automação', 'automações')}, ${online} online, ${V.automacoes.length - online} offline.`,
      `<div class="segmentado" role="group" aria-label="Exibição das automações"><a class="seg-link" href="#painel" aria-pressed="${!lista}">${ic('grade', 14)} Cartões</a><a class="seg-link" href="#painel/lista" aria-pressed="${lista}">${ic('lista', 14)} Lista</a></div>
       <a class="btn primario" href="#painel/nova">${ic('mais', 14)}Nova automação</a>`)
    + bloco(principais)
    + `<section class="secao banco"><header><div><h2>Banco de Dados</h2><p>Rotinas que alimentam e mantêm o banco-central.</p></div><span class="pill">${plural(banco.length, 'automação', 'automações')}</span></header>${bloco(banco)}</section>`
    + (modo === 'nova' ? dialogo('Nova automação', `<div class="duas-col"><div>
        <div class="campo"><label for="n-nome">Nome</label><input class="input" id="n-nome" placeholder="Ex.: Emissão de boletos"></div>
        <div class="campo"><label for="n-desc">Descrição</label><textarea class="input" id="n-desc" placeholder="Finalidade da automação"></textarea></div>
        <div class="campo"><label for="n-url">URL (vista pelo servidor do Hub)</label><input class="input mono" id="n-url" placeholder="http://container:4000/"><span class="dica">O navegador nunca vê esse endereço: a tela abre pelo proxy do Hub.</span></div>
        <div class="duas"><div class="campo"><label for="n-cont">Container Docker (opcional)</label><input class="input mono" id="n-cont"></div><div class="campo"><label for="n-min">Minutos que um item levaria à mão (opcional)</label><input class="input" id="n-min" inputmode="numeric"></div></div>
        <div class="campo"><span class="rot">Categorias</span><div class="chips">${Object.values(V.CATEGORIAS).map((c, i) => `<button class="opcao-chip" type="button" aria-pressed="${i === 1}">${c}</button>`).join('')}</div></div>
      </div><div>
        <div class="campo"><span class="rot">Ícone</span><input class="input" placeholder="Buscar ícone (em inglês)" aria-label="Buscar ícone"><div class="icones">${window.Icons.ICON_CHOICES.map((n, i) => `<button type="button" aria-pressed="${i === 0}" aria-label="${n}">${svgDoNo(window.Icons.Icon(n, 18, '#e6e6e6'))}</button>`).join('')}</div></div>
        <div class="campo"><span class="rot">Cor</span><div class="cores">${window.Icons.COLOR_CHOICES.map((c, i) => `<button type="button" aria-pressed="${i === 0}" aria-label="Cor ${c}" style="background:${c}"></button>`).join('')}</div></div>
        <div class="campo"><span class="rot">Prévia do cartão</span><div class="previa-cartao">${cartao({ id: 'x', nome: 'Nome da automação', desc: 'A descrição aparece aqui, em até duas linhas.', icone: 'Workflow', cor: '#1E4A9E', sistemas: ['sga'], status: 'checking', endereco: '' })}</div></div>
      </div></div>`, '<button class="btn" type="button">Testar conexão</button><span class="esp"></span><a class="btn texto" href="#painel">Cancelar</a><button class="btn primario" type="button">Cadastrar</button>') : '');
  }

  // ---------- Chamados ----------
  function chamados(visao = 'todos', ver, id) {
    const lista = V.filtra(visao);
    const tipos = [...new Set(V.chamados.map((c) => c.tipo).filter(Boolean))].sort();
    const cats = [...new Set(V.chamados.map((c) => c.categoria))].sort();
    const kpiBtn = (v, rot, det) => `<a class="kpi kpi-btn" href="#chamados/${v}" aria-pressed="${visao === v}"><div class="kpi-label">${rot}</div><div class="kpi-value">${V.conta(v)}</div><div class="delta">${det}</div></a>`;
    const detalhe = (c) => c.erro || c.falta || c.motivo || '';
    const aberto = ver === 'ver' && V.chamados.find((c) => String(c.id) === id);
    return titulo('Chamados', `Entidade Sistemas, ${plural(V.abertosNaTela, 'aberto', 'abertos')}, aprovação como (Sistemas) Carla Menezes, atualizado às ${V.agora}.`,
      `${chave('Modo teste', true)}${chave('Automático', false)}
       <div class="passo" role="group" aria-label="Chamados ao mesmo tempo no automático"><button class="icone-btn" type="button" aria-label="Diminuir">−</button><span><b>5</b> por vez</span><button class="icone-btn" type="button" aria-label="Aumentar">+</button></div>
       <button class="icone-btn" type="button" aria-label="Configurações do automático">${ic('engrenagem')}</button><button class="icone-btn" type="button" aria-label="Atualizar a lista">${ic('recarregar')}</button>
       <button class="btn primario" type="button">Rodar prontos (${V.conta('pronto')})</button>`)
    + `<p class="aviso-teste">Em teste a automação lê e preenche, mas não escreve no GLPI.</p>`
    + `<div class="kpis kpis-btn">${kpiBtn('pronto', 'Prontos para rodar', 'reconhecidos e completos')}${kpiBtn('falta', 'Falta escolher', 'perfil, cooperativa, login…')}${kpiBtn('confirmar', 'Só manual', 'precisam de confirmação')}${kpiBtn('erro', 'Com erro', 'podem rodar de novo')}${kpiBtn('feitos', 'Solucionados', 'nesta tela')}</div>`
    + `<nav class="tabs" role="tablist" aria-label="Visões">${V.VISOES.map(([k, n]) => `<a role="tab" href="#chamados/${k}" aria-selected="${k === visao}">${n} <span class="n">${V.conta(k)}</span></a>`).join('')}</nav>
    <div class="barra"><label class="busca-lista">${ic('busca', 14)}<span>Buscar por número, título ou solicitante</span></label>${sel('Tipo', ['Todos os tipos', ...tipos])}${sel('Categoria', ['Todas as categorias', ...cats])}${sel('Ordem', ['Mais recentes', 'Mais antigos'])}<span class="esp"></span>
      ${seg('Exibição', ['Lista', 'Cartões'], 'Lista')}</div>
    ${lista.length ? tabela(['<input type="checkbox" aria-label="Marcar a página">', 'Chamado', 'Tipo', 'Categoria', 'Aberto há', 'Situação', '<span class="sr">Ação</span>'],
      lista.map((c) => `<tr><td class="marca-col"><input type="checkbox" aria-label="Marcar chamado ${c.id}"></td>
        <td><a class="chamado" href="#chamados/${visao}/ver/${c.id}"><span class="mono faint">#${c.id}</span> ${esc(c.titulo)}</a><small>${esc(c.solicitante)} (${c.grupo}), ${c.glpi}</small><small class="so-estreito">${c.tipo || 'Sem automação'}, ${c.categoria}, aberto há ${c.aberto}</small></td>
        <td class="col-media">${c.tipo ? `<span class="pill">${c.tipo}</span>` : '<span class="faint">Sem automação</span>'}</td><td class="col-media">${c.categoria}</td><td class="col-media num">${c.aberto}</td>
        <td><span class="pill ${SIT[c.sit][0]}">${SIT[c.sit][1]}</span>${detalhe(c) ? `<small>${esc(detalhe(c))}</small>` : ''}</td><td class="dir">${SIT[c.sit][2]}</td></tr>`), 'tabela-linhas chamados-tab')
      + `<div class="paginas"><span class="faint">Página 1 de 1</span><button class="btn texto" type="button" disabled>Anterior</button><button class="btn texto" type="button" disabled>Próxima</button></div>`
      : '<p class="vazio">Nada nesta visão.</p>'}
    <section class="cartao execs" aria-labelledby="t-exec"><header><h2 id="t-exec">Execuções</h2><span class="meta">1 em execução agora</span></header>
      <div class="linha"><div class="nome"><b>#${V.execucao.ids.join(', #')}</b><small>Cadastro de consultor, modo teste</small></div><span class="pill warn">Em execução</span><button class="btn" type="button">Parar</button><button class="btn texto" type="button">Ocultar log</button></div>
      <pre class="log">${V.execucao.linhas.map(esc).join('\n')}</pre></section>`
    + (aberto ? gaveta(aberto, visao) : '');
  }
  function gaveta(c, visao) {
    const par = ([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`;
    return `<div class="veu"><aside class="gaveta" role="dialog" aria-label="Chamado ${c.id}">
      <header><div><p class="mono faint">#${c.id}</p><h2>${esc(c.titulo)}</h2></div><a class="icone-btn" href="#chamados/${visao}" aria-label="Fechar (Esc)">${ic('x')}</a></header>
      <div class="gaveta-acoes"><button class="btn texto" type="button">Abrir no GLPI</button><button class="btn texto" type="button">Copiar link</button><span class="esp"></span>${SIT[c.sit][2] || ''}${['pronto', 'falta', 'confirmar', 'erro'].includes(c.sit) ? '<button class="btn texto" type="button">Não rodar</button>' : ''}</div>
      <section><h3>Informações</h3><dl class="pares">${[['Solicitante', `${c.solicitante} (${c.grupo})`], ['Categoria', c.categoria], ['Entidade', 'Sistemas'], ['Aberto há', c.aberto], ['Situação no GLPI', c.glpi], ['Tipo', c.tipo || 'Sem automação'], ['Situação', SIT[c.sit][1]], ['Modo', 'Teste']].map(par).join('')}</dl></section>
      ${c.leu ? `<section><h3>O que a automação leu</h3><dl class="pares">${c.leu.map(par).join('')}</dl></section>` : ''}
      ${c.ia ? `<section><h3>Opinião da IA local</h3><p>A IA local sugere outro tipo: <b>${c.ia[0]}</b>, confiança de ${nf(c.ia[1] * 100)}%.</p><div class="barra rodape"><button class="btn" type="button">Usar: ${c.ia[0]}</button><button class="btn texto" type="button">Concorda com a regra</button></div></section>` : ''}
      ${c.erro ? `<section><h3>Execução</h3><p class="erro-txt">${esc(c.erro)}</p><p class="faint">Erro: devolutiva pendente no chamado.</p></section>` : ''}
      <section><h3>Conversa no chamado</h3>${V.conversa.map(([q, t, m]) => `<div class="msg"><p><b>${q}</b> <span class="faint">${t}</span></p><p>${esc(m)}</p></div>`).join('')}</section>
    </aside></div>`;
  }

  // ---------- Resultados ----------
  const PERIODOS = ['Hoje', 'Ontem', 'Últimos 7 dias', 'Este mês', 'Mês passado', 'Últimos 30 dias', 'Últimas 12 semanas'];
  const listaBarras = (linhas, total, fmt = (v) => nf(v)) => {
    const max = Math.max(...linhas.map((l) => l[1]));
    return `<table class="parte"><tbody>${linhas.map(([n, v]) => `<tr><td><span class="fundo" style="width:${(v / max) * 100}%"></span><span>${n}</span></td><td class="dir num faint"><span>${nf((v / total) * 100, 1)}%</span></td><td class="dir num"><span>${fmt(v)}</span></td></tr>`).join('')}</tbody></table>`;
  };
  function resultados(aba) {
    const disp = aba === 'disp';
    const filtros = `<div class="filtros">${seg('Período', PERIODOS, 'Este mês')}<button class="btn texto" type="button">Escolher período</button></div>
      <div class="barra">${disp ? '' : `${sel('Associação', ['Todas as associações', ...V.assocs.map((a) => a[0])])}${sel('Tipo', ['Todos os tipos', ...V.porTipo.map((t) => t[0])])}${sel('Origem', ['Pelos chamados e manuais', 'Só pelos chamados', 'Só manuais'])}${chave('Incluir modo teste', false)}`}<span class="esp"></span><button class="btn" type="button">${ic('recarregar', 14)}Atualizar</button></div>`;
    return titulo('Resultados', disp ? 'Automações e serviços no ar, quedas e alertas do período.' : 'Chamados tratados pelas automações em outubro, até hoje (dia 22). O tempo economizado é uma estimativa.')
      + `<nav class="tabs" role="tablist" aria-label="Resultados"><a role="tab" href="#resultados" aria-selected="${!disp}">Chamados tratados</a><a role="tab" href="#resultados/disp" aria-selected="${disp}">Disponibilidade</a></nav>`
      + filtros + (disp ? disponibilidade() : tratados());
  }
  function tratados() {
    const taxa = V.errosMes / V.atendidosMes, taxaAnt = V.errosMesAnterior / (V.resolvidosMesAnterior + V.errosMesAnterior);
    const dRes = V.resolvidosMes - V.resolvidosMesAnterior;
    const uteis = V.dias.filter((_, i) => ![3, 4, 10, 11, 17, 18].includes(i + 1)).length; // sábados e domingos de outubro até o dia 22
    return `<div class="pilha">
      <div class="kpis">${kpi('Chamados resolvidos', nf(V.resolvidosMes), `<span class="bom">${dRes > 0 ? '+' : ''}${nf(dRes)}</span> em relação ao mês passado (${nf(V.resolvidosMesAnterior)})`)}
        ${kpi('Taxa de erro', nf(taxa * 100, 1) + '%', `<span class="bom">${nf((taxa - taxaAnt) * 100, 1)} p.p.</span> em relação ao mês passado`)}
        ${kpi('Tempo economizado', '8,5<small>h</small>', 'itens resolvidos × minutos à mão (estimativa)')}
        ${kpi('Tempo médio por chamado', '2<small>min</small> 4<small>s</small>', 'do início ao fim da execução')}
        ${kpi('Execuções manuais', nf(V.manuais.execucoes), `${nf(V.manuais.concluidos)} de ${nf(V.manuais.itens)} itens concluídos`)}
        ${kpi('Média por dia útil', nf(V.atendidosMes / uteis, 1), 'execuções pelos chamados')}</div>
      <section class="grafico"><header class="chart-cab"><div><h2>Resolvidos e com erro por dia</h2><p class="faint">Passe o mouse em uma coluna para ver os números. O dia 22 ainda está em andamento.</p></div></header><div id="g-dia"><div class="legenda"></div><div class="chart"></div></div></section>
      <div class="grade">
        <section class="cartao c12"><div class="par"><div><h2>Por tipo de chamado</h2><p>Do mais atendido para o menos atendido.</p>${listaBarras(V.porTipo, V.resolvidosMes)}</div>
          <div><h2>Motivos de erro</h2><p>O que mais fez as automações pararem.</p>${listaBarras(V.motivos, V.errosMes)}</div></div></section>
        ${sec('c12', 'hora', 'Por hora do dia', '<span class="meta">Quando os chamados mais chegam para as automações.</span>', '<div class="chart" id="g-hora"></div>')}
        ${sec('c12', 'orig', 'Pelos chamados e manuais', '', tabela(['Origem', 'Execuções', 'Concluídos', 'Erros'], [
          `<tr><td>Pelos chamados</td><td class="dir num">${nf(V.atendidosMes)}</td><td class="dir num">${nf(V.resolvidosMes)}</td><td class="dir num">${nf(V.errosMes)}</td></tr>`,
          `<tr><td>Manuais</td><td class="dir num">${nf(V.manuais.execucoes)}</td><td class="dir num">${nf(V.manuais.concluidos)}</td><td class="dir num">${nf(V.manuais.erros)}</td></tr>`]))}
        <section class="cartao c12"><div class="par"><div><h2>Associações</h2><p>Clique no título de uma coluna para ordenar.</p>${tabela(['Associação', 'Chamados', 'Resolvidos', 'Com erro', 'Taxa'],
          V.assocs.map(([n, ch, r]) => `<tr><td>${n}</td><td class="dir num">${ch}</td><td class="dir num">${r}</td><td class="dir num">${ch - r}</td><td class="dir num">${nf(((ch - r) / ch) * 100, 1)}%</td></tr>`), 'ordenavel')}</div>
          <div><h2>Quem aprovou</h2><p>Pessoa do token do GLPI que rodou ou ligou o automático.</p>${tabela(['Pessoa', 'Execuções', 'Resolvidos', 'Taxa'],
          V.aprovadores.map(([p, ex, r]) => `<tr><td>${p}</td><td class="dir num">${ex}</td><td class="dir num">${r}</td><td class="dir num">${nf(((ex - r) / ex) * 100, 1)}%</td></tr>`))}</div></div></section>
        ${sec('c12', 'atend', 'Chamados atendidos', `<span class="meta">${plural(V.atendidosMes, 'chamado', 'chamados')} no período</span>`, tabela(['Chamado', 'Tipo', 'Associação', 'Aprovado por', 'Quando', 'Situação'],
          V.atendidos.map(([id, t, tipo, a, quem, q, s]) => `<tr><td><span class="mono faint">#${id}</span> ${esc(t)}</td><td class="col-media">${tipo}</td><td class="col-media">${a}</td><td class="col-media">${quem}</td><td class="num">${q}</td><td><span class="pill ${s === 'Erro' ? 'neg' : s === 'Teste' ? '' : 'pos'}">${s}</span></td></tr>`), 'tabela-linhas')
          + '<div class="paginas"><span class="faint">Página 1 de 24</span><button class="btn texto" type="button" disabled>Anterior</button><button class="btn texto" type="button">Próxima</button></div>')}
      </div>
      <section class="secao"><header><div><h2>Execuções manuais</h2><p>Rodadas pela tela de cada automação, pela pessoa do token do GLPI.</p></div></header>
        <div class="kpis">${kpi('Execuções manuais', nf(V.manuais.execucoes), '1 em andamento')}${kpi('Itens concluídos', nf(V.manuais.concluidos), plural(V.manuais.erros, 'com erro', 'com erro'))}${kpi('Tempo economizado', '3<small>h</small> 8<small>min</small>', 'itens × minutos à mão (estimativa)')}${kpi('Duração média', '1<small>min</small> 36<small>s</small>', 'por execução')}</div>
        <section class="cartao"><div class="par"><div><h2>Por automação</h2><p>Execuções e itens de cada automação.</p>${tabela(['Automação', 'Execuções', 'Itens', 'Concluídos', 'Erros'], V.porAuto.map(([n, ex, it, c, er]) => `<tr><td>${n}</td><td class="dir num">${ex}</td><td class="dir num">${it}</td><td class="dir num">${c}</td><td class="dir num">${er}</td></tr>`))}</div>
          <div><h2>Últimas execuções</h2><p>As 30 mais recentes do período.</p>${tabela(['Quando', 'Automação', 'Pessoa', 'Itens'], [['Hoje 13:20', 'Alt. Status Usuário', 'Patrícia Lemos', '3'], ['Hoje 12:00', 'Extrai Relatórios', 'Rodrigo Salles', '3'], ['Hoje 09:40', 'Foto de perfil', 'Juliana Prado', '1'], ['Ontem 17:05', 'Converter planilha', 'Carla Menezes', '2']].map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td class="dir num">${r[3]}</td></tr>`))}</div></div></section></section>
    </div>`;
  }
  function disponibilidade() {
    const total = 30 * 1440;
    const linhas = V.servicos.map(([n, fora]) => [n, fora, 1 - fora.reduce((s, v) => s + v, 0) / total]);
    const media = linhas.reduce((s, l) => s + l[2], 0) / linhas.length;
    const foraTotal = V.servicos.reduce((s, [, f]) => s + f.reduce((a, b) => a + b, 0), 0);
    const cel = (m) => `<i class="${m === 0 ? 'ok' : m < 60 ? 'parcial' : 'fora'}" title="${m === 0 ? 'No ar o dia inteiro' : 'Fora por ' + (m < 60 ? m + ' min' : nf(m / 60, 1) + ' h')}"></i>`;
    return `<div class="pilha">
      <div class="kpis">${kpi('Disponibilidade média', nf(media * 100, 2) + '%', `de ${V.servicos.length} automações e serviços`)}${kpi('Quedas e alertas', nf(V.quedas.length), '2 quedas e 2 avisos')}
        ${kpi('Tempo fora do ar', nf(foraTotal / 60, 1) + '<small>h</small>', 'somando todos')}${kpi('Tempo médio para voltar', '1<small>d</small> 15<small>h</small>', '1 alerta ainda aberto', 'ruim')}</div>
      <section class="grafico"><header class="chart-cab"><div><h2>Tempo fora do ar por dia</h2><p class="faint">Soma da duração das quedas que começaram em cada dia, em horas.</p></div></header><div class="chart" id="g-fora"></div></section>
      ${sec('c12', 'faixas', 'Automações e serviços', '<span class="meta">Cada bloco é um dia dos últimos 30. Passe o mouse para ver o tempo fora.</span>',
        `<div class="faixas">${linhas.map(([n, fora, d]) => `<div class="faixa-linha"><span class="faixa-nome">${n}</span><span class="dias" role="img" aria-label="${n}: ${nf(d * 100, 2)}% no ar">${fora.map(cel).join('')}</span><span class="num dir">${nf(d * 100, 2)}%</span></div>`).join('')}</div>
        <p class="legenda-faixa"><span><i class="ok"></i>No ar</span><span><i class="parcial"></i>Menos de 1 h fora</span><span><i class="fora"></i>1 h ou mais fora</span></p>`)}
      ${sec('c12', 'quedas', 'Quedas e alertas', '<span class="meta">Do mais recente para o mais antigo.</span>', tabela(['Serviço', 'Problema', 'Tipo', 'Começou', 'Voltou'],
        V.quedas.map(([s, p, t, c, v]) => `<tr><td>${s}</td><td>${p}</td><td><span class="pill ${t === 'Queda' ? 'neg' : 'warn'}">${t}</span></td><td class="num">${c}</td><td class="num">${v || '<span class="pill warn">Aberto</span>'}</td></tr>`), 'tabela-linhas'))}
    </div>`;
  }

  // ---------- Administração: menu à esquerda, uma página por vez ----------
  const GRUPOS = [
    ['Acesso', [['cofre', 'Cofre'], ['admins', 'Administradores'], ['historico', 'Histórico']]],
    ['Automações', [['automacoes', 'Automações']]],
    ['IA local', [['ia', 'IA local'], ['revisao', 'Revisão da IA']]],
    ['WhatsApp', [['whatsapp', 'Configuração'], ['vinculos', 'Vínculos'], ['conexao', 'Conexão e pedidos']]],
  ];
  const opcao = (t, d, on) => `<button class="opcao" type="button" aria-pressed="${on}">${t}<small>${d}</small></button>`;
  const troca = (t, d, on) => `<div class="troca"><div><b>${t}</b>${d ? `<p>${d}</p>` : ''}</div><input class="chave" type="checkbox" ${on ? 'checked' : ''} aria-label="${t}"></div>`;
  const caixa = (h, d, corpo) => `<section class="caixa"><header><h2>${h}</h2>${d ? `<p>${d}</p>` : ''}</header>${corpo}</section>`;
  const salvar = (t = 'Salvar') => `<div class="barra rodape"><span class="esp"></span><button class="btn primario" type="button">${t}</button></div>`;
  const PAGINAS = {
    cofre: ['Cofre', 'Senha mestra dos acessos e quanto tempo o cofre fica liberado.', () =>
      caixa('Senha mestra', 'Os acessos ficam cifrados neste navegador com uma senha mestra.', troca('Senha mestra', 'Pedir a senha mestra toda vez que o Hub for aberto (o mais seguro).', true))
      + caixa('Tempo liberado', 'Quanto tempo o cofre fica aberto depois de destravar.', `<div class="opcoes">${opcao('Pedir a senha toda vez', 'Destrava só enquanto a página está aberta.', false)}${opcao('Por horas', 'Por um número de horas depois de destravar.', true)}${opcao('Até o fim do dia', 'Trava à meia-noite.', false)}${opcao('Só nesta aba', 'Trava ao fechar a aba.', false)}</div>
        <div class="campo"><label for="horas">Horas (1 a 72)</label><input class="input curto-campo" id="horas" value="8" inputmode="numeric"></div>`) + salvar()],
    admins: ['Administradores', 'Quem pode abrir esta administração. Os outros só abrem as automações.', () =>
      caixa('Administradores', '', `<div class="linhas">${V.admins.map(([i, n, l, d]) => `<div class="linha"><span class="inicial">${i}</span><div class="nome"><b>${n}</b><small>${l}, ${d}</small></div><button class="btn texto" type="button">Remover</button></div>`).join('')}</div>`)
      + caixa('Adicionar administrador', 'Escolha uma pessoa do GLPI ou informe o login de quem não aparece na lista.', `<div class="duas"><div class="campo"><label for="pessoa">Pessoa</label><input class="input" id="pessoa" placeholder="Buscar pessoa"></div><div class="campo"><label for="login">Login do GLPI</label><input class="input" id="login"></div></div>${salvar('Adicionar administrador')}`)],
    historico: ['Histórico', 'Tudo o que muda pela administração e pelo cadastro de automações.', () =>
      caixa('Alterações', 'Quem fez, quando e o que estava antes e depois. As mais recentes primeiro.', tabela(['Quando', 'Pessoa', 'Ação', 'Alterações'], V.historico.map((h) => `<tr><td class="num">${h[0]}</td><td>${h[1]}</td><td>${h[2]}</td><td class="faint">${h[3]}</td></tr>`), 'tabela-linhas') + '<div class="barra rodape"><button class="btn" type="button">Carregar mais</button></div>')],
    automacoes: ['Automações', 'Quem gerencia, como o endereço aparece, quem vê cada automação e a ordem no painel.', () =>
      caixa('Acesso e endereço', 'Quem gerencia as automações e o que os outros veem.', `<div class="campo"><span class="rot">Quem pode cadastrar, editar e remover</span><div class="opcoes">${opcao('Só administradores (recomendado)', 'Os outros só abrem as automações.', true)}${opcao('Todo mundo', 'Qualquer pessoa no Hub cadastra, edita, remove e vê o endereço real.', false)}</div></div>
        <div class="campo"><span class="rot">Endereço para quem não gerencia</span><div class="opcoes">${opcao('Mascarado (xxx.xxx.xxx.xxx:4016)', 'Mostra só a porta.', true)}${opcao('Oculto (não aparece)', 'O cartão fica sem endereço.', false)}</div></div>
        ${troca('Abrir em nova aba', 'Quem não gerencia também pode abrir a automação fora do Hub.', false)}${salvar()}`)
      + caixa('Automações cadastradas', 'Quem vê cada automação (nenhum grupo marcado: todos veem) e a ordem no painel.', `<div class="linhas">${V.automacoes.slice(0, 8).map((a, i) => `<div class="linha"><span class="faint num ordem">${i + 1}</span><span class="auto-ic">${icAuto(a, 16)}</span><div class="nome"><b>${a.nome}</b><small>${i === 1 ? 'Grupos: Sistemas, Cadastro' : 'Todos veem'}</small></div><button class="btn texto" type="button">Grupos</button><button class="btn texto" type="button">Editar</button></div>`).join('')}</div>
        <div class="barra rodape"><a class="btn" href="#painel/nova">${ic('mais', 14)}Nova automação</a><span class="esp"></span><button class="btn primario" type="button">Salvar ordem</button></div>`)],
    ia: ['IA local', 'Ligar e desligar, treinar e escolher como a IA ajuda nos chamados.', () =>
      caixa('Situação', '', `<div class="troca"><div><b>IA ligada</b><p>Modelo do dia a dia ${V.ia.modelo}; revisão com ${V.ia.revisao}.</p></div><button class="btn" type="button">Desligar IA</button></div>`)
      + caixa('Treino', '', `<dl class="pares">${[['Modelo treinado', V.ia.treinadoEm], ['Chamados no treino', nf(V.ia.exemplos)], ['Acerto (validação cruzada)', nf(V.ia.acerto * 100, 1) + '%'], ['Última exportação', '18/10 01:40']].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl><div class="barra rodape"><button class="btn" type="button">Exportar do GLPI e treinar</button><button class="btn texto" type="button">Treinar de novo</button><span class="esp"></span><a class="btn texto" href="#admin/ia">Abrir auditoria</a></div>`)
      + caixa('Como a IA age', '', `<div class="duas"><div class="campo"><label for="conf">Confiança mínima (0,5 a 1)</label><input class="input" id="conf" value="0,8"></div><div class="campo"><label for="tent">Tentativas automáticas (1 a 5)</label><input class="input" id="tent" value="2"></div></div>
        <div class="campo"><span class="rot">Tipos que rodam no automático com a validação da IA</span><div class="chips">${V.porTipo.map((t, i) => `<button class="opcao-chip" type="button" aria-pressed="${i < 3}">${t[0]}</button>`).join('')}</div></div>
        ${troca('Responder a mensagem com o texto da IA', '', false)}${troca('Explicar na conversa quando faltar algo', '', true)}${salvar()}`)],
    revisao: ['Revisão da IA', 'A IA local revisa todos os chamados; você decide as divergências.', () =>
      caixa('Revisão de todos', '', `<div class="kpis">${kpi('Revisados', nf(V.ia.exemplos))}${kpi('Divergências', nf(V.ia.divergencias))}${kpi('Decididos por pessoas', nf(V.ia.decididas))}</div><div class="barra rodape"><button class="btn primario" type="button">Continuar a revisão</button><button class="btn texto" type="button">Atualizar divergências</button></div>`)
      + caixa('Decidir divergência', '#13859 Erro ao exportar card (Valle)', `<dl class="pares"><dt>Regras de hoje</dt><dd>Erro ao exportar modelo</dd><dt>IA local</dt><dd>Cadastro de modelo, confiança de 71%</dd><dt>Resultado real da automação</dt><dd>Não rodou</dd></dl><div class="barra rodape"><button class="btn" type="button">Regras de hoje</button><button class="btn" type="button">IA local</button><button class="btn texto" type="button">Outro tipo…</button><span class="esp"></span><button class="btn texto" type="button">Pular</button></div>`)],
    whatsapp: ['Configuração', 'Grupos, números, conversa privada e reações do robô do WhatsApp.', () =>
      caixa('Funcionamento', 'Liga o robô e define como o chamado é aberto.', `${troca('Automação do WhatsApp ligada', '', true)}<div class="campo"><span class="rot">Modo de funcionamento</span><div class="opcoes">${opcao('Só observado', 'Lê e registra, sem abrir chamado.', false)}${opcao('Ativa (recomendado)', 'Abre o chamado e reage na mensagem.', true)}</div></div>
        <div class="campo"><span class="rot">Como o chamado é aberto</span><div class="opcoes">${opcao('Pela fila do Chamados automático', 'Abre com o token de quem está com o automático ligado.', true)}${opcao('Só abrir o chamado, 24 horas (token de serviço)', 'Abre com o usuário de serviço do GLPI.', false)}</div></div>`)
      + caixa('Números (chips)', 'Os números do WhatsApp que o robô usa.', `<div class="duas"><div class="campo"><label for="chip">Nome (ex.: Chip dedicado)</label><input class="input" id="chip" value="Chip dedicado"></div><div class="campo"><label for="tel">Telefone com DDI e DDD (pode ficar vazio)</label><input class="input" id="tel" value="+55 62 9 ****-1290"></div></div>`)
      + caixa('Grupos atendidos', '', `<div class="linhas">${[['Cadastro Ancore', 'Ancore', 'Cadastro de consultor, Alterar senha do SGA'], ['Comercial Valle', 'Valle', 'Inativação de consultor']].map(([g, c, t]) => `<div class="linha"><div class="nome"><b>${g}</b><small>Categoria do chamado no GLPI: ${c}. Tipos de solicitação deste grupo: ${t}.</small></div><span class="pill pos">Grupo ativo</span><button class="btn texto" type="button">Remover grupo</button></div>`).join('')}</div><div class="barra rodape"><input class="input" placeholder="Nome do grupo" aria-label="Nome do grupo"><input class="input" placeholder="Identificador (opcional)" aria-label="Identificador (opcional)"><button class="btn" type="button">Adicionar</button></div>`)
      + caixa('Quem pode pedir e reações', '', `<div class="campo"><label for="tels">Telefones autorizados</label><textarea class="input" id="tels" placeholder="Um telefone por linha, com DDI e DDD"></textarea><span class="dica">Vazio = qualquer pessoa dos grupos acima.</span></div>
        ${troca('Reagir às mensagens', '', true)}<div class="campo"><span class="rot">O que cada reação significa</span><dl class="pares">${[['Na fila', 'espera alguém abrir o chamado'], ['Chamado aberto', 'em andamento'], ['Concluído', 'chamado solucionado'], ['Deu erro', 'o motivo aparece em Pedidos recentes'], ['Sem vínculo', 'o telefone não está ligado a ninguém']].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></div>`)
      + caixa('Conversa privada com o robô', '', `${troca('Atender no privado', '', true)}<div class="campo"><span class="rot">Tipos atendidos no privado (nenhum marcado = todos)</span><div class="chips">${V.porTipo.slice(0, 4).map((t) => `<button class="opcao-chip" type="button" aria-pressed="false">${t[0]}</button>`).join('')}</div></div>
        <div class="campo"><label for="catp">Categorias que a pessoa pode escrever (o nome pode vir sem espaço ou acento)</label><input class="input" id="catp" value="Ancore, Valle, Unik"></div>${troca('Responder na conversa', '', true)}${troca('Resposta no grupo quando o chamado for solucionado', '', true)}${salvar('Salvar WhatsApp')}`)],
    vinculos: ['Vínculos', 'Telefones ligados a usuários do GLPI.', () =>
      caixa('Vínculos', '', tabela(['Telefone', 'Pessoa no GLPI', 'Grupo', ''], V.vinculos.map(([t, p, g]) => `<tr><td class="num">${t}</td><td>${p}</td><td>${g}</td><td class="dir"><button class="btn texto" type="button">Remover</button></td></tr>`), 'tabela-linhas'))
      + caixa('Novo vínculo', '', `<div class="duas"><div class="campo"><label for="vt">Telefone com DDD</label><input class="input" id="vt"></div><div class="campo"><label for="vp">Usuário do GLPI</label><input class="input" id="vp" placeholder="Escolha o usuário do GLPI"></div></div>${salvar('Salvar vínculo')}`)],
    conexao: ['Conexão e pedidos', 'Situação do robô, mensagens recebidas e pedidos recentes.', () =>
      caixa('Situação do robô', '', `<div class="troca"><div><b>Esperando o pareamento</b><p>Leia o QR code com o celular do chip dedicado.</p></div><div class="qr" role="img" aria-label="QR code para conectar o WhatsApp"><span class="faint" style="color:#000;font-size:11px;grid-column:1/-1;align-self:center;text-align:center">QR code aparece aqui</span></div></div>`)
      + caixa('Pedidos recentes', 'As últimas 100, inclusive as ignoradas, com o que a IA local achou de cada uma.', tabela(['Quando', 'Grupo', 'Pessoa', 'Mensagem', 'Situação', 'Chamado'], V.pedidos.map(([q, g, p, m, s, c]) => `<tr><td class="num">${q}</td><td>${g}</td><td>${p}</td><td class="faint">${esc(m)}</td><td><span class="pill ${s === 'Concluído' ? 'pos' : s === 'Sem vínculo' ? 'warn' : ''}">${s}</span></td><td class="mono">${c || '<span class="faint">Sem dados</span>'}</td></tr>`), 'tabela-linhas'))],
  };
  function admin(pagina = 'cofre') {
    if (!PAGINAS[pagina]) pagina = 'cofre';
    const [h1, sub, corpo] = PAGINAS[pagina];
    return `<div class="admin">
      <select class="input admin-escolha" aria-label="Seção da administração" onchange="location.hash = 'admin/' + this.value">${GRUPOS.map(([g, itens]) => `<optgroup label="${g}">${itens.map(([k, n]) => `<option value="${k}" ${k === pagina ? 'selected' : ''}>${n}</option>`).join('')}</optgroup>`).join('')}</select>
      <nav class="admin-menu" aria-label="Seções da administração">${GRUPOS.map(([g, itens]) => `<p class="grupo">${g}</p>${itens.map(([k, n]) => `<a class="nav" href="#admin/${k}" ${k === pagina ? 'aria-current="page"' : ''}>${n}</a>`).join('')}`).join('')}</nav>
      <div class="admin-pagina">${titulo(h1, sub)}${corpo()}</div></div>`;
  }

  // ---------- Meus acessos e Abrir chamado (janelas sobre o Painel) ----------
  const acessos = () => painel() + dialogo('Meus acessos', `<p class="faint">Ficam cifrados neste navegador. As automações recebem daqui os logins de cada empresa.</p>
    ${caixa('Logins do SGA', '', `<div class="linhas">${[['carla.menezes', 'Ancore, Ancore Máquinas, Ancore Dourados'], ['carla.valle', 'Valle, Unik, Speed']].map(([u, e]) => `<div class="linha"><div class="nome"><b>${u}</b><small>${e}</small></div><button class="btn texto" type="button">Editar</button></div>`).join('')}</div><div class="barra rodape"><button class="btn" type="button">${ic('mais', 14)}Adicionar login do SGA</button></div>`)}
    ${caixa('PowerCRM', '', '<div class="duas"><div class="campo"><label for="ce">E-mail do PowerCRM</label><input class="input" id="ce" value="carla@arx.com.br"></div><div class="campo"><label for="cs">Senha do PowerCRM</label><input class="input" id="cs" type="password" value="12345678"></div></div>')}
    ${caixa('Senha padrão dos novos usuários', '', '<div class="campo"><input class="input" type="password" value="12345678" aria-label="Senha padrão"></div>')}
    ${caixa('Token do GLPI', '', '<div class="campo"><input class="input mono" type="password" value="xxxxxxxxxxxxxxxx" aria-label="User-Token do GLPI"><span class="dica">O chamado sai com o seu token.</span></div>')}`,
    '<button class="btn texto" type="button">Travar agora</button><button class="btn texto" type="button">Trocar senha mestra</button><span class="esp"></span><button class="btn primario" type="button">Salvar</button>');
  const glpi = () => painel() + dialogo('Chamado no GLPI', `${seg('Chamado', ['Novo chamado', 'Meus chamados'], 'Novo chamado')}
    <p class="faint">Abre na entidade Sistemas com o seu usuário do GLPI.</p>
    <div class="campo"><label for="gc">Categoria</label><select class="input" id="gc"><option>Sem categoria</option><option>Ancore</option><option>Valle</option></select></div>
    <div class="duas"><div class="campo"><label for="gr">Requerente</label><input class="input" id="gr" placeholder="Buscar pessoa"><span class="dica">Vazio: você mesmo.</span></div><div class="campo"><label for="ga">Atribuído a</label><input class="input" id="ga" placeholder="Buscar pessoa"><span class="dica">Vazio: fila da equipe.</span></div></div>
    <div class="campo"><label for="gt">Título</label><input class="input" id="gt" placeholder="Ex.: Erro ao bloquear usuário"></div>
    <div class="campo"><label for="gd">Descrição</label><textarea class="input" id="gd" placeholder="Conte o que aconteceu e o que já tentou. Cole um print aqui (Ctrl+V)."></textarea></div>
    <div class="campo"><span class="rot">Fotos e documentos (opcional)</span><label class="soltar">Arraste aqui, cole um print ou <span class="btn">escolha arquivos</span><input type="file" class="sr" multiple></label><span class="dica">Fotos, PDF, Word, Excel ou PowerPoint. Até 5 arquivos de 10 MB.</span></div>`,
    '<a class="btn texto" href="#painel">Cancelar</a><span class="esp"></span><button class="btn primario" type="button">Abrir chamado</button>');

  // ---------- telas das automações (o layout que o Hub aplica nelas) ----------
  const loginHub = (rot) => `<div class="hub-acesso"><span class="pill pos">Acesso do Hub</span><span class="faint">${rot}</span><button class="btn texto" type="button">Usar outro login</button></div>`;
  const empresasSga = ['Ancore', 'Ancore Máquinas', 'Ancore Dourados', 'Valle', 'Unik', 'Coopera Truck', 'Tech Protege', 'Exodo', 'Speed', 'Royale'];
  const marcas = (marcadas) => `<div class="campo"><div class="rot-linha"><span class="rot">Empresas</span><button class="btn texto" type="button">Selecionar todas</button></div><div class="marcas">${empresasSga.map((n, i) => `<label><input type="checkbox" ${marcadas.includes(i) ? 'checked' : ''}>${n}</label>`).join('')}</div></div>`;
  const andamento = (passos) => `<section class="cartao c12" aria-labelledby="t-and"><header><h2 id="t-and">Andamento</h2><span class="pill">Aguardando início</span></header><ol class="passos">${passos.map((p) => `<li>${p}</li>`).join('')}</ol><details class="tecnico"><summary>Detalhes técnicos da execução</summary><pre class="log">Aguardando início.</pre></details></section>`;
  const abasAuto = (id, abas, atual) => `<nav class="tabs" role="tablist" aria-label="Seções da automação">${abas.map(([k, n, qtd]) => `<a role="tab" href="#a/${id}/${k}" aria-selected="${k === atual}">${n}${qtd != null ? ` <span class="n">${qtd}</span>` : ''}</a>`).join('')}</nav>`;
  const cabAuto = (a, h1, sub) => `<div class="titulo"><div><h1><span class="auto-ic">${icAuto(a, 22)}</span>${h1} ${status(a)}</h1><p class="sub">${sub}</p></div></div>`;

  function altStatus(aba = 'exec') {
    const a = V.automacoes.find((x) => x.id === '9');
    const res = [['123.456.789-09', 'Ancore', 'SGA', 'Inativado', 'Situação mudada para Inativo'], ['123.456.789-09', 'Ancore', 'PowerCRM', 'Bloqueado', ''], ['JULIANA PRADO', 'Valle', 'SGA', 'Erro', 'CPF não encontrado no SGA']];
    return cabAuto(a, 'Bloqueio e ativação de usuário', 'Bloqueia ou ativa usuários no SGA e no PowerCRM, nas empresas marcadas, uma de cada vez.')
      + abasAuto('9', [['exec', 'Executar'], ['res', 'Resultado', res.length]], aba)
      + (aba === 'res' ? `<section class="cartao" aria-labelledby="t-res"><header><h2 id="t-res">Resultado</h2><button class="btn texto" type="button">Baixar planilha</button></header>${tabela(['CPF, nome ou usuário', 'Empresa', 'Sistema', 'Status', 'Detalhe'], res.map(([c, e, s, st, d]) => `<tr><td class="num">${c}</td><td>${e}</td><td>${s}</td><td><span class="pill ${st === 'Erro' ? 'neg' : 'pos'}">${st}</span></td><td class="faint">${d || '<span class="faint">Sem dados</span>'}</td></tr>`), 'tabela-linhas')}</section>`
      : `<div class="grade">
      ${sec('c8', 'quem', 'O que fazer', '', `<div class="campo"><span class="rot">Ação</span><div class="opcoes">${opcao('Bloquear e inativar', 'Inativa no SGA e bloqueia no PowerCRM.', true)}${opcao('Ativar e desbloquear', 'Ativa no SGA e libera no PowerCRM.', false)}</div></div>
        <div class="campo"><div class="rot-linha"><span class="rot">CPFs, nomes ou usuários</span>${seg('Origem da lista', ['Colar lista', 'Enviar planilha'], 'Colar lista')}</div><textarea class="input" aria-label="CPFs, nomes ou usuários">123.456.789-09
JULIANA PRADO
rodrigo.salles</textarea><span class="dica">Um CPF, nome ou usuário por linha. A planilha (.xlsx, .xls ou .csv) precisa de uma coluna "CPF", "Nome" ou "Usuário".</span></div>
        ${marcas([0, 1, 2, 3])}
        <div class="campo"><span class="rot">Sistemas</span>${chave('Executar no SGA', true)}${loginHub('2 logins, válidos nas empresas marcadas')}${chave('Executar no PowerCRM', true)}${loginHub('carla@arx.com.br')}</div>`)}
      <section class="cartao c4 lateral" aria-labelledby="t-resumo"><header><h2 id="t-resumo">Resumo</h2></header>
        <dl class="resumo"><dt>Ação</dt><dd class="perigo">Bloquear e inativar</dd><dt>Quem</dt><dd>3 linhas</dd><dt>Empresas</dt><dd>Ancore e mais 3</dd><dt>Sistemas</dt><dd>SGA e PowerCRM</dd></dl>
        <button class="btn primario largo" type="button">Iniciar</button><p class="dica">Os logins vêm de Meus acessos e não ficam gravados.</p></section>
      ${andamento(['Conferindo os dados e os logins', 'Executando', 'Concluído'])}
      ${sec('c12', 'vivo', 'Ao vivo', seg('Sistema', ['SGA', 'PowerCRM'], 'SGA'), '<div class="tela-viva"><span class="faint">Aguardando o início do navegador da automação.</span></div>')}
    </div>`);
  }

  // a foto que a automação gera: quadrado com as iniciais e o departamento em caixa alta
  const retrato = (nome, depto) => {
    const ini = nome.split(' ').map((p) => p[0]).slice(0, 2).join('');
    return `<svg viewBox="0 0 240 240" role="img" aria-label="Foto de perfil de ${esc(nome)}"><rect width="240" height="240" fill="#17864a"/><circle cx="120" cy="104" r="58" fill="#ffffff" opacity=".14"/>
      <text x="120" y="122" text-anchor="middle" font-family="Geist" font-weight="600" font-size="54" fill="#fff">${ini}</text>
      <rect y="190" width="240" height="50" fill="#0f5c33"/><text x="120" y="221" text-anchor="middle" font-family="Geist" font-weight="500" font-size="17" fill="#fff">${esc(depto.toUpperCase())}</text></svg>`;
  };
  function foto(aba = 'exec') {
    const a = V.automacoes.find((x) => x.id === '22');
    const hist = [['Juliana Prado', 'Assistência', 'Hoje 13:58', 'Chamado', '#13855'], ['Marcos Bastos', 'Sinistro', 'Hoje 11:05', 'Manual', ''], ['Helena Duarte', 'Cadastro', 'Hoje 09:40', 'Chamado', '#13840'], ['Otávio Reis', 'Comercial', 'Ontem 17:12', 'Manual', '']];
    return cabAuto(a, 'Gerar foto de perfil', 'Gera a foto de perfil do WhatsApp com o nome e o departamento.')
      + abasAuto('22', [['exec', 'Executar'], ['res', 'Resultado'], ['hist', 'Histórico', hist.length]], aba)
      + (aba === 'hist' ? `<section class="cartao" aria-labelledby="t-hist"><header><h2 id="t-hist">Histórico de execuções</h2><button class="btn texto" type="button">${ic('recarregar', 14)}Atualizar</button></header>
          ${tabela(['Foto', 'Nome', 'Quando', 'Origem', '<span class="sr">Ações</span>'], hist.map(([n, d, q, o, c]) => `<tr><td><div class="miniatura">${retrato(n, d)}</div></td><td>${n}<small>${d.toUpperCase()}</small></td><td class="num">${q}</td><td>${o}${c ? ` <span class="mono faint">${c}</span>` : ''}</td><td class="dir"><button class="btn texto" type="button">Baixar</button><button class="btn texto" type="button">Usar de novo</button></td></tr>`), 'tabela-linhas')}</section>`
      : aba === 'res' ? `<section class="cartao" aria-labelledby="t-r"><header><h2 id="t-r">Resultado</h2></header><p class="vazio">O resultado aparece aqui quando a execução terminar.</p></section>`
      : `<div class="grade">
      ${sec('c8', 'dados', 'Dados da foto', seg('Quantidade', ['Uma pessoa', 'Várias pessoas'], 'Uma pessoa'), `<div class="campo"><label for="nome">Nome (primeiro e último)</label><input class="input" id="nome" placeholder="Ester Dias" value="Juliana Prado"></div>
        <div class="campo"><label for="depto">Departamento</label><input class="input" id="depto" placeholder="Qualidade" value="Assistência"><span class="dica">O departamento é exibido em caixa alta e, se for extenso, quebra em duas linhas. A Assistência usa "ANALISTA 4" (o número) no lugar do nome. Nos chamados do GLPI, o departamento vem do nome do solicitante e o nome vem do texto do chamado.</span></div>
        <div class="barra rodape"><button class="btn primario" type="button">Gerar foto</button></div>`)}
      ${sec('c4 lateral', 'previa', 'Prévia', '<span class="meta">Muda enquanto você digita</span>', `<div class="foto">${retrato('Juliana Prado', 'Assistência')}</div>`)}
      ${andamento(['Montando a foto', 'Gerando o arquivo', 'Concluído'])}
    </div>`);
  }
  function relatorios(aba = 'exec') {
    const a = V.automacoes.find((x) => x.id === '15');
    const arquivos = [['Ancore', '10/2026', 'Concluído', 'boletos-ancore-2026-10.xlsx'], ['Valle', '10/2026', 'Concluído', 'boletos-valle-2026-10.xlsx'], ['Unik', '10/2026', 'Erro', 'Login recusado: token expirado']];
    const hist = [['Hoje 12:00', 'Boletos', 'Ancore, Valle, Unik', 'Concluída'], ['Hoje 07:30', 'Fotografia de Veículos', 'Ancore', 'Concluída'], ['Ontem 16:05', 'Veículos', 'Coopera Truck', 'Concluída']];
    const campos = ['Nome', 'CPF/CNPJ', 'Matrícula Associado', 'Cod. Veículo', 'Modelo', 'Montadora', 'Tipo Veículo', 'Categoria', 'Qtde Parcela Carnê', 'Mês Final Carnê', 'Agregado', 'Id Externo'];
    return cabAuto(a, 'Relatórios SGA', 'Extrai relatórios do SGA de várias empresas e gera um arquivo por empresa.')
      + abasAuto('15', [['exec', 'Executar'], ['res', 'Resultado', arquivos.length], ['hist', 'Histórico', hist.length]], aba)
      + (aba === 'hist' ? `<section class="cartao" aria-labelledby="t-hr"><header><h2 id="t-hr">Histórico de relatórios</h2>${chave('Mostrar apenas as execuções deste navegador', false)}</header>${tabela(['Quando', 'Relatório', 'Empresas', 'Situação'], hist.map((h) => `<tr><td class="num">${h[0]}</td><td>${h[1]}</td><td>${h[2]}</td><td><span class="pill pos">${h[3]}</span></td></tr>`), 'tabela-linhas')}</section>`
      : aba === 'res' ? `<div class="grade">${sec('c12', 'arq', 'Arquivos', '', tabela(['Empresa', 'Mês ou data', 'Status', 'Arquivo ou detalhe'], arquivos.map(([e, m, s, f]) => `<tr><td>${e}</td><td class="num">${m}</td><td><span class="pill ${s === 'Erro' ? 'neg' : 'pos'}">${s}</span></td><td class="${s === 'Erro' ? 'faint' : 'mono'}">${f}</td></tr>`), 'tabela-linhas'))}
          ${sec('c12', 'wpp', 'Mensagens para o WhatsApp', '<button class="btn texto" type="button">Copiar</button>', '<pre class="log">Boletos em aberto de outubro: Ancore 1.284, Valle 806. Unik não gerou: login recusado.</pre>')}</div>`
      : `<div class="grade">
      ${sec('c8', 'rel', 'Relatório, período e campos', '', `${marcas([0, 3, 4])}<div class="campo"><span class="rot">Login do SGA</span>${loginHub('2 logins, válidos nas empresas marcadas')}</div>
        <div class="campo"><label for="rt">Relatório</label><select class="input" id="rt"><option>Boletos</option><option>Fotografia de Boletos</option><option>Veículos</option><option>Fotografia de Veículos</option></select></div>
        <div class="duas"><div class="campo"><label for="de">De</label><input class="input" id="de" type="date" value="2026-10-01"></div><div class="campo"><label for="ate">Até</label><input class="input" id="ate" type="date" value="2026-10-31"></div></div>
        <div class="campo"><span class="rot">Situação do boleto</span><div class="chips">${['Aberto', 'Baixado', 'Baixado com pendência', 'Cancelado'].map((s, i) => `<button class="opcao-chip" type="button" aria-pressed="${i === 0}">${s}</button>`).join('')}</div></div>
        <div class="duas"><div class="campo"><label for="tb">Tipo de boleto</label><select class="input" id="tb"><option>Todos</option><option>Mensalidade</option><option>Adesão</option></select></div><div class="campo"><label for="coop">Cooperativa</label><select class="input" id="coop"><option>Todas</option><option>Ancore Matriz</option></select></div></div>
        ${chave('Recorrente', false)}
        <div class="campo"><label for="vc">Valor do cálculo (R$)</label><input class="input" id="vc" inputmode="decimal" placeholder="0,00"></div>
        <div class="campo"><div class="rot-linha"><span class="rot">Dados visualizados</span><span><button class="btn texto" type="button">Padrão</button><button class="btn texto" type="button">Limpar</button></span></div><div class="marcas">${campos.map((c, i) => `<label><input type="checkbox" ${i < 8 ? 'checked' : ''}>${c}</label>`).join('')}</div><span class="dica">8 de 224 campos marcados.</span></div>
        <div class="campo"><span class="rot">Modo de execução</span><div class="opcoes">${opcao('Sem tela (headless)', 'Executa em segundo plano, com acompanhamento em miniatura ao vivo no canto da tela.', true)}${opcao('Tela ao vivo (VNC)', 'Navegador completo, com interação permitida. Apenas uma execução por vez.', false)}</div></div>`)}
      <section class="cartao c4 lateral" aria-labelledby="t-antes"><header><h2 id="t-antes">Resumo</h2></header>
        <dl class="resumo"><dt>Relatório</dt><dd>Boletos</dd><dt>Período</dt><dd>01/10 a 31/10/2026</dd><dt>Empresas</dt><dd>Ancore, Valle e Unik</dd><dt>Campos</dt><dd>8 de 224</dd></dl>
        <button class="btn primario largo" type="button">Iniciar</button><p class="dica">Gera um arquivo por empresa, com a data no nome.</p></section>
      ${andamento(['Entrando no SGA de cada empresa', 'Gerando os relatórios', 'Concluído'])}
    </div>`);
  }

  // ---------- rotas ----------
  const AUTOS = { 9: altStatus, 22: foto, 15: relatorios };
  function rota() {
    const p = (location.hash.slice(1) || 'painel').split('/');
    if (p[0] === 'a' && AUTOS[p[1]]) { const nome = V.nomeAuto(p[1]); return { chave: 'a/' + p[1], nome, trilha: `<span>Automações</span><span>/</span><b>${nome}</b>`, html: AUTOS[p[1]](p[2]) }; }
    if (p[0] === 'chamados') return { chave: 'chamados', nome: 'Chamados', html: chamados(p[1] || 'todos', p[2], p[3]) };
    if (p[0] === 'resultados') return { chave: 'resultados', nome: 'Resultados', html: resultados(p[1]) };
    if (p[0] === 'admin') return { chave: 'admin', nome: 'Administração', html: admin(p[1]) };
    if (p[0] === 'acessos') return { chave: 'painel', nome: 'Meus acessos', html: acessos() };
    if (p[0] === 'glpi') return { chave: 'painel', nome: 'Abrir chamado', html: glpi() };
    return { chave: 'painel', nome: 'Painel', html: painel(p[1]) };
  }
  // os gráficos são desenhados uma vez e o mesmo nó volta a cada visita (desenhar de novo deixaria observadores para trás)
  const graficos = {};
  const GRAFICOS = {
    'g-dia': (el) => Charts.diverging(el.querySelector('.chart'), { labels: V.dias, up: V.resolvidosDia, down: V.errosDia, above: 'Resolvidos', below: 'Com erro', height: 220, xAt: [0, 7, 14, 21], legend: el.querySelector('.legenda') }),
    'g-hora': (el) => Charts.bars(el, { labels: V.porHora.map((_, h) => h + 'h'), values: V.porHora, height: 180, xAt: [6, 9, 12, 15, 18, 21] }),
    'g-fora': (el) => Charts.bars(el, { labels: Array.from({ length: 30 }, (_, i) => `${String(((i + 22) % 30) + 1).padStart(2, '0')}`), values: Array.from({ length: 30 }, (_, d) => +(V.servicos.reduce((s, [, f]) => s + f[d], 0) / 60).toFixed(1)), height: 180, format: (v) => nf(v, 1) + ' h', xAt: [0, 7, 14, 21, 29], colour: getComputedStyle(document.documentElement).getPropertyValue('--negative').trim() }), // taste-skill-ignore: dia do mês
  };
  function desenhar() {
    const r = rota();
    document.getElementById('raiz').innerHTML = moldura(r.chave === 'painel' && /^#(acessos|glpi)/.test(location.hash) ? 'painel' : (location.hash.slice(1) || 'painel'), r.trilha || `<b>${r.nome}</b>`, r.html);
    document.title = 'ARX ' + r.nome;
    for (const [id, desenha] of Object.entries(GRAFICOS)) {
      const vaga = document.getElementById(id);
      if (!vaga) continue;
      if (graficos[id]) vaga.replaceWith(graficos[id]);
      else { graficos[id] = vaga; desenha(vaga); }
    }
    if (!/\/ver\//.test(location.hash)) window.scrollTo(0, 0);
  }
  addEventListener('hashchange', desenhar);
  addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && document.querySelector('.veu')) history.back(); });
  desenhar();
})();
