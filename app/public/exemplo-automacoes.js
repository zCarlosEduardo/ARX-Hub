// Definições das telas de exemplo das automações (exemplo-automacao.html?a=<chave>). Dados FICTÍCIOS:
// cada definição diz os campos (já preenchidos), o que vira item na execução simulada e como sai cada resultado.
(function () {
  const D = window.ExemploDados;
  const EMP = D.ASSOCIACOES.map((a) => a.replace('Associação ', ''));
  const BASES = EMP.map((x) => x + ' Proteção');
  const pessoas = (n) => Array.from({ length: n }, () => D.pessoa());
  const linhas = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const cruzar = (itens, empresas) => (empresas && empresas.length ? empresas.flatMap((emp) => itens.map((nome) => ({ nome, empresa: emp }))) : itens.map((nome) => ({ nome })));
  const sorte = (p) => Math.random() < p;
  const UFS = [['Goiânia', 'GO'], ['Anápolis', 'GO'], ['Brasília', 'DF'], ['Uberlândia', 'MG'], ['Cuiabá', 'MT'], ['Palmas', 'TO'], ['Campo Grande', 'MS'], ['Rio Verde', 'GO']];

  const acessoSga = { k: 'loginSga', t: 'acesso', sistema: 'SGA' };
  const acessoCrm = { k: 'loginCrm', t: 'acesso', sistema: 'PowerCRM' };
  const modo = { k: 'modo', t: 'modo', valor: 'sem' };

  const DEFS = {
    'alterar-senha': {
      titulo: 'Alterar senha SGA', icone: 'Key', sub: 'Troca a senha de usuários do SGA nas empresas marcadas, com uma variação da senha base para cada pessoa.', teste: true,
      secoes: [
        { titulo: 'Onde', campos: [{ k: 'empresas', t: 'empresas', rot: 'Empresas', valor: ['Aurora', 'Boreal'], obrig: true }] },
        { titulo: 'Acesso', campos: [acessoSga] },
        { titulo: 'Quem', campos: [
          { k: 'alvos', t: 'linhas', rot: 'Usuários', valor: pessoas(3).map(D.login).join('\n'), ajuda: 'Nome, CPF ou usuário, um por linha. Os mesmos em todas as empresas marcadas.', obrig: true },
          { k: 'base', t: 'texto', rot: 'Senha base', valor: 'Exemplo@2026', mono: true, ajuda: 'Cada pessoa recebe uma variação; a senha nova aparece só no resultado.', obrig: true },
        ] },
      ],
      itens: (v) => cruzar(linhas(v.alvos), v.empresas),
      passos: (i) => ['Entrando no SGA da ' + i.empresa, 'Procurando ' + i.nome, 'Trocando a senha'],
      resultado: (i, n) => (sorte(0.12) ? { sit: 'erro', texto: 'Não encontrado', detalhe: 'Nenhum usuário com esse login na ' + i.empresa + '.' } : { sit: 'ok', texto: 'Senha trocada', detalhe: 'Variação ' + (n + 1) + ' da senha base' }),
    },
    'alt-status-usuario': {
      titulo: 'Bloqueio e ativação de usuário', icone: 'UserCheck', sub: 'Bloqueia ou ativa usuários no SGA e no PowerCRM, em várias empresas de uma vez.', teste: true,
      secoes: [
        { titulo: 'O que fazer', campos: [
          { k: 'acao', t: 'seg', rot: 'Ação', opcoes: [['bloquear', 'Bloquear'], ['ativar', 'Ativar']], valor: 'bloquear' },
          { k: 'sistemas', t: 'checks', rot: 'Sistemas', opcoes: ['SGA', 'PowerCRM'], valor: ['SGA', 'PowerCRM'], obrig: true },
          { k: 'empresas', t: 'empresas', rot: 'Empresas', valor: ['Aurora', 'Cerrado', 'Delta'], obrig: true },
        ] },
        { titulo: 'Acessos', campos: [acessoSga, acessoCrm] },
        { titulo: 'Quem', campos: [
          { k: 'alvos', t: 'linhas', rot: 'CPF, nome ou usuário', valor: pessoas(4).join('\n'), ajuda: 'Um por linha.', obrig: true },
          { k: 'arquivo', t: 'arquivo', rot: 'Ou uma planilha', aceita: '.xlsx, .xls ou .csv com a coluna CPF, Nome ou Usuário', exemplo: 'desligados-outubro.xlsx · 12 linhas' },
        ] },
      ],
      itens: (v) => cruzar(linhas(v.alvos), v.empresas).flatMap((i) => v.sistemas.map((s) => Object.assign({ sistema: s }, i))),
      colunas: ['Pessoa', 'Empresa', 'Sistema', 'Situação', 'Detalhe'],
      passos: (i) => ['Abrindo o ' + i.sistema + ' da ' + i.empresa, 'Procurando ' + i.nome],
      resultado: (i, n, v) => (sorte(0.1) ? { sit: 'aviso', texto: 'Já estava ' + (v.acao === 'bloquear' ? 'bloqueado' : 'ativo'), detalhe: 'Nada mudou.' } : sorte(0.08) ? { sit: 'erro', texto: 'Não encontrado', detalhe: 'Sem cadastro nessa empresa.' } : { sit: 'ok', texto: v.acao === 'bloquear' ? 'Bloqueado' : 'Ativado', detalhe: '' }),
    },
    'alt-status-voluntario': {
      titulo: 'Bloqueio e ativação de voluntário', icone: 'Users', sub: 'Bloqueia ou ativa voluntários no SGA e no PowerCRM de uma empresa.', teste: true,
      secoes: [
        { titulo: 'O que fazer', campos: [
          { k: 'empresa', t: 'select', rot: 'Empresa', opcoes: EMP, valor: 'Boreal' },
          { k: 'acao', t: 'seg', rot: 'Ação', opcoes: [['bloquear', 'Bloquear'], ['ativar', 'Ativar']], valor: 'ativar' },
        ] },
        { titulo: 'Acessos', campos: [acessoSga, acessoCrm] },
        { titulo: 'Quem', campos: [{ k: 'alvos', t: 'linhas', rot: 'CPF ou nome', valor: pessoas(3).join('\n'), obrig: true }] },
      ],
      itens: (v) => linhas(v.alvos).map((nome) => ({ nome, empresa: v.empresa })),
      passos: (i) => ['Procurando ' + i.nome + ' no SGA', 'Procurando no PowerCRM'],
      resultado: (i, n, v) => (sorte(0.12) ? { sit: 'erro', texto: 'Não encontrado no CRM', detalhe: 'O SGA foi alterado; o CRM não tem esse voluntário.' } : { sit: 'ok', texto: v.acao === 'bloquear' ? 'Bloqueado nos dois' : 'Ativado nos dois', detalhe: '' }),
    },
    'cadastro-voluntario': {
      titulo: 'Cadastro de voluntário', icone: 'UserPlus', sub: 'Lê a mensagem do voluntário, cadastra no PowerCRM e faz a integração com o SGA.', teste: true,
      secoes: [
        { titulo: 'Onde', campos: [
          { k: 'assoc', t: 'select', rot: 'Associação', opcoes: D.ASSOCIACOES, valor: D.ASSOCIACOES[2] },
          { k: 'coop', t: 'select', rot: 'Cooperativa do SGA (opcional)', opcoes: ['Detectar pela mensagem', 'Cooperativa Centro', 'Cooperativa Norte', 'Cooperativa Sul'], valor: 'Detectar pela mensagem' },
        ] },
        { titulo: 'Acesso', campos: [acessoCrm] },
        { titulo: 'Voluntário', campos: [{ k: 'msg', t: 'linhas', rot: 'Mensagem do voluntário', alto: true, obrig: true, valor: (() => { const n = D.pessoa(); return 'Nome: ' + n + '\nCPF: 000.000.000-00\nE-mail: ' + D.login(n) + '@exemplo.com\nTelefone: (62) 90000-0000\nCidade: Goiânia/GO\nCooperativa: Centro'; })(), ajuda: 'Cole a mensagem como chegou. A automação acha os campos pelos rótulos.' }] },
        { titulo: 'Execução', campos: [modo] },
      ],
      itens: (v) => [{ nome: (linhas(v.msg)[0] || '').replace('Nome: ', '') || 'Voluntário', empresa: v.assoc.replace('Associação ', '') }],
      passos: () => ['Lendo a mensagem', 'Entrando no PowerCRM', 'Criando o voluntário', 'Integrando com o SGA'],
      resultado: () => ({ sit: 'ok', texto: 'Cadastrado', detalhe: 'PowerCRM e SGA (cooperativa Centro)' }),
    },
    'cadastro-usuario': {
      titulo: 'Cadastro de colaborador', icone: 'UserPlus', sub: 'Cria o usuário do colaborador no SGA e no PowerCRM com o perfil do departamento.', teste: true,
      secoes: [
        { titulo: 'Colaborador', campos: [
          { k: 'nome', t: 'texto', rot: 'Nome completo', valor: D.pessoa(), obrig: true },
          { k: 'cpf', t: 'texto', rot: 'CPF', valor: '000.000.000-00', mono: true, obrig: true },
          { k: 'email', t: 'texto', rot: 'E-mail', valor: 'colaborador@exemplo.com' },
          { k: 'depto', t: 'select', rot: 'Departamento', opcoes: D.DEPTOS, valor: 'Comercial' },
        ] },
        { titulo: 'Onde', campos: [
          { k: 'sistemas', t: 'checks', rot: 'Sistemas', opcoes: ['SGA', 'PowerCRM'], valor: ['SGA', 'PowerCRM'], obrig: true },
          { k: 'empresas', t: 'empresas', rot: 'Empresas', valor: ['Aurora'], obrig: true },
          { k: 'perfil', t: 'select', rot: 'Perfil de acesso', opcoes: ['Igual ao departamento', 'Consultor', 'Supervisor', 'Somente leitura'], valor: 'Igual ao departamento' },
        ] },
        { titulo: 'Acessos', campos: [acessoSga, acessoCrm] },
      ],
      itens: (v) => v.empresas.flatMap((emp) => v.sistemas.map((s) => ({ nome: v.nome, empresa: emp, sistema: s }))),
      colunas: ['Pessoa', 'Empresa', 'Sistema', 'Situação', 'Detalhe'],
      passos: (i) => ['Abrindo o ' + i.sistema + ' da ' + i.empresa, 'Conferindo se o CPF já existe', 'Criando o usuário'],
      resultado: (i) => (i.sistema === 'SGA' && sorte(0.2) ? { sit: 'aviso', texto: 'Já existia', detalhe: 'Usuário reativado em vez de criado.' } : { sit: 'ok', texto: 'Criado', detalhe: 'Usuário ' + D.login(i.nome) }),
    },
    'grupos-permissao': {
      titulo: 'Grupos de permissão', icone: 'Shield', sub: 'Copia grupos de permissão de um SGA modelo para outros SGAs.', teste: true,
      secoes: [
        { titulo: 'Leitura', campos: [{ k: 'modelo', t: 'select', rot: 'SGA modelo', opcoes: EMP, valor: 'Aurora' }, acessoSga] },
        { titulo: 'Grupos', campos: [{ k: 'grupos', t: 'escolha', rot: 'Grupos do SGA modelo', botao: 'Ler os grupos', colunas: ['Grupo', 'Permissões'], linhas: ['Consultor', 'Supervisor comercial', 'Cadastro', 'Financeiro', 'Eventos', 'Vistoriador', 'Diretoria'].map((g) => [g, String(20 + g.length * 3)]), obrig: true }] },
        { titulo: 'Destino', campos: [
          { k: 'empresas', t: 'empresas', rot: 'SGAs de destino', valor: ['Boreal', 'Delta'], obrig: true },
          { k: 'existe', t: 'seg', rot: 'Se o grupo já existir', opcoes: [['pular', 'Pular'], ['atualizar', 'Atualizar permissões']], valor: 'pular' },
        ] },
      ],
      itens: (v) => cruzar(v.grupos, v.empresas),
      passos: (i) => ['Abrindo o SGA da ' + i.empresa, 'Criando o grupo ' + i.nome],
      resultado: (i, n, v) => (sorte(0.25) ? { sit: 'aviso', texto: v.existe === 'pular' ? 'Já existia, pulado' : 'Atualizado', detalhe: '' } : { sit: 'ok', texto: 'Criado', detalhe: 'Permissões copiadas' }),
    },
    'atualizar-cooperativas': {
      titulo: 'Atualizar cooperativas', icone: 'Building2', sub: 'Lê as cooperativas do SGA e do PowerCRM e atualiza o banco central.',
      secoes: [{ titulo: 'Onde', campos: [{ k: 'empresas', t: 'empresas', rot: 'Empresas', valor: EMP.slice(), obrig: true }] }, { titulo: 'Acesso', campos: [acessoCrm] }],
      itens: (v) => v.empresas.map((emp) => ({ nome: 'Cooperativas', empresa: emp })),
      passos: (i) => ['Lendo as cooperativas da ' + i.empresa, 'Comparando com o banco central'],
      resultado: () => { const novas = Math.floor(Math.random() * 3); return { sit: 'ok', texto: novas ? novas + (novas === 1 ? ' nova' : ' novas') : 'Sem mudança', detalhe: (8 + Math.floor(Math.random() * 10)) + ' cooperativas conferidas' }; },
    },
    'gerenciar-permissoes': {
      titulo: 'Gerenciar permissões', icone: 'Lock', sub: 'Liga e desliga permissões de perfis do PowerCRM em lote.', teste: true,
      secoes: [
        { titulo: 'Onde', campos: [{ k: 'base', t: 'select', rot: 'Base do PowerCRM', opcoes: BASES, valor: BASES[0] }, acessoCrm] },
        { titulo: 'Perfis', campos: [{ k: 'perfis', t: 'escolha', rot: 'Perfis', botao: 'Ler os perfis', colunas: ['Perfil', 'Usuários'], linhas: [['Consultor', '84'], ['Supervisor', '12'], ['Gerente regional', '6'], ['Cadastro', '9'], ['Atendimento', '21']], obrig: true }] },
        { titulo: 'Permissões', campos: [{ k: 'perms', t: 'checks', rot: 'Ligar', opcoes: ['Exportar cards', 'Ver todas as regionais', 'Editar tabela de preço', 'Excluir negociação'], valor: ['Exportar cards'], obrig: true }] },
      ],
      itens: (v) => v.perfis.map((p) => ({ nome: p, empresa: v.base })),
      passos: (i) => ['Abrindo o perfil ' + i.nome, 'Marcando as permissões'],
      resultado: (i, n, v) => ({ sit: 'ok', texto: 'Atualizado', detalhe: v.perms.length + (v.perms.length === 1 ? ' permissão ligada' : ' permissões ligadas') }),
    },
    'relatorios': {
      titulo: 'Relatórios SGA', icone: 'BarChart3', sub: 'Extrai relatórios do SGA de várias empresas e junta em uma planilha.',
      secoes: [
        { titulo: 'Relatório', campos: [
          { k: 'rel', t: 'select', rot: 'Relatório', opcoes: ['Fotografia de veículos', 'Veículos', 'Boletos', 'Fotografia de boletos'], valor: 'Boletos' },
          { k: 'periodo', t: 'periodo', rot: 'Período (dia 1 de cada mês)', valor: { de: '2026-07', ate: '2026-09' } },
          { k: 'recorrente', t: 'checks', rot: 'Opções', opcoes: ['Recorrente (todo mês, sozinho)', 'Juntar todas as empresas em uma planilha'], valor: ['Juntar todas as empresas em uma planilha'] },
          { k: 'campos', t: 'chips', rot: 'Dados visualizados', opcoes: ['Placa', 'Associado', 'Situação', 'Valor', 'Vencimento', 'Pagamento', 'Cooperativa', 'Tipo de boleto', 'Regional', 'Consultor'], valor: ['Placa', 'Associado', 'Situação', 'Valor', 'Vencimento'] },
        ] },
        { titulo: 'Onde', campos: [{ k: 'empresas', t: 'empresas', rot: 'Empresas', valor: ['Aurora', 'Boreal', 'Cerrado'], obrig: true }, acessoSga] },
        { titulo: 'Execução', campos: [modo] },
      ],
      itens: (v) => v.empresas.map((emp) => ({ nome: v.rel, empresa: emp })),
      passos: (i) => ['Abrindo o relatório na ' + i.empresa, 'Marcando ' + 'os campos', 'Esperando o SGA gerar', 'Baixando a planilha'],
      resultado: () => (sorte(0.1) ? { sit: 'erro', texto: 'SGA não gerou', detalhe: 'Tempo esgotado depois de 3 minutos.' } : { sit: 'ok', texto: 'Baixado', detalhe: (1200 + Math.floor(Math.random() * 6000)).toLocaleString('pt-BR') + ' linhas' }),
      arquivoFinal: 'relatorio-boletos-jul-set.xlsx',
    },
    'buscar-grupos-sga': {
      titulo: 'Buscar grupos do SGA', icone: 'Database', sub: 'Lê os grupos de permissão de um SGA e guarda no banco central.',
      secoes: [{ titulo: 'Onde', campos: [{ k: 'empresa', t: 'select', rot: 'SGA (empresa)', opcoes: EMP, valor: 'Delta' }, acessoSga] }, { titulo: 'Filtro', campos: [{ k: 'grupos', t: 'linhas', rot: 'Grupos específicos (opcional)', valor: '', ajuda: 'Vazio: todos os grupos.' }] }],
      itens: (v) => (linhas(v.grupos).length ? linhas(v.grupos) : ['Consultor', 'Supervisor comercial', 'Cadastro', 'Financeiro', 'Vistoriador']).map((g) => ({ nome: g, empresa: v.empresa })),
      passos: (i) => ['Lendo o grupo ' + i.nome],
      resultado: () => ({ sit: 'ok', texto: 'Guardado', detalhe: (15 + Math.floor(Math.random() * 40)) + ' permissões' }),
    },
    'cadastro-modelo': {
      titulo: 'Cadastrar modelo SGA', icone: 'Car', sub: 'Cadastra no SGA o modelo de veículo a partir do código FIPE.', teste: true,
      secoes: [{ titulo: 'Modelo', campos: [{ k: 'fipe', t: 'texto', rot: 'Código FIPE', valor: '001234-5', mono: true, obrig: true, ajuda: 'Formato 000000-0.' }] }, { titulo: 'Onde', campos: [{ k: 'empresa', t: 'select', rot: 'SGA (empresa)', opcoes: EMP, valor: 'Estrela' }, acessoSga] }],
      itens: (v) => [{ nome: 'FIPE ' + v.fipe, empresa: v.empresa }],
      passos: () => ['Consultando a FIPE', 'Procurando a marca no SGA', 'Cadastrando o modelo'],
      resultado: () => ({ sit: 'ok', texto: 'Cadastrado', detalhe: 'Exemplo Modelo 1.0 Flex 2024 (marca já existia)' }),
    },
    'sincronizar-vistoria': {
      titulo: 'Sincronizar vistoria', icone: 'Camera', sub: 'Leva as fotos da vistoria do card do PowerCRM para o veículo no SGA.', teste: true,
      secoes: [
        { titulo: 'Veículo', campos: [{ k: 'id', t: 'texto', rot: 'Placa, chassi ou ID da cotação', valor: D.placa(), mono: true, obrig: true }] },
        { titulo: 'Onde', campos: [{ k: 'assoc', t: 'select', rot: 'Associação', opcoes: D.ASSOCIACOES, valor: D.ASSOCIACOES[0] }, { k: 'base', t: 'select', rot: 'Base do PowerCRM', opcoes: BASES, valor: BASES[0] }, acessoCrm] },
        { titulo: 'Execução', campos: [modo] },
      ],
      itens: (v) => [{ nome: v.id, empresa: v.assoc.replace('Associação ', '') }],
      passos: (i) => ['Buscando o card ' + i.nome, 'Conferindo a placa no card aberto', 'Baixando 18 fotos', 'Enviando para o SGA'],
      resultado: () => ({ sit: 'ok', texto: '18 fotos enviadas', detalhe: 'Vistoria de 14/10/2026' }),
    },
    'buscar-regionais': {
      titulo: 'Buscar regionais', icone: 'MapPin', sub: 'Lê as regionais e cidades de cada base do PowerCRM e guarda no banco central.',
      secoes: [{ titulo: 'Bases', campos: [{ k: 'empresas', t: 'empresas', rot: 'Bases do PowerCRM', opcoes: BASES, valor: BASES.slice(0, 3), obrig: true }] }, { titulo: 'Acesso', campos: [acessoCrm] }],
      itens: (v) => v.empresas.map((b) => ({ nome: 'Regionais', empresa: b })),
      passos: (i) => ['Trocando para a base ' + i.empresa, 'Lendo as regionais em lotes', 'Gravando no banco central'],
      resultado: () => ({ sit: 'ok', texto: (12 + Math.floor(Math.random() * 30)) + ' regionais', detalhe: (80 + Math.floor(Math.random() * 300)) + ' cidades' }),
    },
    'criar-regionais': {
      titulo: 'Criar regionais', icone: 'MapPin', sub: 'Copia regionais de uma base para outra no PowerCRM.', teste: true,
      secoes: [
        { titulo: 'Destino', campos: [{ k: 'destino', t: 'select', rot: 'Empresa de destino', opcoes: BASES, valor: BASES[3] }, acessoCrm] },
        { titulo: 'Origem', campos: [
          { k: 'origem', t: 'select', rot: 'Base de origem', opcoes: BASES, valor: BASES[0] },
          { k: 'regionais', t: 'escolha', rot: 'Regionais', botao: 'Validar a base de origem', colunas: ['Regional', 'UF', 'Cidades'], linhas: UFS.map(([c, uf]) => [c, uf, String(3 + c.length)]), obrig: true },
          { k: 'nome', t: 'checks', rot: 'Nome', opcoes: ['Pôr o nome da associação no nome das regionais'], valor: [] },
        ] },
      ],
      itens: (v) => v.regionais.map((r) => ({ nome: r, empresa: v.destino })),
      passos: (i) => ['Criando a regional ' + i.nome, 'Marcando as cidades'],
      resultado: () => (sorte(0.15) ? { sit: 'aviso', texto: 'Já existia', detalhe: 'Cidades conferidas, nada mudou.' } : { sit: 'ok', texto: 'Criada', detalhe: '' }),
    },
    'buscar-tabelas': {
      titulo: 'Buscar tabelas', icone: 'Table', sub: 'Lê as tabelas de preço do PowerCRM (dados gerais, regionais, marcas e faixas) e guarda no banco central.',
      secoes: [{ titulo: 'Bases', campos: [{ k: 'empresas', t: 'empresas', rot: 'Bases do PowerCRM', opcoes: BASES, valor: BASES.slice(1, 3), obrig: true }] }, { titulo: 'Acesso', campos: [acessoCrm] }],
      itens: (v) => v.empresas.map((b) => ({ nome: 'Tabelas', empresa: b })),
      passos: (i) => ['Trocando para a base ' + i.empresa, 'Lendo as tabelas em lotes'],
      resultado: () => ({ sit: 'ok', texto: (6 + Math.floor(Math.random() * 20)) + ' tabelas', detalhe: 'gravadas em lotes' }),
    },
    'criar-tabelas': {
      titulo: 'Criar tabelas', icone: 'Table', sub: 'Copia tabelas de preço de uma base para outra no PowerCRM.', teste: true,
      secoes: [
        { titulo: 'Destino', campos: [{ k: 'destino', t: 'select', rot: 'Empresa de destino', opcoes: BASES, valor: BASES[4] }, acessoCrm] },
        { titulo: 'Origem', campos: [
          { k: 'origem', t: 'select', rot: 'Base de origem', opcoes: BASES, valor: BASES[1] },
          { k: 'tabelas', t: 'escolha', rot: 'Tabelas', botao: 'Validar a base de origem', colunas: ['Tabela', 'Tipo de veículo', 'Faixas'], linhas: [['Leves 2026', 'Leves', '14'], ['Pesados 2026', 'Pesados', '9'], ['Motos 2026', 'Motos', '7'], ['Utilitários', 'Leves', '11'], ['App e táxi', 'Leves', '12']], obrig: true },
          { k: 'rateio', t: 'texto', rot: 'Rateio para todas as tabelas (opcional)', valor: '', placeholder: 'Ex.: 12,50' },
        ] },
      ],
      itens: (v) => v.tabelas.map((t) => ({ nome: t, empresa: v.destino })),
      passos: (i) => ['Criando a tabela ' + i.nome, 'Preenchendo as faixas', 'Ligando as regionais'],
      resultado: () => (sorte(0.1) ? { sit: 'erro', texto: 'Faixa recusada', detalhe: 'O CRM não aceitou a faixa de R$ 90.000 a R$ 120.000.' } : { sit: 'ok', texto: 'Criada', detalhe: '' }),
    },
    'converter-planilha': {
      titulo: 'Converter planilha', icone: 'Sheet', sub: 'Converte a planilha de preços da associação nas planilhas modelo de importação do PowerCRM e do SGA.',
      secoes: [
        { titulo: 'Planilha', campos: [
          { k: 'assoc', t: 'select', rot: 'Associação', opcoes: D.ASSOCIACOES, valor: D.ASSOCIACOES[4] },
          { k: 'arquivo', t: 'arquivo', rot: 'Planilha de preços', aceita: 'Arquivo .xlsx', exemplo: 'precos-estrela-2026.xlsx · aba Leves', obrig: true,
            previa: { titulo: 'Como a planilha foi entendida', colunas: ['Faixa de valor', 'Cota', 'Taxa adm.', 'Plano Básico', 'Plano Completo'], linhas: [['R$ 0 a R$ 30.000', '5%', 'R$ 49,90', 'R$ 89,00', 'R$ 129,00'], ['R$ 30.001 a R$ 60.000', '5%', 'R$ 59,90', 'R$ 119,00', 'R$ 169,00'], ['R$ 60.001 a R$ 90.000', '6%', 'R$ 69,90', 'R$ 149,00', 'R$ 209,00'], ['R$ 90.001 a R$ 120.000', '6%', 'R$ 79,90', 'R$ 189,00', 'R$ 259,00']] } },
        ] },
        { titulo: 'Ajustes', campos: [
          { k: 'codigos', t: 'texto', rot: 'Códigos dos planos', valor: 'BAS, COMP', mono: true },
          { k: 'inicio', t: 'texto', rot: 'Início da descrição', valor: 'ARX - COTA' },
          { k: 'tipos', t: 'chips', rot: 'Tipos de veículo do SGA', opcoes: ['LEVES', 'PICK-UPS', 'FLAT LEVES', 'FLAT PICK-UPS', 'MOTOS', 'PESADOS'], valor: ['LEVES', 'PICK-UPS', 'MOTOS'] },
        ] },
      ],
      itens: (v) => ['PowerCRM'].concat(v.tipos.map((t) => 'SGA ' + t)).map((n) => ({ nome: n })),
      colunas: ['Planilha', 'Situação', 'Detalhe'],
      passos: (i) => ['Montando a planilha ' + i.nome],
      resultado: () => ({ sit: 'ok', texto: 'Gerada', detalhe: (4 + Math.floor(Math.random() * 12)) + ' linhas' }),
      arquivoFinal: 'planilhas-estrela.zip',
    },
    generica: {
      titulo: 'Automação', icone: 'Workflow', sub: 'Exemplo genérico de tela de automação.',
      secoes: [{ titulo: 'Dados', campos: [{ k: 'alvos', t: 'linhas', rot: 'Itens', valor: 'Item 1\nItem 2\nItem 3', obrig: true }] }],
      itens: (v) => linhas(v.alvos).map((nome) => ({ nome })),
      colunas: ['Item', 'Situação', 'Detalhe'],
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

  window.ExemploAutomacoes = { DEFS, chaveDe, EMP, BASES };
})();
