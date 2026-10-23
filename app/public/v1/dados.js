// Dados de EXEMPLO do v1 visual (nada aqui vem do banco). Pessoas e números são fictícios; nomes de automações,
// associações e tipos de chamado são os do projeto. Totais saem das linhas e as conferências ficam no fim.
window.V1 = (() => {
  const agora = '14:32';

  // execuções de hoje por robô: [hora, ok]; o painel desenha um ponto por execução na linha do dia
  const robos = [
    { id: 'foto', nome: 'Foto de perfil', sistemas: ['Interno'], runs: [['08:12', 1], ['09:40', 1], ['11:05', 1], ['13:58', 1]] },
    { id: 'alt-usuario', nome: 'Alt. Status Usuário', sistemas: ['SGA', 'PowerCRM'], runs: [['08:30', 1], ['10:15', 1], ['13:20', 1]] },
    { id: 'alt-voluntario', nome: 'Alt. Status Voluntário', sistemas: ['SGA', 'PowerCRM'], runs: [['09:02', 1]] },
    { id: 'cad-voluntario', nome: 'Cadastro de Voluntário', sistemas: ['SGA', 'PowerCRM'], runs: [['08:45', 1], ['10:50', 1], ['12:10', 0]] },
    { id: 'cad-colaborador', nome: 'Cadastro de Colaborador Interno', sistemas: ['SGA', 'PowerCRM'], runs: [['09:25', 1]] },
    { id: 'senha', nome: 'Altera Senha', sistemas: ['SGA'], runs: [['08:05', 1], ['09:10', 1], ['10:20', 1], ['11:40', 0], ['11:52', 0], ['12:30', 0], ['14:05', 1]] },
    { id: 'relatorios', nome: 'Relatórios do SGA', sistemas: ['SGA'], runs: [['07:30', 1], ['12:00', 1]] },
    { id: 'modelo', nome: 'Cadastro de Modelo', sistemas: ['SGA'], runs: [] },
    { id: 'grupos', nome: 'Grupos de Permissão', sistemas: ['SGA'], runs: [['10:40', 1]] },
    { id: 'vistoria', nome: 'Sincronizar Vistoria', sistemas: ['SGA', 'PowerCRM'], runs: [['09:55', 1], ['13:15', 1]] },
    { id: 'regionais', nome: 'Criar Regionais', sistemas: ['PowerCRM'], runs: [] },
    { id: 'tabelas', nome: 'Criar Tabelas', sistemas: ['PowerCRM'], runs: [] },
    { id: 'planilha', nome: 'Converter Planilha', sistemas: ['PowerCRM', 'SGA'], runs: [['11:20', 1]] },
    { id: 'cooperativas', nome: 'Atualizar Cooperativas', banco: true, sistemas: ['SGA', 'PowerCRM'], runs: [['07:00', 1]] },
    { id: 'permissoes', nome: 'Gerenciar Permissões', banco: true, sistemas: ['Interno'], runs: [] },
    { id: 'buscar-grupos', nome: 'Buscar grupos do SGA', banco: true, sistemas: ['SGA'], runs: [['07:05', 1]] },
    { id: 'buscar-regionais', nome: 'Buscar Regionais', banco: true, sistemas: ['PowerCRM'], runs: [['07:10', 1]] },
    { id: 'buscar-tabelas', nome: 'Buscar Tabelas', banco: true, sistemas: ['PowerCRM'], runs: [['07:15', 1]] },
  ];

  // fila do GLPI (entidade Sistemas): situação decide a aba em Chamados
  const chamados = [
    { id: 13864, titulo: 'Cadastro CRM/SGA Ancore', tipo: 'Cadastro de consultor', assoc: 'Ancore', quem: 'Nícolas Freitas', aberto: '2 dias', sit: 'pronto' },
    { id: 13871, titulo: 'Alterar senha do SGA', tipo: 'Alterar senha do SGA', assoc: 'Unik', quem: 'Patrícia Lemos', aberto: '3 h', sit: 'erro', erro: 'Token da Unik expirou às 11:40' },
    { id: 13875, titulo: 'Inativar consultor', tipo: 'Inativação de consultor', assoc: 'Valle', quem: 'Rodrigo Salles', aberto: '5 h', sit: 'escolher', falta: 'Escolher a cooperativa' },
    { id: 13877, titulo: 'Foto de perfil para WhatsApp', tipo: 'Foto de perfil', assoc: 'Coopera Truck', quem: 'Juliana Prado', aberto: '1 h', sit: 'escolher', falta: 'Departamento não informado' },
    { id: 13880, titulo: 'Senha do PowerCRM', tipo: 'Senha de sistemas', assoc: 'Tech Protege', quem: 'André Viana', aberto: '40 min', sit: 'manual', motivo: 'Lido só pela descrição' },
    { id: 13882, titulo: 'Desbloquear usuário do SGA', tipo: 'Desbloquear usuário do SGA', assoc: 'Ancore', quem: 'Camila Rocha', aberto: '25 min', sit: 'manual', motivo: 'Sempre manual' },
    { id: 13859, titulo: 'Erro ao exportar card', tipo: 'Erro ao exportar modelo', assoc: 'Valle', quem: 'Felipe Moura', aberto: '3 dias', sit: 'analise', motivo: 'A IA discorda do tipo' },
    { id: 13861, titulo: 'Fotos SGA não sincronizaram', tipo: 'Sincronizar vistoria', assoc: 'Ancore', quem: 'Beatriz Nunes', aberto: '2 dias', sit: 'analise', motivo: 'Placa não encontrada no card' },
    { id: 13866, titulo: 'Reportar instabilidade no SGA', tipo: null, assoc: 'Exodo', quem: 'Lucas Teixeira', aberto: '1 dia', sit: 'analise', motivo: 'Sem automação para este pedido' },
    { id: 13868, titulo: 'Cadastro de modelo FIPE', tipo: 'Cadastro de modelo', assoc: 'Unik', quem: 'Renata Paiva', aberto: '1 dia', sit: 'resolvido' },
  ];
  const ABAS = [
    ['todos', 'Todos'], ['pronto', 'Prontos'], ['escolher', 'Falta escolher'], ['manual', 'Só manual'],
    ['erro', 'Com erro'], ['analise', 'Análise manual'], ['resolvido', 'Solucionados'],
  ];

  // Resultados: outubro até hoje (dia 22). Resolvidos e com erro por dia; os totais saem daqui
  const dias = Array.from({ length: 22 }, (_, i) => i + 1);
  const resolvidosDia = [3, 5, 0, 0, 6, 4, 7, 5, 3, 0, 0, 8, 6, 5, 4, 7, 0, 0, 9, 6, 5, 11];
  const errosDia = [1, 0, 0, 0, 2, 1, 1, 0, 1, 0, 0, 3, 1, 2, 0, 1, 0, 0, 2, 3, 1, 4];
  const porTipo = [
    ['Cadastro de consultor', 29, 7], ['Alterar senha do SGA', 24, 9], ['Foto de perfil', 17, 0], ['Cadastro de usuário', 9, 3],
    ['Bloqueio de acesso', 8, 1], ['Cadastro de modelo', 5, 2], ['Sincronizar vistoria', 2, 1],
  ]; // [tipo, resolvidos, com erro]
  const motivosErro = [
    ['Token do SGA expirado', 9], ['Cooperativa não encontrada', 6], ['Usuário já cadastrado no CRM', 5],
    ['Placa diferente no card', 2], ['Sessão do PowerCRM caiu', 1],
  ];
  const porAssoc = [['Ancore', 41], ['Valle', 25], ['Unik', 16], ['Coopera Truck', 12], ['Tech Protege', 9], ['Speed', 7], ['Exodo', 7]]; // atendidos (resolvidos + com erro)
  const porPessoa = [['Automático (fila)', 61], ['Patrícia Lemos', 14], ['Rodrigo Salles', 9], ['Camila Rocha', 6], ['André Viana', 4]];

  const execucoesAlt = [
    { job: 'a91f2c7e', quando: 'Hoje 13:20', quem: 'Patrícia Lemos', acao: 'Inativar', alvo: '3 pessoas', empresas: 'Ancore, Valle', res: 'ok' },
    { job: '5c0d81b3', quando: 'Hoje 10:15', quem: 'Automático (fila)', acao: 'Ativar', alvo: '1 pessoa', empresas: 'Unik', res: 'ok' },
    { job: 'e47a90d2', quando: 'Hoje 08:30', quem: 'Rodrigo Salles', acao: 'Inativar', alvo: '2 pessoas', empresas: 'Valle', res: 'ok', teste: true },
    { job: '7b3e15f9', quando: 'Ontem 17:42', quem: 'Camila Rocha', acao: 'Inativar', alvo: '1 pessoa', empresas: 'Exodo', res: 'erro', erro: 'CPF não encontrado no SGA' },
  ];
  const fotos = [
    { nome: 'Juliana Prado', depto: 'Cadastro', quando: 'Hoje 13:58' },
    { nome: 'Marcos Bastos', depto: 'Sinistro', quando: 'Hoje 11:05' },
    { nome: 'Helena Duarte', depto: 'Assistência', quando: 'Hoje 09:40' },
    { nome: 'Otávio Reis', depto: 'Comercial', quando: 'Hoje 08:12' },
  ];
  const relatorios = [
    { job: 'r0c3a9b1', quando: 'Hoje 12:00', tipo: 'Boletos', empresas: 'Ancore, Valle, Unik', linhas: 18432 },
    { job: 'r77e2d40', quando: 'Hoje 07:30', tipo: 'Fotografia de veículos', empresas: 'Ancore', linhas: 9210 },
    { job: 'r1b9f6c8', quando: 'Ontem 16:05', tipo: 'Veículos', empresas: 'Coopera Truck', linhas: 2871 },
  ];
  const empresasSga = ['Ancore', 'Ancore Máquinas', 'Ancore Dourados', 'Valle', 'Unik', 'Coopera Truck', 'Tech Protege', 'Exodo', 'Speed', 'Royale'];

  // ---- valores derivados (uma fonte por fato) ----
  const soma = (a) => a.reduce((s, v) => s + v, 0);
  const falhas = (r) => r.runs.filter(([, ok]) => !ok);
  const runsHoje = soma(robos.map((r) => r.runs.length));
  const errosHoje = soma(robos.map((r) => falhas(r).length));
  // 'todos' = tudo o que ainda está aberto; a contagem das abas e a lista de cada aba saem da mesma regra
  const filtra = (sit) => chamados.filter((c) => (sit === 'todos' ? c.sit !== 'resolvido' : c.sit === sit));
  const conta = (sit) => filtra(sit).length;
  const resolvidosMes = soma(resolvidosDia);
  const errosMes = soma(errosDia);
  const atendidosMes = resolvidosMes + errosMes;

  console.assert(soma(porTipo.map((t) => t[1])) === resolvidosMes, 'por tipo soma os resolvidos do mês');
  console.assert(soma(porTipo.map((t) => t[2])) === errosMes, 'por tipo soma os erros do mês');
  console.assert(soma(motivosErro.map((m) => m[1])) === errosMes, 'motivos somam os erros do mês');
  console.assert(soma(porAssoc.map((a) => a[1])) === atendidosMes, 'por associação soma os atendidos');
  console.assert(soma(porPessoa.map((p) => p[1])) === resolvidosMes, 'por pessoa soma os resolvidos');
  console.assert(robos.length === 18, '18 robôs');

  return {
    agora, robos, chamados, ABAS, filtra, conta, falhas, dias, resolvidosDia, errosDia, porTipo, motivosErro, porAssoc, porPessoa,
    execucoesAlt, fotos, relatorios, empresasSga, runsHoje, errosHoje, resolvidosMes, errosMes, atendidosMes,
  };
})();
