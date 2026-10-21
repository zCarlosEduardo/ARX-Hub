// Réplicas de exemplo das telas das automações (exemplo-automacao.html?a=<chave>&cor=<cor>). Seções, campos, textos de ajuda,
// botões e resultados seguem as telas reais de ARX-Automacoes; os dados são FICTÍCIOS e a execução é simulada.
(function () {
  const D = window.ExemploDados;
  const EMP = D.ASSOCIACOES.map((a) => a.replace('Associação ', ''));
  const BASES = EMP.map((x) => x + ' Proteção');
  const pessoas = (n) => Array.from({ length: n }, () => D.pessoa());
  const linhas = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const sorte = (p) => Math.random() < p;
  const um = (l) => l[Math.floor(Math.random() * l.length)];
  const entre = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const cpf = () => '000.' + entre(100, 999) + '.' + entre(100, 999) + '-' + entre(10, 99);
  const UFS = [['GO', 'Goiânia'], ['GO', 'Anápolis'], ['DF', 'Brasília'], ['MG', 'Uberlândia'], ['MT', 'Cuiabá'], ['TO', 'Palmas'], ['MS', 'Campo Grande'], ['GO', 'Rio Verde']];

  // textos repetidos nas telas reais
  const AJ_LEMBRAR = 'Por padrão, usuário e senha não são salvos e valem apenas durante a execução. Com a opção "Lembrar neste navegador" marcada, os dados ficam guardados somente neste navegador (localStorage), nunca no servidor, e sem criptografia. Use apenas em computador de acesso restrito.';
  const AJ_LOGINS = 'Informe um ou mais logins do SGA e marque as empresas em que cada um é válido. Use mais de um login quando uma senha vale apenas para parte das empresas.';
  const AJ_CRM_HUB = 'Dentro do Hub o login vem preenchido. É usado somente durante a execução e não é gravado no servidor nem neste navegador.';
  const AJ_ACAO = 'A ação vale para os sistemas marcados abaixo. No SGA corresponde a ativar ou inativar; no PowerCRM, a desbloquear ou bloquear.';
  const modoExec = (k) => ({ k: k || 'modo', t: 'radios', rot: 'Modo de execução', valor: 'sem', opcoes: [['sem', 'Sem tela', 'Execução em segundo plano, sem interface visual. Mais rápida, indicada para lotes.'], ['tela', 'Tela ao vivo', 'Exibe o navegador em tempo real abaixo e o mantém aberto para conferência ao final de cada cadastro.']] });
  const loginSga = (extra) => Object.assign({ k: 'loginSga', t: 'login', sistema: 'SGA', rotUsuario: 'Usuário SGA', rotSenha: 'Senha SGA' }, extra || {});
  const loginCrm = (extra) => Object.assign({ k: 'loginCrm', t: 'login', sistema: 'PowerCRM', rotUsuario: 'E-mail do PowerCRM', rotSenha: 'Senha do PowerCRM' }, extra || {});
  const lembrar = { k: 'lembrar', t: 'lembrar' };
  const SITUACOES = { ok: 'Sucesso', aviso: 'Aviso', erro: 'Erro' };

  const DEFS = {
    // ---------------------------------------------------------------- Alterar senha SGA
    'alterar-senha': {
      titulo: 'ARX Alterar senha SGA', icone: 'Key', historico: true, sistemas: ['SGA'],
      sub: 'Altera a senha de usuários no SGA de uma ou mais empresas e informa a senha final aceita em cada uma.',
      secoes: [
        { titulo: 'Empresas e login do SGA', campos: [
          { k: 'empresas', t: 'empresas', rot: 'Empresas', valor: ['Aurora', 'Boreal'], busca: 'Buscar empresa', obrig: true },
          loginSga({ rotUsuario: 'Usuário SGA padrão', rotSenha: 'Senha SGA padrão', ajuda: 'O login padrão vale para as empresas que não têm login do Hub nem login próprio. É usado somente durante a execução e não é gravado no servidor nem neste navegador. Deve ter permissão para alterar senhas de outros usuários.' }),
        ] },
        { titulo: 'Alvos e senha', campos: [
          { k: 'alvos', t: 'area', rot: 'Alvos (uma pessoa por linha, os mesmos em todas as empresas marcadas)', mono: true, obrig: true, placeholder: 'Nome; usuário; CPF; e-mail', valor: pessoas(3).map((n) => n + '; ' + D.login(n) + '; ' + cpf() + '; ' + D.login(n) + '@exemplo.com').join('\n'), ajuda: 'Campos separados por ponto e vírgula. Obrigatórios: nome e, ao menos, usuário ou CPF. O cadastro encontrado no SGA precisa conferir com os dados informados; caso contrário, nada é alterado.' },
          { k: 'base', t: 'senha', rot: 'Senha base', valor: 'Exemplo@2026', obrig: true, ajuda: 'Se o SGA recusar, são tentadas variações em ordem (acréscimo de "!" e de um dígito seguido de "!") até uma ser aceita. A senha aceita aparece no resultado.' },
          { k: 'teste', t: 'check', rot: 'Modo teste: localiza o usuário e preenche a tela de troca com um valor fictício, sem salvar.', valor: true },
        ], iniciar: 'Iniciar' },
      ],
      itens: (v) => v.empresas.flatMap((emp) => linhas(v.alvos).map((l) => { const [nome, usuario] = l.split(';').map((x) => x.trim()); return { nome, usuario, empresa: emp }; })),
      passos: (i) => ['[' + i.empresa + '] Entrando no SGA', '[' + i.empresa + '] Procurando ' + i.nome, '[' + i.empresa + '] Conferindo usuário e CPF', '[' + i.empresa + '] Trocando a senha'],
      resultado: (i, n, v) => {
        if (sorte(0.12)) return { sit: 'erro', texto: 'Não encontrado', detalhe: 'Nenhum cadastro confere com nome e usuário.', tentativas: 0 };
        const t = entre(1, 3);
        return { sit: 'ok', texto: v.teste ? 'Teste: tela preenchida' : 'Senha alterada', senha: v.base + (t > 1 ? '!' : '') + (t > 2 ? '1!' : ''), tentativas: t, detalhe: t > 1 ? 'O SGA recusou ' + (t - 1) + (t === 2 ? ' variação' : ' variações') : '' };
      },
      resultadoTipo: 'senhas',
      avisoResultado: 'As senhas ficam somente na memória do servidor, por até 30 minutos após o término, e nesta página. Copie antes de fechar.',
    },

    // ---------------------------------------------------------------- Bloqueio e ativação de usuário
    'alt-status-usuario': {
      titulo: 'Bloqueio e ativação de usuário', icone: 'UserCheck', sistemas: ['SGA', 'PowerCRM'],
      sub: 'Marque uma, várias ou todas as empresas. A automação é executada em cada empresa marcada, uma por vez.',
      secoes: [
        { titulo: 'Empresa e credenciais', campos: [
          { k: 'empresas', t: 'empresas', rot: 'Empresas', valor: ['Aurora', 'Cerrado', 'Delta'], obrig: true },
          { k: 'acao', t: 'select', rot: 'Ação', opcoes: ['Bloquear e inativar', 'Ativar e desbloquear'], valor: 'Bloquear e inativar', ajuda: AJ_ACAO },
          { k: 'sga', t: 'check', rot: 'Executar no SGA', valor: true, forte: true },
          { k: 'logins', t: 'logins-sga', se: 'sga', ajuda: AJ_LOGINS },
          { k: 'crm', t: 'check', rot: 'Executar no PowerCRM', valor: true, forte: true },
          loginCrm({ se: 'crm' }),
          { t: 'ajuda', texto: AJ_LEMBRAR },
        ] },
        { titulo: 'CPFs, nomes ou usuários', campos: [
          { k: 'fonte', t: 'alternar', valor: 'lista', opcoes: [['lista', 'Colar lista', 'Um CPF, nome ou usuário por linha.'], ['arquivo', 'Enviar planilha', 'Arquivo .xlsx, .xls ou .csv.']] },
          { k: 'alvos', t: 'area', se: 'fonte=lista', rot: 'Um CPF, nome ou usuário por linha', mono: true, placeholder: '000.000.000-00\nFULANO DE TAL', valor: [cpf(), ...pessoas(3).map((n) => n.toUpperCase())].join('\n') },
          { k: 'planilha', t: 'arquivo', se: 'fonte=arquivo', rot: 'Arquivo .xlsx, .xls ou .csv com uma coluna "CPF", "Nome" ou "Usuário"', aceita: '.xlsx, .xls ou .csv', exemplo: 'desligados-outubro.xlsx · 12 linhas' },
        ], iniciar: 'Iniciar' },
      ],
      itens: (v) => {
        const alvos = v.fonte === 'arquivo' ? (v.planilha ? pessoas(6).map((n) => n.toUpperCase()) : []) : linhas(v.alvos);
        const sist = [v.sga && 'SGA', v.crm && 'PowerCRM'].filter(Boolean);
        return v.empresas.flatMap((emp) => alvos.flatMap((nome) => sist.map((s) => ({ nome, empresa: emp, sistema: s }))));
      },
      colunas: ['CPF, nome ou usuário', 'Empresa', 'Sistema', 'Status', 'Detalhe'],
      passos: (i) => ['[' + i.empresa + '] ' + i.sistema + ': procurando ' + i.nome],
      resultado: (i, n, v) => {
        const bloq = v.acao.startsWith('Bloquear');
        if (sorte(0.1)) return { sit: 'aviso', texto: bloq ? 'Já estava bloqueado' : 'Já estava ativo', detalhe: 'Nada mudou.' };
        if (sorte(0.08)) return { sit: 'erro', texto: 'Não encontrado', detalhe: 'Sem cadastro nesta empresa.' };
        return { sit: 'ok', texto: i.sistema === 'SGA' ? (bloq ? 'Inativado' : 'Ativado') : (bloq ? 'Bloqueado' : 'Desbloqueado'), detalhe: '' };
      },
    },

    // ---------------------------------------------------------------- Bloqueio e ativação de voluntário
    'alt-status-voluntario': {
      titulo: 'Bloqueio e ativação de voluntário', icone: 'Users', sistemas: ['SGA', 'PowerCRM'],
      sub: 'Selecione a empresa. O sistema identifica se ela existe no SGA, no PowerCRM ou nos dois.',
      secoes: [
        { titulo: 'Empresa e credenciais', campos: [
          { k: 'empresa', t: 'select', rot: 'Empresa', opcoes: EMP, valor: 'Boreal' },
          { k: 'acao', t: 'select', rot: 'Ação', opcoes: ['Bloquear e inativar', 'Ativar e desbloquear'], valor: 'Ativar e desbloquear', ajuda: AJ_ACAO },
          { k: 'sga', t: 'check', rot: 'Executar no SGA', valor: true, forte: true },
          loginSga({ se: 'sga', rotUsuario: 'Usuário do SGA', rotSenha: 'Senha do SGA' }),
          { k: 'crm', t: 'check', rot: 'Executar no PowerCRM', valor: true, forte: true },
          loginCrm({ se: 'crm' }),
          { t: 'ajuda', texto: AJ_LEMBRAR },
        ] },
        { titulo: 'CPFs ou nomes', campos: [
          { k: 'fonte', t: 'alternar', valor: 'lista', opcoes: [['lista', 'Colar lista', 'Um CPF ou nome por linha.'], ['arquivo', 'Enviar planilha', 'Arquivo .xlsx, .xls ou .csv.']] },
          { k: 'alvos', t: 'area', se: 'fonte=lista', rot: 'Um CPF ou nome por linha', mono: true, valor: [cpf(), ...pessoas(2).map((n) => n.toUpperCase())].join('\n') },
          { k: 'planilha', t: 'arquivo', se: 'fonte=arquivo', rot: 'Arquivo .xlsx, .xls ou .csv com uma coluna "CPF" ou "Nome"', aceita: '.xlsx, .xls ou .csv', exemplo: 'voluntarios.xlsx · 5 linhas' },
        ], iniciar: 'Iniciar' },
      ],
      itens: (v) => { const alvos = v.fonte === 'arquivo' ? (v.planilha ? pessoas(5) : []) : linhas(v.alvos); return alvos.flatMap((nome) => [v.sga && 'SGA', v.crm && 'PowerCRM'].filter(Boolean).map((s) => ({ nome, sistema: s, empresa: v.empresa }))); },
      colunas: ['CPF ou nome', 'Sistema', 'Status', 'Detalhe'],
      passos: (i) => [i.sistema + ': procurando ' + i.nome],
      resultado: (i, n, v) => (sorte(0.12) ? { sit: 'erro', texto: 'Não encontrado', detalhe: 'Sem voluntário com esse CPF ou nome no ' + i.sistema + '.' } : { sit: 'ok', texto: v.acao.startsWith('Bloquear') ? (i.sistema === 'SGA' ? 'Inativado' : 'Bloqueado') : (i.sistema === 'SGA' ? 'Ativado' : 'Desbloqueado'), detalhe: '' }),
    },

    // ---------------------------------------------------------------- Cadastro de voluntário
    'cadastro-voluntario': {
      titulo: 'Cadastro de voluntário', icone: 'UserPlus', sistemas: ['PowerCRM', 'SGA'], umaColuna: true,
      sub: 'Informe a mensagem de cadastro, selecione a associação e o modo de execução.',
      secoes: [
        { titulo: 'Nova execução', semNumero: true, campos: [
          { t: 'grupo', campos: [
            { k: 'assoc', t: 'select', rot: 'Associação', opcoes: D.ASSOCIACOES, valor: D.ASSOCIACOES[2] },
            { k: 'base', t: 'select', rot: 'Base do PowerCRM', opcoes: BASES, valor: BASES[2] },
          ] },
          loginCrm({ rotUsuario: 'Usuário CRM', rotSenha: 'Senha CRM' }),
          lembrar,
          { k: 'coop', t: 'select', rot: 'Cooperativa SGA (opcional)', opcoes: ['Detectar pela mensagem', 'Cooperativa Centro', 'Cooperativa Norte', 'Cooperativa Sul'], valor: 'Detectar pela mensagem', botao: { rot: 'Buscar cooperativas', resposta: '3 cooperativas encontradas.' } },
          { k: 'msg', t: 'area', rot: 'Mensagem de cadastro', alto: true, obrig: true, placeholder: 'Cole aqui a mensagem recebida do CRM ou use: Nome | CPF | E-mail | Telefone | Cooperativa',
            valor: pessoas(2).map((n) => n + ' | ' + cpf() + ' | ' + D.login(n) + '@exemplo.com | (62) 90000-' + entre(1000, 9999) + ' | Centro').join('\n') },
          modoExec(),
        ], iniciar: 'Iniciar' },
      ],
      itens: (v) => linhas(v.msg).map((l) => ({ nome: l.split('|')[0].trim(), empresa: v.assoc.replace('Associação ', '') })),
      colunas: ['Voluntário', 'Status', 'Detalhe'],
      passos: (i) => ['Lendo a mensagem de ' + i.nome, 'PowerCRM: criando o consultor', 'SGA: integrando o voluntário'],
      resultado: () => (sorte(0.15) ? { sit: 'aviso', texto: 'Já cadastrado', detalhe: 'CPF já existe no PowerCRM; só a integração com o SGA foi feita.' } : { sit: 'ok', texto: 'Cadastrado', detalhe: 'PowerCRM e SGA (cooperativa Centro)' }),
      tituloLog: 'Log da execução',
    },

    // ---------------------------------------------------------------- Atualizar cooperativas
    'atualizar-cooperativas': {
      titulo: 'Atualizar cooperativas', icone: 'Building2', sistemas: ['PowerCRM'], umaColuna: true,
      sub: 'Busca as cooperativas de cada associação no SGA (API) e no PowerCRM (navegador) e grava no banco central.',
      secoes: [{ titulo: 'Execução', semNumero: true, campos: [
        { t: 'ajuda', texto: 'O login não fica salvo no servidor e é usado apenas durante a execução. A opção "Lembrar" guarda os dados somente neste navegador.' },
        loginCrm({ rotUsuario: 'E-mail', rotSenha: 'Senha' }), lembrar,
      ], iniciar: 'Atualizar cooperativas' }],
      itens: () => EMP.map((emp) => ({ nome: emp, empresa: emp })),
      colunas: ['Associação', 'Sistemas', 'Status', 'Detalhe'],
      passos: (i) => ['SGA (API): ' + i.nome, 'PowerCRM: ' + i.nome],
      resultado: () => { const novas = entre(0, 2); return { sit: 'ok', texto: novas ? novas + (novas === 1 ? ' nova' : ' novas') : 'Sem mudança', detalhe: entre(6, 18) + ' cooperativas conferidas', sistemas: ['SGA', 'PowerCRM'] }; },
    },

    // ---------------------------------------------------------------- Buscar grupos SGA
    'buscar-grupos-sga': {
      titulo: 'Buscar grupos SGA', icone: 'Database', sistemas: ['SGA'], historico: 'Leituras feitas',
      sub: 'Lê os grupos de usuário de um SGA com as permissões de cada aba (somente leitura).',
      secoes: [
        { titulo: 'Empresa e login do SGA', campos: [
          { k: 'empresa', t: 'select', rot: 'SGA (empresa)', opcoes: EMP, valor: 'Delta' }, loginSga(), lembrar,
          { t: 'ajuda', texto: 'Por padrão, usuário e senha não são salvos e só são usados durante a leitura. Ao marcar "Lembrar neste navegador", ficam guardados apenas neste navegador (localStorage), sem criptografia e nunca no servidor. Use somente em computador de acesso exclusivo.' },
        ] },
        { titulo: 'Grupos', campos: [
          { k: 'grupos', t: 'area', rot: 'Grupos específicos (opcional)', placeholder: 'Vazio para todos os grupos. Exemplo: ARX - CADASTRO, ARX - FINANCEIRO', valor: '', ajuda: 'Informe nomes ou códigos separados por vírgula. Útil para testar com um grupo antes de ler todos.' },
          { t: 'ajuda', texto: 'Cada leitura guarda o grupos.json (todos os grupos e itens de cada aba) e o HTML de cada grupo como o SGA exibiu. As leituras ficam disponíveis como origem no Criar grupos SGA.' },
        ], iniciar: 'Iniciar' },
      ],
      itens: (v) => (String(v.grupos).trim() ? v.grupos.split(',').map((x) => x.trim()).filter(Boolean) : ['ARX - CONSULTOR', 'ARX - SUPERVISOR', 'ARX - CADASTRO', 'ARX - FINANCEIRO', 'ARX - VISTORIADOR', 'ARX - DIRETORIA']).map((g) => ({ nome: g, empresa: v.empresa })),
      colunas: ['Grupo', 'Status', 'Detalhe'],
      passos: (i) => ['Abrindo o grupo ' + i.nome, 'Lendo as abas de permissão'],
      resultado: () => ({ sit: 'ok', texto: 'Lido', detalhe: entre(5, 9) + ' abas, ' + entre(40, 180) + ' itens' }),
    },

    // ---------------------------------------------------------------- Criar grupos SGA
    'grupos-permissao': {
      titulo: 'Criar grupos SGA', icone: 'Shield', sistemas: ['SGA'], historico: true,
      sub: 'Copia grupos de usuário lidos pelo Buscar grupos SGA para outro SGA.',
      secoes: [
        { titulo: 'De onde copiar', campos: [
          { k: 'fonte', t: 'select', rot: 'Leitura (SGA modelo)', opcoes: ['Delta · 18/10 09:30 · 6 grupos', 'Aurora · 12/10 15:02 · 9 grupos'], valor: 'Delta · 18/10 09:30 · 6 grupos' },
          { k: 'grupos', t: 'empresas', rot: 'Grupos', opcoes: ['ARX - CONSULTOR', 'ARX - SUPERVISOR', 'ARX - CADASTRO', 'ARX - FINANCEIRO', 'ARX - VISTORIADOR', 'ARX - DIRETORIA'], valor: ['ARX - CONSULTOR', 'ARX - CADASTRO'], rotTodas: 'Selecionar todos', obrig: true },
        ] },
        { titulo: 'Destino e login do SGA', campos: [
          { k: 'destino', t: 'select', rot: 'SGA de destino', opcoes: EMP, valor: 'Farol' }, loginSga(), lembrar,
          { k: 'existe', t: 'radios', rot: 'Se o grupo já existir no destino (mesmo nome)', valor: 'pular', opcoes: [['pular', 'Pular e avisar', 'Cria apenas os grupos que ainda não existem no destino.'], ['atualizar', 'Atualizar', 'Cria os grupos que faltam e refaz as permissões dos existentes, iguais ao modelo.'], ['corrigir', 'Corrigir', 'Valida o grupo de mesmo nome no destino e corrige apenas o que estiver diferente do modelo.']] },
          { t: 'ajuda', texto: 'As listas de situações, termos e tipos de veículo (Negar Alterações, Negar Cadastro Fotos, Permitir Alterar..., Termos V4/V5) ficam como o SGA abrir e devem ser marcadas manualmente, pois os nomes variam entre SGAs. Chaves SIM/NÃO como Alterar Situação e Replicar Tipo de Veículo copiam o modelo. Ao final, uma revisão relê tudo e remarca o que não ficou correto.' },
          { k: 'teste', t: 'check', rot: 'Modo teste: preenche tudo sem clicar em Salvar (registra um print de cada aba)', valor: true },
        ], iniciar: 'Iniciar' },
      ],
      itens: (v) => v.grupos.map((g) => ({ nome: g, empresa: v.destino })),
      colunas: ['Grupo', 'Status', 'Detalhe'],
      passos: (i) => ['Criando ' + i.nome + ' no SGA da ' + i.empresa, 'Marcando as abas de permissão', 'Revisão: relendo o grupo salvo'],
      resultado: (i, n, v) => (sorte(0.3) ? { sit: 'aviso', texto: v.existe === 'pular' ? 'Já existia, pulado' : v.existe === 'atualizar' ? 'Atualizado' : 'Corrigido', detalhe: v.existe === 'corrigir' ? entre(1, 6) + ' itens diferentes do modelo' : '' } : { sit: 'ok', texto: v.teste ? 'Teste: preenchido' : 'Criado', detalhe: 'Permissão "Exportar boletos" não existe no destino.' }),
    },

    // ---------------------------------------------------------------- Gerenciar permissões
    'gerenciar-permissoes': {
      titulo: 'Gerenciar permissões', icone: 'Lock', sistemas: ['SGA', 'PowerCRM'],
      sub: 'Departamentos, roles e grupos de permissão do SGA e do PowerCRM, por associação.',
      secoes: [
        { titulo: 'Logins do SGA', semNumero: true, soLogin: true, campos: [{ k: 'logins', t: 'logins-sga', ajuda: 'Informe um ou mais logins do SGA e marque as associações em que cada um é válido. Use mais de um login quando uma senha vale apenas para parte das associações.' }, lembrar] },
        { titulo: 'Login do PowerCRM', semNumero: true, soLogin: true, campos: [{ t: 'ajuda', texto: 'Uma única conta acessa várias empresas, por isso o login do PowerCRM é global.' }, loginCrm(), lembrar, { t: 'ajuda', texto: 'O login não fica salvo no servidor. Com a opção "Lembrar" marcada, é guardado somente neste navegador.' }] },
        { titulo: 'Buscar grupos de permissão', numero: 1, larga: true, campos: [{ t: 'ajuda', texto: 'Lê os grupos de permissão de todas as associações nos dois sistemas.' }], iniciar: 'Buscar em todas as associações (SGA e PowerCRM)' },
        { titulo: 'Departamentos', numero: 2, campos: [{ k: 'deptos', t: 'lista-add', colunas: ['Departamento'], placeholders: ['Nome do departamento (ex.: Cadastro)'], valor: [['Cadastro'], ['Comercial'], ['Financeiro'], ['Eventos']] }] },
        { titulo: 'Roles', numero: 3, campos: [{ k: 'roles', t: 'lista-add', colunas: ['Departamento', 'Chave', 'Nome'], placeholders: ['@deptos', 'Chave padronizada (ex.: ANALISTA_CADASTRO)', 'Nome (ex.: Analista de Cadastro)'], valor: [['Cadastro', 'ANALISTA_CADASTRO', 'Analista de Cadastro'], ['Comercial', 'CONSULTOR', 'Consultor'], ['Comercial', 'SUPERVISOR_COMERCIAL', 'Supervisor comercial']] }] },
        { titulo: 'Vincular role a grupo de permissão', numero: 4, larga: true, campos: [
          { t: 'ajuda', texto: 'Use os filtros para reduzir a lista de grupos antes de escolher. Com muitos sistemas e associações, a lista completa fica extensa.' },
          { k: 'vinculos', t: 'vincular', valor: [['Aurora', 'SGA', 'Consultor', 'ARX - CONSULTOR'], ['Aurora', 'PowerCRM', 'Consultor', 'Consultor externo'], ['Boreal', 'SGA', 'Analista de Cadastro', 'ARX - CADASTRO']] },
        ] },
      ],
      itens: () => EMP.map((emp) => ({ nome: emp, empresa: emp })),
      colunas: ['Associação', 'Sistemas', 'Status', 'Detalhe'],
      passos: (i) => ['SGA da ' + i.nome + ': lendo os grupos', 'PowerCRM da ' + i.nome + ': lendo os perfis'],
      resultado: () => ({ sit: 'ok', texto: 'Lido', detalhe: entre(6, 14) + ' grupos no SGA, ' + entre(3, 8) + ' no PowerCRM', sistemas: ['SGA', 'PowerCRM'] }),
    },

    // ---------------------------------------------------------------- Relatórios SGA
    'relatorios': {
      titulo: 'Relatórios SGA', icone: 'BarChart3', sistemas: ['SGA'], historico: 'Histórico de relatórios',
      sub: 'Selecione o relatório, o período (mês a mês) e os dados a visualizar. Cada mês gera um arquivo Excel para download.',
      secoes: [
        { titulo: 'Empresa e login do SGA', campos: [
          { k: 'empresas', t: 'empresas', rot: 'Empresas', valor: ['Aurora', 'Boreal', 'Cerrado'], obrig: true },
          { k: 'logins', t: 'logins-sga', ajuda: 'Informe um ou mais logins do SGA e marque as empresas em que cada um é válido.' }, lembrar, { t: 'ajuda', texto: AJ_LEMBRAR },
        ] },
        { titulo: 'Relatório, período e campos', campos: [
          { k: 'rel', t: 'select', rot: 'Relatório', opcoes: ['Fotografia de veículos', 'Veículos', 'Boletos', 'Fotografia de boletos'], valor: 'Boletos' },
          { k: 'meses', t: 'meses', rot: 'Período (sempre o dia 1 de cada mês)', valor: { de: '2026-08', ate: '2026-10' } },
          { k: 'recorrente', t: 'select', rot: 'Recorrente', opcoes: ['Personalizado', 'Boletos em aberto do mês', 'Fotografia mensal da base', 'Veículos ativos por cooperativa'], valor: 'Personalizado', ajuda: 'Relatórios de uso recorrente. Ao selecionar um, os filtros e os campos são marcados automaticamente. Qualquer alteração posterior retorna a seleção para "Personalizado".' },
          { k: 'valor', t: 'texto', rot: 'Valor do cálculo (R$)', placeholder: '600.000,00', valor: '', ajuda: 'Usado nas mensagens do WhatsApp. Valor por cota = valor ÷ cotas da base completa, multiplicado pelas cotas de cada base. As mensagens aparecem ao fim da execução (exceto no modo teste).' },
          { k: 'campos', t: 'campos-ordem', rot: 'Dados visualizados', opcoes: ['Placa', 'Associado', 'CPF/CNPJ', 'Situação', 'Valor', 'Vencimento', 'Data de pagamento', 'Valor pago', 'Tipo de boleto', 'Cooperativa', 'Regional', 'Consultor', 'Nosso número', 'Linha digitável'], padrao: ['Placa', 'Associado', 'Situação', 'Valor', 'Vencimento'], valor: ['Placa', 'Associado', 'Situação', 'Valor', 'Vencimento'], ajuda: 'A ordem de marcação dos campos define a ordem das colunas no relatório (o número ao lado indica a posição).' },
          { k: 'modo', t: 'radios', rot: 'Modo de execução', valor: 'sem', opcoes: [['sem', 'Sem tela (headless)', 'Executa em segundo plano, com acompanhamento em miniatura ao vivo no canto da tela.'], ['tela', 'Tela ao vivo (VNC)', 'Navegador completo, com interação permitida. Apenas uma execução por vez.']] },
          { k: 'teste', t: 'check', rot: 'Modo teste: preenche o formulário sem clicar em GERAR RELATÓRIO (gera apenas um print da tela)', valor: false },
        ], iniciar: 'Iniciar' },
      ],
      itens: (v) => {
        const meses = [];
        const [ay, am] = v.meses.de.split('-').map(Number), [by, bm] = v.meses.ate.split('-').map(Number);
        for (let y = ay, m = am; y < by || (y === by && m <= bm); m === 12 ? (y++, m = 1) : m++) meses.push(String(m).padStart(2, '0') + '/' + y);
        return v.empresas.flatMap((emp) => meses.map((mes) => ({ nome: mes, empresa: emp })));
      },
      passos: (i) => ['[' + i.empresa + '] ' + i.nome + ': abrindo o relatório', '[' + i.empresa + '] Marcando os dados visualizados', '[' + i.empresa + '] Esperando o SGA gerar', '[' + i.empresa + '] Baixando o Excel'],
      resultado: (i, n, v) => (sorte(0.08) ? { sit: 'erro', texto: 'Erro', detalhe: 'O SGA não gerou o relatório em 3 minutos.' } : { sit: 'ok', texto: v.teste ? 'Teste: print' : 'Pronto', detalhe: v.teste ? 'print-formulario.png' : v.rel.toLowerCase().replace(/ /g, '-') + '-' + i.empresa.toLowerCase() + '-' + i.nome.replace('/', '-') + '.xlsx', linhas: entre(800, 6200), cotas: entre(900, 4000) }),
      resultadoTipo: 'arquivos', vnc: true,
    },

    // ---------------------------------------------------------------- Cadastrar modelo SGA
    'cadastro-modelo': {
      titulo: 'Cadastrar modelo SGA', icone: 'Car', sistemas: ['SGA'], historico: true,
      sub: 'Cadastra um modelo no SGA a partir do código FIPE: a montadora e o modelo vêm da tabela FIPE.',
      secoes: [
        { titulo: 'Modelo (código FIPE)', campos: [
          { k: 'fipe', t: 'texto', rot: 'Código FIPE', placeholder: '002224-1', valor: '001234-5', mono: true, obrig: true, botao: { rot: 'Consultar na tabela FIPE', resposta: 'EXEMPLO MOTORS · Exemplo Sedan 1.0 Flex 2024 · R$ 89.450,00' } },
          { t: 'ajuda', texto: 'A automação preenche o código FIPE, seleciona a montadora e informa o modelo (ambos vêm da FIPE), liga a chave "aceito no MVC e SGA" e salva. Antes de criar, confere se o código já existe na lista de modelos; depois de salvar, confere novamente. O cadastro exige o código FIPE.' },
        ] },
        { titulo: 'SGA e login', campos: [
          { k: 'empresa', t: 'select', rot: 'SGA (empresa)', opcoes: EMP, valor: 'Estrela' }, loginSga({ ajuda: 'Usuário e senha são usados somente nesta execução e nunca são gravados. Dentro do ARX Hub, o login vem de "Meus acessos".' }),
          { k: 'teste', t: 'check', rot: 'Modo teste: preenche tudo sem clicar em Salvar (registra um print do modal preenchido)', valor: true },
        ], iniciar: 'Iniciar' },
      ],
      itens: (v) => [{ nome: v.fipe, empresa: v.empresa }],
      passos: () => ['Consultando a FIPE', 'Conferindo se o código já existe na lista de modelos', 'Abrindo o cadastro de modelo', 'Selecionando a montadora EXEMPLO MOTORS', 'Ligando "aceito no MVC e SGA"', 'Conferindo depois de salvar'],
      resultado: (i, n, v) => ({ sit: 'ok', texto: v.teste ? 'Teste: modal preenchido' : 'Modelo cadastrado', detalhe: 'Exemplo Sedan 1.0 Flex 2024', resumo: [['Código FIPE', i.nome], ['Montadora', 'EXEMPLO MOTORS'], ['Modelo', 'Exemplo Sedan 1.0 Flex 2024'], ['SGA', i.empresa], ['Conferência', v.teste ? 'Print do modal registrado' : 'Aparece na lista de modelos']] }),
      resultadoTipo: 'resumo',
    },

    // ---------------------------------------------------------------- Sincronizar vistoria
    'sincronizar-vistoria': {
      titulo: 'Sincronizar vistoria', icone: 'Camera', sistemas: ['PowerCRM'], historico: true,
      sub: 'Localiza a cotação no PowerCRM por placa, chassi ou ID da cotação, confere a etapa e o status da vistoria e indica o que fazer: responder o chamado ou seguir para o Visto.',
      secoes: [
        { titulo: 'Veículo', campos: [
          { k: 'id', t: 'texto', rot: 'Placa, chassi ou ID da cotação', placeholder: 'ABC1D23, 9BGEB69A0RG170768 ou NoyG40XZ2w', valor: D.placa(), mono: true, obrig: true, ajuda: 'Informe um dos três: a automação descobre qual é.' },
          { t: 'ajuda', texto: 'A busca vai de 2000 até amanhã no pipeline. Só vale o card em Vistorias, Liberadas para cadastro ou Filiação concretizadas; se houver mais de um, vale o da etapa mais à direita. Vistorias e Liberadas para cadastro sincronizam com o CRM; Filiação concretizadas, com o SGA.' },
        ] },
        { titulo: 'Associação e login do PowerCRM', campos: [
          { k: 'assoc', t: 'select', rot: 'Associação', opcoes: D.ASSOCIACOES, valor: D.ASSOCIACOES[0] },
          { k: 'base', t: 'select', rot: 'Base do PowerCRM', opcoes: BASES, valor: BASES[0] },
          loginCrm({ ajuda: 'O login é usado somente nesta execução e nunca é gravado. Dentro do ARX Hub, vem de "Meus acessos".' }),
          { k: 'teste', t: 'check', rot: 'Modo teste: lê a vistoria e os dados, mas não executa o passo do Visto (que ainda não existe)', valor: true },
        ], iniciar: 'Iniciar' },
      ],
      itens: (v) => [{ nome: v.id, empresa: v.assoc.replace('Associação ', '') }],
      passos: (i) => ['Buscando ' + i.nome + ' no pipeline', 'Card em Liberadas para cadastro', 'Conferindo a placa no card aberto', 'Lendo a vistoria: 18 fotos, aprovada'],
      resultado: (i) => ({ sit: 'ok', texto: 'Vistoria aprovada', detalhe: '', resumo: [['Identificador', i.nome + ' (placa)'], ['Card', 'Exemplo da Silva · cotação NoyG40XZ2w'], ['Etapa', 'Liberadas para cadastro'], ['Vistoria', 'Aprovada em 14/10/2026 · 18 fotos'], ['O que fazer', 'Seguir para o Visto (sincroniza com o CRM)']] }),
      resultadoTipo: 'resumo',
    },

    // ---------------------------------------------------------------- Buscar regionais
    'buscar-regionais': {
      titulo: 'ARX Buscar regionais', icone: 'MapPin', sistemas: ['PowerCRM'],
      sub: 'Lê no PowerCRM as regionais de cada base escolhida e as cidades marcadas em cada uma, e salva o resultado no banco central. Somente leitura: nada é alterado no CRM.',
      secoes: [
        { titulo: 'Bases e login do PowerCRM', campos: [
          { k: 'bases', t: 'empresas', rot: 'Bases (empresas do PowerCRM)', opcoes: BASES, valor: BASES.slice(0, 2), busca: 'Buscar base ou associação', obrig: true },
          loginCrm({ rotUsuario: 'Usuário do PowerCRM', ajuda: 'Dentro do Hub, o login vem dos Acessos. É usado somente durante a execução e não é gravado no servidor nem neste navegador. As bases marcadas são lidas em sequência, com um único login. Você pode coletar só uma.' }),
        ] },
        { titulo: 'Salvamento no banco central', campos: [
          { k: 'salvar', t: 'check', rot: 'Salvar o resultado no banco central.', valor: true },
          { t: 'ajuda', texto: 'A associação de cada base vem do cadastro do banco central e aparece ao lado do nome. Quando não for identificada, escolha a associação na lista. Cada base é salva sozinha: o salvamento substitui só as regionais daquela base e mantém as das outras bases da mesma associação. Uma base cuja leitura ficar incompleta, ou sem nenhuma regional, não é salva.' },
        ], iniciar: 'Buscar regionais' },
      ],
      itens: (v) => v.bases.map((b) => ({ nome: b, empresa: b })),
      passos: (i) => ['Trocando para a base ' + i.nome, 'Lendo as regionais em lotes', 'Gravando no banco central'],
      resultado: (i, n, v) => ({ sit: 'ok', texto: v.salvar ? 'Salvo' : 'Lido', detalhe: '', filhos: UFS.slice(0, entre(4, 7)).map(([uf, c], k) => [i.nome.split(' ')[0].toUpperCase() + ' - ' + c.toUpperCase(), String(3100 + k * 17), entre(4, 40) + ' cidades (' + uf + ')', 'Salva']) }),
      resultadoTipo: 'arvore', colunasArvore: ['Empresa e regional', 'ID no CRM', 'Cidades', 'Situação'],
    },

    // ---------------------------------------------------------------- Buscar tabelas
    'buscar-tabelas': {
      titulo: 'ARX Buscar tabelas', icone: 'Table', sistemas: ['PowerCRM'],
      sub: 'Valida cada base do PowerCRM (lê só a lista de tabelas de preço), deixa você escolher quais tabelas extrair e então lê as escolhidas, com as regionais vinculadas e as marcas e os veículos marcados, salvando no banco central aos poucos. Funciona em bases grandes. Somente leitura: nada é alterado no CRM.',
      secoes: [
        { titulo: 'Bases e login do PowerCRM', campos: [
          { k: 'bases', t: 'empresas', rot: 'Bases (empresas do PowerCRM)', opcoes: BASES, valor: BASES.slice(1, 3), busca: 'Buscar base ou associação', obrig: true },
          loginCrm({ rotUsuario: 'Usuário do PowerCRM', ajuda: 'Dentro do Hub, o login vem dos Acessos. É usado somente durante a execução e não é gravado no servidor nem neste navegador. A validação é rápida: lê só a lista de tabelas de cada base, sem abrir nenhuma tabela. Depois dela você escolhe quais tabelas extrair.' }),
        ] },
        { titulo: 'Salvamento no banco central', campos: [
          { k: 'salvar', t: 'check', rot: 'Salvar o resultado no banco central.', valor: true },
          { t: 'ajuda', texto: 'Grava a cada lote de tabelas lidas: o que já foi lido fica salvo mesmo se a execução for parada. Só as tabelas escolhidas são gravadas ou atualizadas; uma tabela com erro de leitura mantém o que o banco já tinha dela.' },
        ] },
        { titulo: 'Escolher tabelas', larga: true, campos: [
          { k: 'tabelas', t: 'escolha', botao: 'Validar bases', ajuda: 'Marque as tabelas que serão lidas e salvas. O que foi validado aqui só vale para estas bases: para outras, valide de novo.',
            colunas: ['Base e tabela', 'ID no CRM', 'Tipo', 'Regionais', 'Situação no CRM', 'No banco central'],
            linhas: ['LEVES 4%', 'LEVES 5%', 'PESADOS 2026', 'MOTOS 2026', 'UTILITÁRIOS', 'APP E TÁXI', 'AGREGADOS'].map((t, k) => [BASES[1 + (k % 2)] + ' · ' + t, String(880 + k * 7), k === 2 ? 'Caminhão' : k === 3 ? 'Moto' : 'Carro', String(entre(2, 9)), k === 6 ? 'Inativa' : 'Ativa', k % 3 === 0 ? 'Salva em 12/10' : 'Não salva']),
            filtros: [['Ativas e inativas', 'Só ativas', 'Só inativas'], ['Salvas e não salvas', 'Só não salvas no banco', 'Só já salvas no banco'], ['Todas as regionais', 'Só DENTRO', 'Só FORA']], busca: 'Buscar por nome ou ID da tabela',
            extras: ['Selecionar as exibidas', 'Desmarcar as exibidas', 'Selecionar as não salvas no banco', 'Limpar a escolha'], obrig: true },
        ], iniciar: 'Buscar tabelas escolhidas' },
      ],
      itens: (v) => v.tabelas.map((t) => ({ nome: t.split(' · ')[1], empresa: t.split(' · ')[0] })),
      passos: (i) => ['Abrindo a tabela ' + i.nome, 'Lendo regionais, marcas e veículos', 'Gravando o lote no banco central'],
      resultado: (i) => ({ sit: 'ok', texto: 'Salva', detalhe: '', filhos: [[i.nome, String(entre(800, 999)), entre(2, 9) + ' regionais', entre(8, 40) + ' marcas', entre(120, 900) + ' veículos', 'Salva']] }),
      resultadoTipo: 'arvore', colunasArvore: ['Base e tabela', 'ID no CRM', 'Regionais', 'Marcas', 'Veículos', 'Situação'],
    },

    // ---------------------------------------------------------------- Criar regionais
    'criar-regionais': {
      titulo: 'ARX Criar regionais', icone: 'MapPin', sistemas: ['PowerCRM'],
      sub: 'Cria, corrige e valida regionais e as cidades de cada uma no PowerCRM de uma empresa de destino.',
      secoes: [
        { titulo: 'Destino, login e modo', campos: [
          { k: 'destino', t: 'select', rot: 'Empresa de destino no PowerCRM', opcoes: BASES, valor: BASES[3] },
          loginCrm({ rotUsuario: 'Usuário do PowerCRM', ajuda: AJ_CRM_HUB }),
          { k: 'modo', t: 'radios', rot: 'Modo', valor: 'criar', opcoes: [['criar', 'Criar', 'Cria as regionais que ainda não existem no destino.'], ['corrigir', 'Corrigir', 'Marca e desmarca cidades das regionais que já existem.'], ['validar', 'Validar', 'Só leitura: compara o esperado com o que está no CRM.']] },
          { t: 'acao', rot: 'Ler dados do CRM', resposta: 'Destino lido: 6 regionais e os dados da empresa.' },
        ] },
        { titulo: 'Origem das cidades', campos: [
          { k: 'origem', t: 'radios', valor: 'banco', opcoes: [['banco', 'Banco central', 'Regionais já coletadas de uma base de uma associação.'], ['json', 'Lista em JSON', 'Colada na tela ou lida de um arquivo.']] },
          { t: 'grupo', se: 'origem=banco', campos: [{ k: 'assocOrigem', t: 'select', rot: 'Associação de origem', opcoes: D.ASSOCIACOES, valor: D.ASSOCIACOES[0] }, { k: 'baseOrigem', t: 'select', rot: 'Base de origem', opcoes: BASES, valor: BASES[0] }] },
          { k: 'json', t: 'area', se: 'origem=json', rot: 'Lista de regionais', mono: true, placeholder: '{ "regionais": [ { "nome": "EXEMPLO - DENTRO", "cidades": [ { "uf": "GO", "cidade": "Goiânia" } ] } ] }', valor: '', ajuda: 'Formato: cada regional tem "nome" e "cidades" (cada cidade com "uf" e "cidade"). O campo opcional "tabela" define o nome da tabela.' },
          { k: 'jsonArquivo', t: 'arquivo', se: 'origem=json', rot: 'Carregar de um arquivo', aceita: '.json', exemplo: 'regionais-aurora.json · 6 regionais' },
        ] },
        { titulo: 'Regionais e filtros', larga: true, campos: [
          { k: 'nomeAssoc', t: 'texto', rot: 'Nome da associação no nome das regionais', valor: 'DELTA', ajuda: 'O nome final junta a associação, um hífen e o nome da tabela, tudo em maiúsculas (exemplo de resultado: VALIDI - DENTRO). Use o nome como aparece nas regionais do CRM de destino.' },
          { k: 'ufs', t: 'empresas', rot: 'Filtrar por estado', opcoes: ['DF', 'GO', 'MG', 'MS', 'MT', 'TO'], valor: ['DF', 'GO', 'MG', 'MS', 'MT', 'TO'], rotTodas: 'Todos' },
          { k: 'regionais', t: 'escolha', botao: 'Carregar regionais', colunas: ['Regional de origem', 'Nome da tabela', 'Nome final no destino', 'Cidades', 'No destino'], busca: 'Parte do nome da cidade',
            linhas: UFS.map(([uf, c]) => ['AURORA - ' + c.toUpperCase(), c.toUpperCase(), 'DELTA - ' + c.toUpperCase(), entre(3, 30) + ' (' + uf + ')', sorte(0.3) ? 'Já existe' : 'Não existe']), obrig: true },
        ] },
        { titulo: 'Dados da regional', campos: [
          { t: 'ajuda', texto: 'Razão social, CNPJ, telefone, e-mail e endereço são lidos da empresa de destino (Configurações, Empresa). O que for digitado aqui vale sobre o lido. Campos sem dado aparecem como Não informado.' },
          { t: 'grupo', campos: [{ k: 'razao', t: 'texto', rot: 'Razão social', valor: 'Associação Delta de Proteção' }, { k: 'cnpj', t: 'texto', rot: 'CNPJ', valor: '00.000.000/0001-00', mono: true }] },
          { t: 'grupo', campos: [{ k: 'tel', t: 'texto', rot: 'Telefone', valor: '(62) 3000-0000' }, { k: 'email', t: 'texto', rot: 'E-mail', valor: 'contato@exemplo.com' }] },
          { k: 'atualizarDados', t: 'check', rot: 'Atualizar também os dados (razão social, CNPJ, telefone, e-mail e endereço) das regionais corrigidas.', valor: false },
        ] },
        { titulo: 'Conferir e executar', campos: [{ k: 'teste', t: 'check', rot: 'Modo teste: abre o CRM, preenche e confere, sem clicar em Salvar. Desmarque para gravar de verdade.', valor: true }], iniciar: 'Iniciar' },
      ],
      itens: (v) => v.regionais.map((r) => ({ nome: r.replace('AURORA', v.nomeAssoc || 'DELTA'), empresa: v.destino })),
      colunas: ['Regional', 'Situação', 'Cidades esperadas', 'Faltando', 'Sobrando', 'Dados diferentes', 'Observações'],
      passos: (i) => ['Abrindo a regional ' + i.nome, 'Marcando as cidades', 'Conferindo o que ficou gravado'],
      resultado: (i, n, v) => { const f = sorte(0.3) ? entre(1, 3) : 0; return { sit: f ? 'aviso' : 'ok', texto: v.modo === 'validar' ? (f ? 'Diferente' : 'Igual') : v.teste ? 'Teste: conferido' : 'Criada', esperadas: String(entre(4, 30)), faltando: String(f), sobrando: String(f ? entre(0, 2) : 0), dados: f ? 'Telefone' : 'Nenhum', detalhe: f ? 'Cidades corrigidas na conferência' : '' }; },
      celulas: (r) => [r.item.nome, null, r.esperadas, r.faltando, r.sobrando, r.dados, r.detalhe],
    },

    // ---------------------------------------------------------------- Criar tabelas
    'criar-tabelas': {
      titulo: 'ARX Criar tabelas', icone: 'Table', sistemas: ['PowerCRM'],
      sub: 'Cria, corrige e valida tabelas de preço (dados gerais, regionais, marcas e modelos) no PowerCRM de uma empresa de destino.',
      secoes: [
        { titulo: 'Destino, login e modo', campos: [
          { k: 'destino', t: 'select', rot: 'Empresa de destino no PowerCRM', opcoes: BASES, valor: BASES[4] },
          loginCrm({ rotUsuario: 'Usuário do PowerCRM', ajuda: AJ_CRM_HUB }),
          { k: 'modo', t: 'radios', rot: 'Modo', valor: 'criar', opcoes: [['criar', 'Criar', 'Cria as tabelas que ainda não existem no destino.'], ['corrigir', 'Corrigir', 'Ajusta dados, regionais, marcas e modelos das tabelas que já existem.'], ['validar', 'Validar', 'Só leitura: compara o esperado com o que está no CRM.']] },
          { t: 'ajuda', texto: 'Só os dados gerais, as regionais, as marcas e os modelos são tratados. Itens por faixa FIPE e preços dos planos não são alterados: a tabela criada fica sem itens.' },
          { t: 'acao', rot: 'Ler dados do CRM', resposta: 'Destino lido: 4 tabelas, 6 regionais e 52 marcas.' },
        ] },
        { titulo: 'Origem das tabelas', campos: [
          { k: 'origem', t: 'radios', valor: 'banco', opcoes: [['banco', 'Banco central', 'Tabelas já coletadas de uma base de uma associação.'], ['json', 'Lista em JSON', 'Colada na tela ou lida de um arquivo.']] },
          { t: 'grupo', se: 'origem=banco', campos: [{ k: 'assocOrigem', t: 'select', rot: 'Associação de origem', opcoes: D.ASSOCIACOES, valor: D.ASSOCIACOES[1] }, { k: 'baseOrigem', t: 'select', rot: 'Base de origem', opcoes: BASES, valor: BASES[1] }] },
          { k: 'json', t: 'area', se: 'origem=json', rot: 'Lista de tabelas', mono: true, placeholder: '{ "tabelas": [ { "nome": "LEVES 4%", "regionais": [ { "nome": "EXEMPLO - DENTRO" } ] } ] }', valor: '', ajuda: 'Cada tabela tem "nome" e "regionais" (cada uma com "nome"). Opcionais: "descricaoAdm", "prioridade", "rateio", "taxiUber", "tipoVeiculo" (1 carro, 2 moto, 3 caminhão, 9 agregado, 10 outros) e "marcas".' },
        ] },
        { titulo: 'Tabelas e filtros', larga: true, campos: [
          { k: 'tabelas', t: 'escolha', botao: 'Carregar tabelas', busca: 'Parte do nome', colunas: ['Tabela de origem', 'Tipo', 'Nome final no destino', 'Regionais', 'Marcas', 'Modelos', 'No destino'],
            filtros: [['Todos', 'Carro', 'Moto', 'Caminhão']], ajuda: 'Os filtros só escolhem quais tabelas aparecem. O conteúdo de cada tabela nunca é cortado. O nome final é o da origem e pode ser editado por tabela; o nome é único no destino.',
            linhas: [['LEVES 4%', 'Carro'], ['LEVES 5%', 'Carro'], ['PESADOS 2026', 'Caminhão'], ['MOTOS 2026', 'Moto'], ['APP E TÁXI', 'Carro']].map(([t, tp]) => [t, tp, t, String(entre(2, 8)), String(entre(10, 52)), String(entre(80, 900)), sorte(0.3) ? 'Já existe' : 'Não existe']), obrig: true },
        ] },
        { titulo: 'Conferir e executar', larga: true, campos: [
          { k: 'teste', t: 'check', rot: 'Modo teste: abre o CRM, preenche e confere, sem clicar em Avançar. Desmarque para gravar de verdade.', valor: true },
          { k: 'rateio', t: 'texto', rot: 'Rateio para todas as tabelas (opcional)', placeholder: 'Em branco mantém o rateio de cada tabela', valor: '', ajuda: 'Se preencher, este valor (por exemplo 31,00) vale para todas as tabelas marcadas, no lugar do rateio da origem.' },
          { k: 'mapa', t: 'mapa', rot: 'Regionais de destino', ajuda: 'Estas regionais das tabelas não existem com o mesmo nome no destino. O sistema sugere a correspondente pelo nome (por exemplo "- DENTRO" ou "- FORA"). Quando não achar, escolha a regional do destino ou marque Ignorar. A escolha vale para todas as tabelas marcadas.',
            linhas: [['BOREAL - DENTRO', 'ESTRELA - DENTRO'], ['BOREAL - FORA', 'ESTRELA - FORA'], ['BOREAL - CAPITAL', '']], opcoes: ['ESTRELA - DENTRO', 'ESTRELA - FORA', 'ESTRELA - INTERIOR', 'Ignorar'] },
        ], iniciar: 'Iniciar' },
      ],
      itens: (v) => v.tabelas.map((t) => ({ nome: t, empresa: v.destino })),
      colunas: ['Tabela', 'Situação', 'Esperado', 'Dados diferentes', 'Regionais', 'Marcas', 'Modelos', 'Observações'],
      passos: (i) => ['Abrindo a tabela ' + i.nome, 'Dados gerais', 'Regionais', 'Marcas e modelos'],
      resultado: (i, n, v) => (sorte(0.1) ? { sit: 'erro', texto: 'Erro', esperado: '-', dados: '-', reg: '-', marcas: '-', modelos: '-', detalhe: 'O CRM recusou o nome: já existe uma tabela com esse nome.' } : { sit: 'ok', texto: v.teste ? 'Teste: conferida' : 'Criada', esperado: 'Igual', dados: 'Nenhum', reg: String(entre(2, 8)), marcas: String(entre(10, 52)), modelos: String(entre(80, 900)), detalhe: '' }),
      celulas: (r) => [r.item.nome, null, r.esperado, r.dados, r.reg, r.marcas, r.modelos, r.detalhe],
    },

    // ---------------------------------------------------------------- Converter planilha (duas telas)
    'converter-planilha': {
      titulo: 'ARX Converter planilha', icone: 'Sheet', sistemas: ['SGA', 'PowerCRM'],
      sub: 'Converte a planilha de preços de uma associação em planilhas modelo de importação (PowerCRM e SGA) e os produtos do PowerCRM em planilha de produtos do SGA.',
      abas: [
        { k: 'precos', titulo: 'Tabelas de preço', desc: 'Planilha de preços em planilhas modelo do PowerCRM e do SGA.',
          secoes: [
            { titulo: 'Planilha de preços', campos: [
              { k: 'assoc', t: 'select', rot: 'Associação', opcoes: D.ASSOCIACOES, valor: D.ASSOCIACOES[4], ajuda: 'A associação é usada para lembrar o que você digitar (códigos dos planos, instalação, adesão, franquia, prefixo e tipos de veículo do SGA) e as colunas da planilha na próxima conversão. Sem associação, dá para converter, mas nada é salvo.' },
              { k: 'arquivo', t: 'arquivo', rot: 'Planilha de preços (.xlsx)', aceita: 'Escolher planilha (.xlsx)', exemplo: 'precos-estrela-2026.xlsx · 3 abas', obrig: true },
              { t: 'ajuda', texto: 'A planilha pode ter qualquer layout: o sistema procura sozinho as faixas de valor, os planos (de um a vários, com os nomes da planilha), a cota, a taxa administrativa e o rastreador. A planilha é lida só durante a conversão e não é guardada no servidor.' },
              { t: 'acao', rot: 'Ler planilha', precisa: 'arquivo', resposta: 'Planilha lida: 3 tipos, 14 faixas e 3 planos por tipo.' },
            ] },
            { titulo: 'Como a planilha foi entendida', campos: [
              { t: 'grupo', campos: [{ k: 'aba', t: 'select', rot: 'Aba', opcoes: ['LEVES', 'PESADOS', 'MOTOS'], valor: 'LEVES' }, { k: 'faixas', t: 'select', rot: 'Faixas de valor', opcoes: ['A', 'B', 'C'], valor: 'A' }, { k: 'cota', t: 'select', rot: 'Cota', opcoes: ['Sem coluna', 'B', 'C', 'D'], valor: 'B' }] },
              { t: 'grupo', campos: [{ k: 'taxa', t: 'select', rot: 'Taxa administrativa', opcoes: ['Sem coluna', 'C', 'D', 'E'], valor: 'C' }, { k: 'rast', t: 'select', rot: 'Rastreador compulsório', opcoes: ['Sem coluna', 'D', 'E', 'F'], valor: 'D' }, { k: 'adesao', t: 'select', rot: 'Adesão', opcoes: ['Sem coluna', 'E', 'F', 'G'], valor: 'Sem coluna' }] },
              { k: 'planos', t: 'texto', rot: 'Colunas dos planos (opcional)', placeholder: 'Automático, ex.: L, M, N', valor: '', ajuda: 'Cada tipo tem os seus planos, lidos do cabeçalho. Só preencha "Colunas dos planos" se a detecção errar (letras separadas por vírgula). "Sem coluna" usa cota 1, taxa 0 e sem rastreador. Se algo estiver errado, ajuste e clique em "Reler com estas colunas".' },
              { t: 'previa', colunas: ['Faixa de valor', 'Cota', 'Taxa adm.', 'Rastreador', 'Start', 'Plus', 'Max'], linhas: [['R$ 0 a R$ 30.000', '1,50', 'R$ 49,90', 'Não', 'R$ 89,00', 'R$ 109,00', 'R$ 129,00'], ['R$ 30.000,01 a R$ 60.000', '1,83', 'R$ 59,90', 'Sim', 'R$ 119,00', 'R$ 139,00', 'R$ 169,00'], ['R$ 60.000,01 a R$ 90.000', '2,10', 'R$ 69,90', 'Sim', 'R$ 149,00', 'R$ 179,00', 'R$ 209,00']] },
              { t: 'acoes', botoes: ['Reler com estas colunas', 'Usar as colunas salvas'] },
            ] },
            { titulo: 'Tipos encontrados', larga: true, campos: [
              { k: 'sistemas', t: 'checks', rot: 'Gerar para', opcoes: ['PowerCRM', 'SGA'], valor: ['PowerCRM', 'SGA'] },
              { t: 'subtitulo', texto: 'SGA: cotas por tipo de veículo' },
              { t: 'ajuda', texto: 'Cada tipo vira uma planilha de cota por tipo de veículo do SGA. O valor da cota é sempre em reais e vem da taxa administrativa da planilha de preços. A descrição fica no formato ARX - COTA 1.83 VEICULOS LEVES (R$15000,01 A R$20000).' },
              { k: 'prefixo', t: 'texto', rot: 'Início da descrição', valor: 'ARX', ajuda: 'Pode acrescentar algo antes, como "RP ARX". O " - COTA" é colocado depois.' },
              { t: 'subtitulo', texto: 'Tipos de veículo do SGA' },
              { t: 'grupo', campos: [{ k: 'sgaEmpresa', t: 'select', rot: 'Empresa do SGA', opcoes: EMP, valor: 'Estrela' }] },
              loginSga({ rotUsuario: 'Usuário do SGA', rotSenha: 'Senha do SGA', ajuda: 'Dentro do Hub o login vem preenchido. É usado só para ler a lista de tipos de veículo ativos e não é gravado.' }),
              { t: 'acao', rot: 'Buscar tipos no SGA', resposta: '6 tipos de veículo ativos.' },
              { k: 'html', t: 'arquivo', rot: 'Ou usar o HTML salvo da página', aceita: '.html', exemplo: 'tipoveiculo-listar.html' },
              { k: 'tiposSga', t: 'tabela-edit', ajuda: 'Só os tipos ativos. O nome ao lado entra na descrição da cota e pode ser ajustado.', colunas: ['Código', 'Descrição no SGA', 'Nome na descrição da cota'], linhas: [['1', 'VEÍCULOS LEVES', 'VEICULOS LEVES'], ['2', 'PICK-UPS', 'PICK-UPS'], ['7', 'FLAT LEVES', 'FLAT LEVES'], ['8', 'FLAT PICK-UPS', 'FLAT PICK-UPS'], ['3', 'MOTOCICLETAS', 'MOTOS']] },
              { t: 'ajuda', texto: 'Os preços dos planos (Start, Plus e Max) e as faixas vêm da planilha. Preencha o que a planilha não tem. Campos em branco ficam em branco no arquivo.' },
              { t: 'grupo', campos: [{ k: 'inst', t: 'texto', rot: 'Instalação do rastreador (R$)', placeholder: 'Em branco', valor: '150,00' }, { k: 'ades', t: 'texto', rot: 'Adesão (R$)', placeholder: 'Em branco', valor: '' }, { k: 'franqT', t: 'select', rot: 'Franquia', opcoes: ['Em branco', 'Valor fixo (R$)', 'Percentual (%)'], valor: 'Percentual (%)' }, { k: 'franqV', t: 'texto', rot: 'Valor da franquia', placeholder: 'Em branco', valor: '6' }] },
              { t: 'acoes', botoes: ['Aplicar aos tipos marcados', 'Marcar todos os tipos', 'Desmarcar todos'] },
            ] },
            { titulo: 'Gerar planilhas modelo', larga: true, campos: [{ t: 'ajuda', texto: 'O zip traz uma pasta por sistema escolhido (PowerCRM e SGA) e, dentro dela, uma planilha por tipo marcado. No SGA, um tipo pode virar mais de uma planilha, uma por tipo de veículo escolhido.' }], iniciar: 'Gerar zip' },
          ],
          itens: (v) => (v.arquivo ? ['LEVES', 'PESADOS', 'MOTOS'].flatMap((t) => v.sistemas.map((s) => ({ nome: s + '/' + t + '.xlsx', empresa: s }))) : []),
          colunas: ['Planilha', 'Status', 'Detalhe'],
          passos: (i) => ['Montando ' + i.nome],
          resultado: () => ({ sit: 'ok', texto: 'Gerada', detalhe: entre(8, 42) + ' linhas' }),
          arquivoFinal: 'planilhas-estrela.zip',
        },
        { k: 'produtos', titulo: 'Produtos do SGA', desc: 'Produtos do PowerCRM em planilha de produtos do SGA.',
          secoes: [
            { titulo: 'Produtos do CRM', campos: [
              { t: 'ajuda', texto: 'O robô entra no PowerCRM, lê todos os produtos ativos das quatro categorias (Cobertura, Assistência, Benefícios e Opcionais) com o valor de cada um e monta a planilha de produtos do SGA.' },
              { k: 'empresaCrm', t: 'select', rot: 'Empresa do CRM', opcoes: BASES, valor: BASES[4] },
              loginCrm({ ajuda: 'Dentro do Hub o login vem preenchido. É usado só para ler os produtos e não é gravado.' }),
              { t: 'acao', rot: 'Buscar produtos no CRM', resposta: '9 produtos ativos lidos.' },
            ] },
            { titulo: 'Fornecedores, classificações e tipos de veículo', campos: [
              { t: 'ajuda', texto: 'Cadastre aqui, na hora, os pares de código e nome. Nada disso fica salvo: vale só para esta tela. Em cada produto você escolhe pelo nome e o código vai para a planilha.' },
              { k: 'fornecedores', t: 'lista-add', rot: 'Fornecedores', colunas: ['Código', 'Nome'], placeholders: ['Código', 'Nome'], botao: 'Adicionar fornecedor', valor: [['12', 'Assistência Exemplo 24h'], ['15', 'Rastreia Exemplo']] },
              { k: 'classif', t: 'lista-add', rot: 'Classificações de produto', colunas: ['Código', 'Nome'], placeholders: ['Código', 'Nome'], botao: 'Adicionar classificação', valor: [['3', 'Assistência'], ['4', 'Benefício']] },
              { t: 'subtitulo', texto: 'Tipos de veículo do SGA' },
              { k: 'sgaEmpresa2', t: 'select', rot: 'Empresa do SGA', opcoes: EMP, valor: 'Estrela' },
              loginSga({ k: 'loginSga2', rotUsuario: 'Usuário do SGA', rotSenha: 'Senha do SGA' }),
              { t: 'acao', rot: 'Buscar tipos no SGA', resposta: '6 tipos de veículo ativos.' },
              { t: 'ajuda', texto: 'O tipo "Todos" (código 0) vale para todos os tipos e sempre está disponível, mesmo sem buscar no SGA.' },
            ] },
            { titulo: 'Padrões para todos os produtos', larga: true, campos: [
              { t: 'ajuda', texto: 'Valem para todos os produtos. Em cada produto dá para mudar só aquele. Alterar um padrão aqui muda os produtos que ainda não foram editados.' },
              { t: 'grupo', campos: [{ k: 'pPref', t: 'texto', rot: 'Início da descrição', valor: 'ARX' }, { k: 'pForn', t: 'select', rot: 'Fornecedor', opcoes: ['Assistência Exemplo 24h', 'Rastreia Exemplo'], valor: 'Assistência Exemplo 24h' }, { k: 'pClas', t: 'select', rot: 'Classificação', opcoes: ['Assistência', 'Benefício'], valor: 'Assistência' }] },
              { t: 'grupo', campos: [{ k: 'pFipeI', t: 'texto', rot: 'Valor FIPE inicial', valor: '0,00' }, { k: 'pFipeF', t: 'texto', rot: 'Valor FIPE final', valor: '999.999,00' }] },
              { t: 'grupo', campos: ['Exibir no boleto', 'Exibir no termo', 'Exibir no MCV', 'Compulsório no SGA', 'Padrão'].map((r, k) => ({ k: 'pSN' + k, t: 'select', rot: r, opcoes: ['S', 'N'], valor: k < 2 ? 'S' : 'N' })) },
              { k: 'pTipos', t: 'chips', rot: 'Tipos de veículo padrão do produto', opcoes: ['0 · Todos', '1 · VEÍCULOS LEVES', '2 · PICK-UPS', '3 · MOTOCICLETAS', '7 · FLAT LEVES'], valor: ['0 · Todos'] },
              { k: 'pTiposAd', t: 'chips', rot: 'Tipos de veículo padrão do produto adicional (opcional)', opcoes: ['1 · VEÍCULOS LEVES', '2 · PICK-UPS', '3 · MOTOCICLETAS', '7 · FLAT LEVES'], valor: [], ajuda: 'Cada produto tem as duas escolhas, separadas: o mesmo produto pode sair normal em alguns tipos e adicional (com " (opcional)" na descrição) em outros. Produtos da categoria Opcionais já vêm só como adicional. O desconto vai sempre como N.' },
            ] },
            { titulo: 'Produtos', larga: true, campos: [
              { k: 'produtos', t: 'escolha', botao: 'Mostrar os produtos lidos', colunas: ['Produto', 'Categoria', 'Valor', 'Tipos', 'Fornecedor'], marcarTudo: true,
                linhas: [['Assistência 24h 500 km', 'Assistência', 'R$ 19,90', 'Todos', 'Assistência Exemplo 24h'], ['Carro reserva 7 dias', 'Benefícios', 'R$ 24,90', 'Todos', 'Assistência Exemplo 24h'], ['Vidros', 'Cobertura', 'R$ 14,90', 'Todos', 'Assistência Exemplo 24h'], ['Rastreador', 'Opcionais', 'R$ 39,90', 'Leves (opcional)', 'Rastreia Exemplo'], ['Proteção a terceiros 50 mil', 'Cobertura', 'R$ 29,90', 'Todos', 'Assistência Exemplo 24h'], ['Clube de descontos', 'Benefícios', 'R$ 4,90', 'Todos', 'Assistência Exemplo 24h']],
                extras: ['Marcar todos', 'Desmarcar todos', 'Apagar o rascunho salvo'], obrig: true },
            ], iniciar: 'Gerar planilha' },
          ],
          itens: (v) => v.produtos.map((p) => ({ nome: p })),
          colunas: ['Produto', 'Status', 'Detalhe'],
          passos: (i) => ['Montando a linha de ' + i.nome],
          resultado: () => ({ sit: 'ok', texto: 'Na planilha', detalhe: entre(1, 5) + ' linhas (uma por tipo)' }),
          arquivoFinal: 'produtos-sga-estrela.xlsx',
        },
      ],
    },

    // ---------------------------------------------------------------- Cadastro de colaborador (duas telas)
    'cadastro-usuario': {
      titulo: 'Cadastro de colaborador', icone: 'UserPlus', sistemas: ['SGA', 'PowerCRM'], umaColuna: true,
      sub: 'Cadastro de colaboradores no SGA ou no PowerCRM a partir da mensagem de cadastro.',
      abas: [
        { k: 'sga', titulo: 'Cadastro no SGA', desc: 'Cria o usuário em cada associação marcada.',
          secoes: [{ titulo: 'Cadastro no SGA', semNumero: true, campos: [
            { k: 'assocs', t: 'logins-assoc', rot: 'Associações', ajuda: 'O mesmo lote de colaboradores é executado em cada associação marcada.' },
            lembrar,
            { k: 'senhaPadrao', t: 'senha', rot: 'Senha padrão dos colaboradores', valor: 'Exemplo@2026', hub: true, ajuda: 'Senha atribuída a todos os colaboradores. No primeiro login o SGA pede para trocar.' },
            { k: 'msg', t: 'area', rot: 'Mensagem de cadastro', alto: true, mono: true, obrig: true, placeholder: 'NOME: Fulano de Tal\nCPF: 000.000.000-00\nEMAIL: fulano@arx.com.br\nTELEFONE: (31) 99999-9999\nUSUARIO: fulano.tal',
              valor: pessoas(2).map((n) => 'NOME: ' + n + '\nCPF: ' + cpf() + '\nEMAIL: ' + D.login(n) + '@exemplo.com\nTELEFONE: (62) 90000-' + entre(1000, 9999) + '\nUSUARIO: ' + D.login(n)).join('\n\n') },
            { t: 'ajuda', texto: 'O grupo de permissão do SGA é definido automaticamente a partir do role, por associação.', destaque: true },
            modoExec(),
          ], iniciar: 'Iniciar' }],
          itens: (v) => v.msg.split(/\n\s*\n/).map((b) => (b.match(/NOME:\s*(.+)/) || [])[1]).filter(Boolean).flatMap((nome) => v.assocs.map((a) => ({ nome, empresa: a }))),
          colunas: ['Colaborador', 'Associação', 'Status', 'Detalhe'],
          passos: (i) => ['[' + i.empresa + '] SGA: conferindo o CPF de ' + i.nome, '[' + i.empresa + '] Criando o usuário com o grupo do role', '[' + i.empresa + '] Conferindo o cadastro salvo'],
          // regra: no SGA o login e a senha vão no próprio chamado (o SGA pede a troca no primeiro login)
          resultado: (i, n, v) => (sorte(0.15) ? { sit: 'aviso', texto: 'Já existia', detalhe: 'Usuário reativado: ' + D.login(i.nome) } : { sit: 'ok', texto: 'Criado', detalhe: 'Usuário ' + D.login(i.nome) + ' · senha ' + v.senhaPadrao + ' (troca no primeiro login)' }),
          tituloLog: 'Log da execução (SGA)',
        },
        { k: 'crm', titulo: 'Cadastro no PowerCRM', desc: 'Cria o usuário em cada empresa do PowerCRM marcada.',
          secoes: [{ titulo: 'Cadastro no PowerCRM', semNumero: true, campos: [
            { k: 'empresasCrm', t: 'empresas', rot: 'Empresas do PowerCRM', opcoes: BASES, valor: [BASES[0]], obrig: true, ajuda: 'O mesmo lote de colaboradores é executado em cada empresa marcada.' },
            loginCrm(), lembrar,
            { k: 'msgCrm', t: 'area', rot: 'Mensagem de cadastro', alto: true, mono: true, obrig: true, placeholder: 'NOME: Fulano de Tal\nCPF: 000.000.000-00\nEMAIL: fulano@arx.com.br\nTELEFONE: (31) 99999-9999',
              valor: pessoas(2).map((n) => 'NOME: ' + n + '\nCPF: ' + cpf() + '\nEMAIL: ' + D.login(n) + '@exemplo.com\nTELEFONE: (62) 90000-' + entre(1000, 9999)).join('\n\n') },
            { t: 'ajuda', texto: 'O grupo de permissão do PowerCRM é definido automaticamente a partir do role, por associação.', destaque: true },
            modoExec('modoCrm'),
          ], iniciar: 'Iniciar' }],
          itens: (v) => v.msgCrm.split(/\n\s*\n/).map((b) => (b.match(/NOME:\s*(.+)/) || [])[1]).filter(Boolean).flatMap((nome) => v.empresasCrm.map((a) => ({ nome, empresa: a }))),
          colunas: ['Colaborador', 'Empresa', 'Status', 'Detalhe'],
          passos: (i) => ['[' + i.empresa + '] PowerCRM: procurando o e-mail de ' + i.nome, '[' + i.empresa + '] Criando o usuário com o perfil do role'],
          // regra: no CRM o acesso vai por e-mail; quem já tinha acesso com o mesmo e-mail só sai e entra de novo (multitenant)
          resultado: (i) => (sorte(0.3) ? { sit: 'aviso', texto: 'Já tinha acesso', detalhe: 'Mesmo e-mail em outra base: basta sair e entrar de novo no CRM, a base nova já aparece.' } : { sit: 'ok', texto: 'Criado', detalhe: 'Dados de acesso enviados por e-mail pelo PowerCRM.' }),
          tituloLog: 'Log da execução (PowerCRM)',
        },
      ],
    },

    generica: {
      titulo: 'Automação', icone: 'Workflow', sistemas: ['SGA'],
      sub: 'Exemplo genérico de tela de automação.',
      secoes: [{ titulo: 'Dados', campos: [{ k: 'alvos', t: 'area', rot: 'Itens', valor: 'Item 1\nItem 2\nItem 3', obrig: true }], iniciar: 'Iniciar' }],
      itens: (v) => linhas(v.alvos).map((nome) => ({ nome })),
      colunas: ['Item', 'Status', 'Detalhe'],
      passos: (i) => ['Processando ' + i.nome],
      resultado: () => ({ sit: 'ok', texto: 'Feito', detalhe: '' }),
    },
  };

  // Nome do cartão do Painel -> chave da definição (a Foto de perfil tem página própria).
  const MAPA = [
    [/foto de perfil/i, 'foto'], [/status.*usu/i, 'alt-status-usuario'], [/status.*volunt/i, 'alt-status-voluntario'], [/cadastro de volunt/i, 'cadastro-voluntario'],
    [/colaborador|cadastro de usu/i, 'cadastro-usuario'], [/grupos de perm/i, 'grupos-permissao'], [/cooperativ/i, 'atualizar-cooperativas'], [/gerenciar perm/i, 'gerenciar-permissoes'],
    [/relat/i, 'relatorios'], [/buscar grupos/i, 'buscar-grupos-sga'], [/modelo/i, 'cadastro-modelo'], [/senha/i, 'alterar-senha'], [/vistoria/i, 'sincronizar-vistoria'],
    [/buscar regionais/i, 'buscar-regionais'], [/criar regionais/i, 'criar-regionais'], [/buscar tabelas/i, 'buscar-tabelas'], [/criar tabelas/i, 'criar-tabelas'], [/convert/i, 'converter-planilha'],
  ];
  function chaveDe(nome) { const m = MAPA.find(([r]) => r.test(nome || '')); return m ? m[1] : 'generica'; }

  window.ExemploAutomacoes = { DEFS, chaveDe, EMP, BASES, SITUACOES, um, entre };
})();
