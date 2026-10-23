// ARX Hub v1: só visual. Cada rota (#painel, #chamados, #resultados, #admin, #a/<id>) desenha uma tela a partir de
// dados.js; nenhum botão chama servidor.
(() => {
  const V = window.V1;
  const nf = (v, d = 0) => Charts.fmt.dec(d)(v); // o formatador do charts.js segue o <html lang="pt-BR">
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ICONE = {
    painel: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    chamados: '<path d="M4 4h16v12H8l-4 4z"/>',
    resultados: '<path d="M3 3v18h18"/><path d="M8 17v-5M13 17V8M18 17v-9"/>',
    admin: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    robo: '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 4v4M9 13h.01M15 13h.01"/>',
    ajuda: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5V14M12 17h.01"/>',
    chave: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    escolher: '<path d="m7 10 5-5 5 5M7 14l5 5 5-5"/>',
  };
  const ic = (n, t = 16) => `<svg viewBox="0 0 24 24" width="${t}" height="${t}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONE[n]}</svg>`;
  // a marca: um escudo (proteção veicular) com o traço de "concluído", no verde da ARX
  const MARCA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 4 5.5v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10v-6z" fill="#17864a"/><path d="m8.2 12.2 2.6 2.6 5-5.2" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const ABERTAS = ['alt-usuario', 'foto', 'relatorios'];
  const nomeRobo = (id) => V.robos.find((r) => r.id === id).nome;
  const LINHAS = 7; // Robôs hoje e Fila do GLPI mostram o mesmo número de linhas: os dois painéis da fileira terminam juntos
  const situacao = {
    // [selo, texto, ação da linha em Chamados]
    pronto: ['pos', 'Pronto para rodar', '<button class="btn" type="button">Rodar</button>'],
    escolher: ['warn', 'Falta escolher', '<button class="btn texto" type="button">Escolher</button>'],
    manual: ['', 'Só manual', '<button class="btn texto" type="button">Conferir e rodar</button>'],
    erro: ['neg', 'Com erro', '<button class="btn" type="button">Rodar de novo</button>'],
    analise: ['', 'Análise manual', ''], resolvido: ['pos', 'Solucionado', ''],
  };
  const minutos = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
  const posDia = (h) => ((minutos(h) - 420) / 720) * 100; // 07:00 a 19:00
  const sec = (classe, id, h2, extra, corpo) => `<section class="painel ${classe}" aria-labelledby="t-${id}"><header><h2 id="t-${id}">${h2}</h2>${extra}</header>${corpo}</section>`;

  // ---------- moldura ----------
  function moldura(rota, conteudo) {
    const nav = (href, icone, rot, extra = '') => `<a class="nav" href="#${href}" ${rota === href ? 'aria-current="page"' : ''}>${ic(icone)}<span>${rot}</span>${extra}</a>`;
    const prontos = V.conta('pronto');
    return `<div class="app">
  <nav class="sidebar" id="menu" aria-label="Navegação">
    <div class="marca">${MARCA}<span>ARX Hub</span></div>
    <a class="escopo" href="#admin" title="Trocar a entidade do GLPI"><span>Sistemas</span><span aria-hidden="true">${ic('escolher', 14)}</span></a>
    ${nav('painel', 'painel', 'Painel')}
    ${nav('chamados', 'chamados', 'Chamados', prontos ? `<span class="conta acao">${prontos} pronto</span>` : '')}
    ${nav('resultados', 'resultados', 'Resultados')}
    ${nav('admin', 'admin', 'Administração')}
    <p class="grupo">Abertas agora</p>
    ${ABERTAS.map((id) => nav('a/' + id, 'robo', nomeRobo(id))).join('')}
    <div class="fim">
      ${nav('ajuda', 'ajuda', 'Tutoriais em vídeo')}
      <div class="pessoa"><span class="inicial">CM</span><div>Carla Menezes<small>Administradora do Hub</small></div></div>
    </div>
  </nav>
  <header class="topo">
    <button class="btn texto menu-toggle" type="button" aria-controls="menu" aria-label="Abrir o menu" onclick="document.getElementById('menu').classList.toggle('aberta')">${ic('menu', 18)}</button>
    <div class="abas-abertas" role="list" aria-label="Automações abertas">
      ${ABERTAS.map((id) => [id, nomeRobo(id)]).map(([id, n]) => `<a class="aba" role="listitem" href="#a/${id}" ${rota === 'a/' + id ? 'aria-current="page"' : ''}><span class="ponto" aria-hidden="true"></span>${n}<span class="fechar" title="Fechar ${n}">${ic('x', 12)}</span></a>`).join('')}
    </div>
    <div class="direita">
      <label class="busca">${ic('busca', 14)}<span>Buscar automação ou chamado</span><kbd>Ctrl K</kbd></label>
      <a class="btn" href="#admin">${ic('chave', 14)}Meus acessos</a>
    </div>
  </header>
  <main class="folha"><div class="canvas">${conteudo}</div></main>
</div>`;
  }
  const titulo = (trilha, h1, sub, acoes = '') => `${trilha ? `<nav class="trilha" aria-label="Trilha">${trilha}</nav>` : ''}
  <div class="titulo"><div><h1>${h1}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div><div class="acoes">${acoes}</div></div>`;
  const kpi = (rot, valor, delta = '', classe = '') => `<div class="kpi"><div class="kpi-label">${rot}</div><div class="kpi-value ${classe}">${valor}</div>${delta ? `<div class="delta">${delta}</div>` : ''}</div>`;

  // ---------- Painel: os robôs estão no ar e a fila do GLPI está andando? ----------
  function painel() {
    const robos = V.robos.filter((r) => !r.banco);
    const banco = V.robos.filter((r) => r.banco);
    const linhaRobo = (r) => {
      const falhas = V.falhas(r).length;
      return `<a class="linha" href="#a/${r.id}"><div class="nome"><b>${r.nome}</b><small>${r.sistemas.join(' e ')}</small></div>
        <div class="dia" role="img" aria-label="${r.runs.length} execuções hoje${falhas ? `, ${falhas} com erro` : ''}">
          ${r.runs.map(([h, ok]) => `<i class="${ok ? '' : 'falha'}" style="left:${posDia(h)}%" title="${h} ${ok ? 'concluída' : 'com erro'}"></i>`).join('')}
          <span class="agora" style="left:${posDia(V.agora)}%"></span></div>
        <span class="qtd num">${r.runs.length ? nf(r.runs.length) : '<span class="muted">0</span>'}</span></a>`;
    };
    const abertos = V.filtra('todos');
    const senha = V.robos.find((r) => r.id === 'senha');
    const falhasSenha = V.falhas(senha);
    return titulo('<span>ARX Administradora</span><span>/</span><span>Sistemas</span>', 'Painel',
      `Os ${V.robos.length} robôs estão no ar. A fila do GLPI tem ${V.conta('todos')} chamados abertos, ${V.conta('pronto')} pronto para rodar.`,
      `<span class="carimbo">Atualizado às ${V.agora}</span><a class="btn primario" href="#chamados">Rodar prontos (${V.conta('pronto')})</a>`)
    + `<div class="achado" role="status"><span><b>Altera Senha falhou ${falhasSenha.length} vezes hoje</b> entre ${falhasSenha[0][0]} e ${falhasSenha[falhasSenha.length - 1][0]}: o token da Unik no SGA expirou.</span><a class="btn" href="#chamados/erro">Ver o erro</a></div>`
    + `<div class="kpis">${kpi('Robôs no ar', `${V.robos.length}<small>de ${V.robos.length}</small>`, 'Nenhum fora do ar nas últimas 24 h')}
      ${kpi('Chamados abertos', nf(V.conta('todos')), `${V.conta('pronto')} pronto, ${V.conta('escolher')} esperando escolha`)}
      ${kpi('Execuções hoje', nf(V.runsHoje), 'Desde as 07:00, contando as manuais')}
      ${kpi('Com erro hoje', nf(V.errosHoje), `${falhasSenha.length} delas no Altera Senha`, 'ruim')}</div>`
    + `<div class="grade">
      ${sec('c8', 'robos', 'Robôs hoje', '<div class="eixo-dia" aria-hidden="true"><span>07:00</span><span>13:00</span><span>19:00</span></div>',
        `<div class="linhas">${robos.slice(0, LINHAS).map(linhaRobo).join('')}</div>
        <p class="rodape"><a class="link" href="#painel">Ver os ${robos.length} robôs</a></p>`)}
      ${sec('c4', 'fila', 'Fila do GLPI', `<span class="meta">${abertos.length} abertos</span>`,
        `<div class="linhas">${abertos.slice(0, LINHAS).map((c) => `<a class="linha" href="#chamados"><div class="nome"><b><span class="mono muted">#${c.id}</span> ${esc(c.titulo)}</b><small>${c.assoc}, aberto há ${c.aberto}</small></div><span class="pill ${situacao[c.sit][0]}">${situacao[c.sit][1]}</span></a>`).join('')}</div>
        <p class="rodape"><a class="link" href="#chamados">Ver os ${abertos.length} chamados</a></p>`)}
      ${sec('c12', 'banco', 'Banco de dados', '<span class="meta">Rotinas da madrugada que alimentam o banco-central</span>',
        `<div class="linhas">${banco.map(linhaRobo).join('')}</div>`)}
    </div>`;
  }

  // ---------- Chamados: o que dá para rodar agora? ----------
  function chamados(aba = 'todos') {
    const lista = V.filtra(aba);
    const detalhe = (c) => c.erro || c.falta || c.motivo || '';
    return titulo('<span>Sistemas</span><span>/</span><span>Fila do GLPI</span>', 'Chamados',
      'Chamados abertos na entidade Sistemas, com o que cada um precisa para rodar.',
      `<label class="troca" style="align-items:center;gap:10px"><input class="chave" type="checkbox" checked aria-label="Modo teste"><span><b>Modo teste</b> <span class="muted">não escreve no GLPI</span></span></label>
       <a class="btn primario" href="#chamados">Rodar prontos (${V.conta('pronto')})</a>`)
    + `<nav class="tabs" role="tablist" aria-label="Situação">${V.ABAS.map(([k, n]) => `<a role="tab" href="#chamados/${k}" aria-selected="${k === aba}">${n} <span class="n">${V.conta(k)}</span></a>`).join('')}</nav>
    <div class="barra"><label class="busca">${ic('busca', 14)}<span>Buscar por número, título ou solicitante</span></label><span class="esp"></span>
      <span class="muted">${lista.length === 1 ? '1 chamado' : lista.length + ' chamados'}</span><select class="input curto" aria-label="Ordem"><option>Mais antigos primeiro</option><option>Mais recentes primeiro</option></select></div>
    ${lista.length ? `<table class="tabela-linhas"><thead><tr><th>Chamado</th><th class="col-media">Tipo</th><th class="col-media">Associação</th><th class="dir col-media">Aberto há</th><th>Situação</th><th class="dir"><span class="sr">Ação</span></th></tr></thead><tbody>
      ${lista.map((c) => `<tr><td><span class="mono muted">#${c.id}</span> ${esc(c.titulo)}<small>${esc(c.quem)}${detalhe(c) ? `, ${esc(detalhe(c))}` : ''}</small></td>
        <td class="col-media">${c.tipo || '<span class="muted">Sem automação</span>'}</td><td class="col-media">${c.assoc}</td><td class="dir num col-media">${c.aberto}</td>
        <td><span class="pill ${situacao[c.sit][0]}">${situacao[c.sit][1]}</span></td>
        <td class="dir">${situacao[c.sit][2]}</td></tr>`).join('')}
    </tbody></table>` : '<p class="vazio">Nenhum chamado nesta situação agora.</p>'}`;
  }

  // ---------- Resultados: quanto os robôs resolveram e onde falham? ----------
  function resultados() {
    const taxa = V.resolvidosMes / V.atendidosMes;
    const tabela = (titulo, sub, cab, linhas, total) => {
      const max = Math.max(...linhas.map((l) => l[1]));
      return `<section class="secao c6"><header><div><h2>${titulo}</h2><p>${sub}</p></div></header>
        <table class="parte"><thead><tr><th>${cab}</th><th class="dir">Parte</th><th class="dir">Qtd.</th></tr></thead><tbody>
        ${linhas.map(([n, v]) => `<tr><td><span class="fundo" style="width:${(v / max) * 100}%"></span><span>${n}</span></td><td class="dir num muted"><span>${nf((v / total) * 100, 1)}%</span></td><td class="dir num"><span>${nf(v)}</span></td></tr>`).join('')}
        </tbody></table></section>`;
    };
    return titulo('', 'Resultados', `Chamados atendidos pelos robôs de 1 a 22 de outubro, fora o modo teste. Tempo economizado é uma estimativa.`,
      `<div class="segmentado" role="group" aria-label="Período"><button aria-pressed="false">Hoje</button><button aria-pressed="false">7 dias</button><button aria-pressed="true">Este mês</button></div>`)
    + `<div class="pilha"><div class="kpis soltos">${kpi('Chamados atendidos', nf(V.atendidosMes))}${kpi('Solucionados', nf(V.resolvidosMes), `${nf(taxa * 100, 1)}% dos atendidos`)}
      ${kpi('Com erro', nf(V.errosMes), 'Voltaram como pendentes', 'ruim')}${kpi('Tempo economizado', `${nf(V.resolvidosMes * 5.4 / 60, 1)}<small>h</small>`, 'Estimativa: minutos por item do cadastro')}
      ${kpi('Tempo médio', '2<small>min</small> 4<small>s</small>', 'Por chamado, do início ao fim')}</div>
    <section class="secao"><header><div><h2>Solucionados por dia</h2><p>O dia 22 é hoje e ainda está em andamento.</p></div></header><div class="chart" id="grafico"></div></section>
    <div class="grade linhas-largas">
      ${tabela('Por tipo de chamado', 'Solucionados de cada tipo.', 'Tipo', V.porTipo.map((t) => [t[0], t[1]]), V.resolvidosMes)}
      ${tabela('Motivos de erro', 'Por que os chamados voltaram como pendentes.', 'Motivo', V.motivosErro, V.errosMes)}
      ${tabela('Por associação', 'Atendidos, pela categoria do chamado no GLPI.', 'Associação', V.porAssoc, V.atendidosMes)}
      ${tabela('Quem rodou', 'Solucionados pela fila automática ou à mão.', 'Pessoa', V.porPessoa, V.resolvidosMes)}
    </div></div>`;
  }

  // ---------- Administração: quem pode o quê e como o Hub se comporta? ----------
  function admin() {
    const troca = (t, d, on) => `<div class="troca"><div><b>${t}</b><p>${d}</p></div><input class="chave" type="checkbox" ${on ? 'checked' : ''} aria-label="${t}"></div>`;
    const ajuste = (t, d, valores, caixa) => `<section class="ajuste"><div><h2>${t}</h2><p>${d}</p>${valores ? `<div class="valores">${valores}</div>` : ''}</div><div class="caixa">${caixa}</div></section>`;
    return titulo('', 'Administração', 'Vale para todo mundo que usa o Hub. Cada caixa salva sozinha.', '<span class="carimbo">Salvo às 14:20 por Carla Menezes</span>')
    + ajuste('Cofre dos acessos', 'Logins do SGA, do PowerCRM e o token do GLPI ficam cifrados no navegador de cada pessoa.',
      '<span>Hoje: senha mestra <b>ligada</b>, trava em <b>15 min</b> parado</span>',
      troca('Pedir senha mestra', 'Sem ela, o cofre abre sozinho neste navegador.', true)
      + `<div class="campo"><span class="rot">Travar depois de</span><div class="segmentado" role="group" aria-label="Travar depois de"><button aria-pressed="false">5 min</button><button aria-pressed="true">15 min</button><button aria-pressed="false">1 hora</button><button aria-pressed="false">Ao fechar a aba</button></div></div>`)
    + ajuste('Administradores', 'Quem vê esta tela. A identidade vem do token do GLPI de cada pessoa.', '<span><b>2</b> administradores</span>',
      `<div class="linhas">${[['CM', 'Carla Menezes', 'Desde 09/10, primeira administradora'], ['RS', 'Rodrigo Salles', 'Adicionado por Carla Menezes em 14/10']].map(([i, n, d]) => `<div class="linha"><span class="inicial">${i}</span><div class="nome"><b>${n}</b><small>${d}</small></div><button class="btn texto" type="button">Remover</button></div>`).join('')}</div>
      <div class="barra rodape"><input class="input" placeholder="Nome completo ou login no GLPI" aria-label="Novo administrador"><button class="btn" type="button">Adicionar</button></div>`)
    + ajuste('Automações', 'Quem cadastra e como o endereço aparece para quem não administra.', '',
      `<div class="campo"><span class="rot">Quem cadastra e edita</span><div class="segmentado" role="group" aria-label="Quem cadastra"><button aria-pressed="true">Só administradores</button><button aria-pressed="false">Todo mundo</button></div></div>
      <div class="campo"><span class="rot">Endereço para quem não administra</span><div class="segmentado" role="group" aria-label="Endereço"><button aria-pressed="true">Mascarado</button><button aria-pressed="false">Oculto</button></div>
      <div class="previa">Assim aparece no card: <span class="mono">xxx.xxx.xxx.xxx:4015</span></div></div>
      ${troca('Abrir em nova aba', 'Quem não administra também pode abrir a automação fora do Hub.', false)}`)
    + ajuste('Robô do WhatsApp', 'Mensagens dos grupos viram chamados no GLPI, com o solicitante vinculado ao telefone.', '<span>Celular <b>não pareado</b></span>',
      `<div class="campo"><span class="rot">Como os chamados são abertos</span><div class="opcoes"><button class="opcao" aria-pressed="true">Fila do Chamados automático<small>Abre com o token de quem está com o automático ligado</small></button><button class="opcao" aria-pressed="false">Só abrir, 24 horas<small>Abre com o usuário de serviço do GLPI</small></button></div></div>
      ${troca('Responder no grupo', 'Reage na mensagem quando o chamado entra na fila, é aberto e é solucionado.', true)}
      <div class="previa">Pareie o celular do chip dedicado em <b>Conexão e pedidos</b> para ligar o robô.</div>`)
    + ajuste('IA local', 'Confere o tipo dos chamados e o texto da resposta. Sem ela, valem só as regras.', '<span>Modelo do dia a dia <b>qwen2.5 1.5B</b></span>',
      troca('Conferir o tipo dos chamados', 'Quando a IA discorda, o chamado vai para Análise manual.', true)
      + troca('Pedir o que falta', 'Responde no GLPI pedindo placa, card ou FIPE quando faltar.', false));
  }

  // ---------- automações ----------
  const cabAuto = (id, sub, acoes) => {
    const r = V.robos.find((x) => x.id === id);
    return titulo(`<a href="#painel">Automações</a><span>/</span><span>${r.sistemas.join(' e ')}</span>`, `${r.nome} <span class="pill pos">No ar</span>`, sub, acoes);
  };
  function altStatus() {
    return cabAuto('alt-usuario', 'Bloqueia ou ativa usuários no SGA e no PowerCRM, em todas as empresas marcadas, uma de cada vez.', '<a class="btn" href="#a/alt-usuario">Histórico</a>')
    + `<div class="grade">
      <section class="painel c8" aria-labelledby="t-o-que"><header><h2 id="t-o-que">O que fazer</h2></header>
        <div class="campo"><span class="rot">Ação</span><div class="opcoes"><button class="opcao" aria-pressed="true">Bloquear e inativar<small>Inativa no SGA e bloqueia no PowerCRM</small></button><button class="opcao" aria-pressed="false">Ativar e desbloquear<small>Ativa no SGA e libera no PowerCRM</small></button></div></div>
        <div class="campo"><label for="pessoas">Pessoas</label><textarea class="input" id="pessoas">123.456.789-09
JULIANA PRADO
RODRIGO SALLES</textarea><span class="dica">Um CPF ou nome por linha. Também aceita colar da planilha.</span></div>
        <div class="campo"><span class="rot">Empresas</span><div class="marcas">${V.empresasSga.map((n, i) => `<label><input type="checkbox" ${i < 4 ? 'checked' : ''}>${n}</label>`).join('')}</div><span class="dica">4 de ${V.empresasSga.length} marcadas. Os logins vêm de Meus acessos.</span></div>
      </section>
      <section class="painel c4" aria-labelledby="t-resumo"><header><h2 id="t-resumo">Antes de iniciar</h2></header>
        <dl class="resumo"><dt>Ação</dt><dd class="perigo">Bloquear e inativar</dd><dt>Pessoas</dt><dd>3</dd><dt>Empresas</dt><dd>Ancore e mais 3</dd><dt>Sistemas</dt><dd>SGA e PowerCRM</dd><dt>Modo teste</dt><dd>Desligado</dd></dl>
        <ol class="passos"><li class="ok">Conferir os dados e os logins</li><li>Executar em cada empresa</li><li>Concluir e guardar o resultado</li></ol>
        <button class="btn primario largo" type="button">Iniciar para 3 pessoas</button></section>
      <section class="painel c12" aria-labelledby="t-ultimas"><header><h2 id="t-ultimas">Últimas execuções</h2><a class="link" href="#a/alt-usuario">Ver todas</a></header>
        <table class="tabela-linhas"><thead><tr><th>Quando</th><th>Quem</th><th class="col-media">Ação</th><th class="col-media">Empresas</th><th class="dir">Resultado</th></tr></thead><tbody>
        ${V.execucoesAlt.map((x) => `<tr><td>${x.quando}<small class="mono">${x.job}</small></td><td>${x.quem}<small>${x.alvo}</small></td><td class="col-media">${x.acao}</td><td class="col-media">${x.empresas}</td>
          <td class="dir">${x.res === 'ok' ? `<span class="pill ${x.teste ? '' : 'pos'}">${x.teste ? 'Teste concluído' : 'Concluída'}</span>` : `<span class="pill neg" title="${esc(x.erro)}">Erro</span>`}</td></tr>`).join('')}
        </tbody></table></section></div>`;
  }

  // retrato desenhado da foto de perfil (a automação gera um quadrado com as iniciais e o departamento)
  const retrato = (nome, depto) => {
    const ini = nome.split(' ').map((p) => p[0]).slice(0, 2).join('');
    return `<svg viewBox="0 0 240 240" role="img" aria-label="Foto de perfil de ${esc(nome)}"><rect width="240" height="240" fill="#17864a"/><circle cx="120" cy="104" r="58" fill="#ffffff" opacity=".14"/>
      <text x="120" y="122" text-anchor="middle" font-family="IBM Plex Sans" font-weight="600" font-size="54" fill="#fff">${ini}</text>
      <rect y="190" width="240" height="50" fill="#0f5c33"/><text x="120" y="221" text-anchor="middle" font-family="IBM Plex Sans" font-weight="500" font-size="17" fill="#fff">${esc(depto)}</text></svg>`;
  };
  function foto() {
    return cabAuto('foto', 'Gera a foto de perfil do WhatsApp com o nome e o departamento, no padrão da ARX.', '<a class="btn" href="#a/foto">Histórico</a>')
    + `<div class="grade">
      <section class="painel c8" aria-labelledby="t-gerar"><header><h2 id="t-gerar">Gerar uma foto</h2><div class="segmentado" role="group" aria-label="Quantidade"><button aria-pressed="true">Uma pessoa</button><button aria-pressed="false">Várias pessoas</button></div></header>
        <div class="campo"><label for="nome">Nome</label><input class="input" id="nome" value="Juliana Prado"></div>
        <div class="campo"><label for="depto">Departamento</label><select class="input" id="depto"><option>Cadastro</option><option>Sinistro</option><option>Assistência</option><option>Comercial</option></select></div>
        <div class="campo"><span class="rot">Chamado do GLPI</span><input class="input mono" value="#13877" aria-label="Chamado do GLPI"><span class="dica">Com o número, a foto vai anexada ao chamado quando terminar.</span></div>
        <div class="barra rodape"><button class="btn primario" type="button">Gerar foto</button><button class="btn" type="button">Baixar sem gerar chamado</button></div></section>
      <section class="painel c4" aria-labelledby="t-previa"><header><h2 id="t-previa">Prévia</h2><span class="meta">Muda enquanto você digita</span></header><div class="foto">${retrato('Juliana Prado', 'Cadastro')}</div></section>
      <section class="painel c12" aria-labelledby="t-hoje"><header><h2 id="t-hoje">Geradas hoje</h2><span class="meta">${V.fotos.length} fotos</span></header>
        <div class="galeria">${V.fotos.map((f) => `<figure><div class="foto">${retrato(f.nome, f.depto)}</div><figcaption><b>${f.nome}</b>${f.depto}, ${f.quando.toLowerCase()}</figcaption></figure>`).join('')}</div></section></div>`;
  }
  function relatorios() {
    return cabAuto('relatorios', 'Extrai relatórios do SGA de várias empresas de uma vez e junta numa planilha só.', '<a class="btn" href="#a/relatorios">Agendados</a>')
    + `<div class="grade">
      <section class="painel c8" aria-labelledby="t-rel"><header><h2 id="t-rel">Relatório</h2></header>
        <div class="campo"><span class="rot">Tipo</span><div class="segmentado" role="group" aria-label="Tipo de relatório"><button aria-pressed="true">Boletos</button><button aria-pressed="false">Veículos</button><button aria-pressed="false">Fotografia de veículos</button><button aria-pressed="false">Fotografia de boletos</button></div></div>
        <div class="duas"><div class="campo"><label for="de">Vencimento de</label><input class="input" id="de" type="date" value="2026-10-01"></div><div class="campo"><label for="ate">Até</label><input class="input" id="ate" type="date" value="2026-10-31"></div></div>
        <div class="campo"><span class="rot">Situação do boleto</span><div class="opcoes"><button class="opcao" aria-pressed="true">Abertos<small>Inclui os vencidos</small></button><button class="opcao" aria-pressed="false">Todos os baixados<small>Baixado e baixado com pendência</small></button></div></div>
        <div class="campo"><span class="rot">Empresas</span><div class="marcas">${V.empresasSga.map((n, i) => `<label><input type="checkbox" ${[0, 3, 4].includes(i) ? 'checked' : ''}>${n}</label>`).join('')}</div></div>
        <div class="campo"><span class="rot">Dados visualizados</span><p>Todos os <b>224</b> campos do SGA. <a class="link" href="#a/relatorios">Escolher campos</a></p></div></section>
      <section class="painel c4" aria-labelledby="t-antes"><header><h2 id="t-antes">Antes de iniciar</h2></header>
        <dl class="resumo"><dt>Relatório</dt><dd>Boletos abertos</dd><dt>Período</dt><dd>1 a 31/10/2026</dd><dt>Empresas</dt><dd>Ancore, Valle e Unik</dd><dt>Cooperativas</dt><dd>Todas</dd><dt>Saída</dt><dd>Uma planilha .xlsx</dd></dl>
        <button class="btn primario largo" type="button">Extrair de 3 empresas</button>
        <p class="dica">Leva uns 4 minutos por empresa. Dá para fechar a aba.</p></section>
      <section class="painel c12" aria-labelledby="t-hist"><header><h2 id="t-hist">Últimas extrações</h2><a class="link" href="#a/relatorios">Ver todas</a></header>
        <table class="tabela-linhas"><thead><tr><th>Quando</th><th>Relatório</th><th class="col-media">Empresas</th><th class="dir">Linhas</th><th class="dir"><span class="sr">Ação</span></th></tr></thead><tbody>
        ${V.relatorios.map((x) => `<tr><td>${x.quando}<small class="mono">${x.job}</small></td><td>${x.tipo}</td><td class="col-media">${x.empresas}</td><td class="dir num">${nf(x.linhas)}</td><td class="dir"><button class="btn texto" type="button">Baixar</button></td></tr>`).join('')}
        </tbody></table></section></div>`;
  }

  // ---------- rotas ----------
  const TELAS = {
    painel: ['Painel', painel], chamados: ['Chamados', chamados], resultados: ['Resultados', resultados], admin: ['Administração', admin],
    'a/alt-usuario': [nomeRobo('alt-usuario'), altStatus], 'a/foto': [nomeRobo('foto'), foto], 'a/relatorios': [nomeRobo('relatorios'), relatorios],
  };
  // o gráfico é desenhado uma vez e o mesmo nó volta a cada visita: desenhar de novo deixaria um ResizeObserver
  // e um ouvinte de fontes para trás a cada ida e volta
  let grafico = null;
  function desenhar() {
    const [base, ...resto] = (location.hash.slice(1) || 'painel').split('/');
    const rota = base === 'a' ? 'a/' + resto[0] : base;
    const chave = TELAS[rota] ? rota : 'painel';
    const [nome, tela] = TELAS[chave];
    document.getElementById('raiz').innerHTML = moldura(chave, tela(resto[0]));
    document.title = 'ARX ' + nome;
    const vaga = document.getElementById('grafico');
    if (vaga && grafico) vaga.replaceWith(grafico);
    else if (vaga) Charts.bars(grafico = vaga, {
      // taste-skill-ignore: o zero à esquerda é de data (01/10), não numeração
      labels: V.dias.map((d) => String(d).padStart(2, '0') + '/10'), values: V.resolvidosDia, highlight: V.dias.length - 1, height: 200,
      xAt: [0, 7, 14, 21],
    });
    window.scrollTo(0, 0);
  }
  addEventListener('hashchange', desenhar);
  desenhar();
})();
