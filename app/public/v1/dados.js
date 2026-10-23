// Dados do v1 visual. As automações são o cadastro real (automacoes.js). O resto é EXEMPLO: pessoas, chamados e
// números fictícios, com os mesmos campos que o Hub mostra hoje. Totais saem das linhas; as conferências ficam no fim.
window.V1 = (() => {
  const agora = '14:32';
  const automacoes = window.V1_AUTOMACOES;
  const CATEGORIAS = { visto: 'Visto', sga: 'SGA', powercrm: 'PowerCRM', interno: 'Interno', db: 'Banco de Dados' };
  const nomeAuto = (id) => (automacoes.find((a) => a.id === id) || {}).nome || '';

  // ---------- Chamados: a fila da entidade Sistemas ----------
  // situação: pronto, falta, confirmar (só manual), erro, manual (análise manual), feitos (solucionados), naorodar
  const chamados = [
    { id: 13864, titulo: 'Cadastro CRM/SGA Ancore', solicitante: 'Nícolas Freitas', grupo: 'Sistemas', glpi: 'Pendente', tipo: 'Cadastro de consultor', categoria: 'Ancore', aberto: '2 dias', sit: 'pronto',
      leu: [['CPF', '123.***.***-09'], ['Nome', 'Nícolas Freitas'], ['Perfil', 'Consultor externo'], ['Cooperativa', 'Ancore Matriz']] },
    { id: 13871, titulo: 'Alterar senha do SGA', solicitante: 'Patrícia Lemos', grupo: 'Cadastro', glpi: 'Pendente', tipo: 'Alterar senha do SGA', categoria: 'Unik', aberto: '3 h', sit: 'erro',
      erro: 'Login no SGA da Unik recusado: token expirado às 11:40.', leu: [['Usuário alvo', 'patricia.lemos'], ['Sistemas citados', 'SGA']] },
    { id: 13875, titulo: 'Inativar consultor', solicitante: 'Rodrigo Salles', grupo: 'Comercial', glpi: 'Em atendimento', tipo: 'Inativação de consultor', categoria: 'Valle', aberto: '5 h', sit: 'falta',
      falta: 'Escolha a cooperativa', leu: [['CPF', '987.***.***-10'], ['Cooperativa', 'Não informado']] },
    { id: 13877, titulo: 'Foto de perfil para WhatsApp', solicitante: 'Juliana Prado', grupo: 'Assistência', glpi: 'Novo', tipo: 'Foto de perfil', categoria: 'Coopera Truck', aberto: '1 h', sit: 'falta',
      falta: 'Informe o departamento da foto', leu: [['Nome na foto', 'Juliana Prado'], ['Departamento na foto', 'Não informado']] },
    { id: 13880, titulo: 'Senha do PowerCRM', solicitante: 'André Viana', grupo: 'Comercial', glpi: 'Novo', tipo: 'Senha de sistemas', categoria: 'Tech Protege', aberto: '40 min', sit: 'confirmar',
      motivo: 'Reconhecido só pela descrição (confiança média)', leu: [['Usuário alvo', 'andre.viana'], ['Sistemas citados', 'CRM (PowerCRM)']] },
    { id: 13882, titulo: 'Desbloquear usuário do SGA', solicitante: 'Camila Rocha', grupo: 'Cadastro', glpi: 'Novo', tipo: 'Desbloquear usuário do SGA', categoria: 'Ancore', aberto: '25 min', sit: 'confirmar',
      motivo: 'Sempre manual', leu: [['Usuário alvo', 'camila.rocha'], ['Login no SGA', 'camila.rocha']] },
    { id: 13859, titulo: 'Erro ao exportar card', solicitante: 'Felipe Moura', grupo: 'Comercial', glpi: 'Pendente', tipo: 'Erro ao exportar modelo', categoria: 'Valle', aberto: '3 dias', sit: 'manual',
      motivo: 'A IA local sugere outro tipo', ia: ['Cadastro de modelo', 0.71] },
    { id: 13861, titulo: 'Fotos SGA não sincronizaram', solicitante: 'Beatriz Nunes', grupo: 'Vistoria', glpi: 'Pendente', tipo: 'Sincronizar vistoria', categoria: 'Ancore', aberto: '2 dias', sit: 'manual',
      motivo: 'Placa não encontrada no card' },
    { id: 13866, titulo: 'Reportar instabilidade no SGA', solicitante: 'Lucas Teixeira', grupo: 'Sinistro', glpi: 'Novo', tipo: '', categoria: 'Exodo', aberto: '1 dia', sit: 'manual', motivo: 'Sem automação' },
    { id: 13852, titulo: 'Cadastro de modelo FIPE', solicitante: 'Renata Paiva', grupo: 'Cadastro', glpi: 'Solucionado', tipo: 'Cadastro de modelo', categoria: 'Unik', aberto: '4 dias', sit: 'feitos' },
    { id: 13849, titulo: 'Bloqueio de acesso de ex-colaborador', solicitante: 'Marcos Bastos', grupo: 'RH', glpi: 'Solucionado', tipo: 'Bloqueio de acesso', categoria: 'Valle', aberto: '4 dias', sit: 'feitos' },
    { id: 13870, titulo: 'Cadastro duplicado', solicitante: 'Helena Duarte', grupo: 'Cadastro', glpi: 'Pendente', tipo: 'Cadastro de usuário', categoria: 'Speed', aberto: '6 h', sit: 'naorodar', motivo: 'Pedido duplicado' },
  ];
  const VISOES = [
    ['todos', 'Todos'], ['pronto', 'Prontos'], ['falta', 'Falta escolher'], ['confirmar', 'Só manual'],
    ['erro', 'Com erro'], ['manual', 'Análise manual'], ['feitos', 'Solucionados'], ['naorodar', 'Não rodar'],
  ];
  // "Todos" são os que a automação pode tratar: tudo menos análise manual, solucionados e não rodar
  const filtra = (v) => chamados.filter((c) => (v === 'todos' ? ['pronto', 'falta', 'confirmar', 'erro'].includes(c.sit) : c.sit === v));
  const conta = (v) => filtra(v).length;
  const abertosNaTela = chamados.filter((c) => c.sit !== 'feitos').length;
  const conversa = [
    ['Nícolas Freitas', 'há 2 dias', 'Bom dia, preciso do cadastro no SGA e no CRM para o novo consultor da Ancore. CPF e dados abaixo.'],
    ['Automação (modo teste)', 'há 1 dia', 'Cadastro conferido no SGA e no PowerCRM. Nada foi gravado: modo teste ligado.'],
  ];
  const execucao = { ids: [13864], linhas: ['[14:31:02] #13864: lendo o chamado', '[14:31:05] SGA Ancore: login com o acesso do Hub', '[14:31:19] SGA Ancore: consultor criado (modo teste, não salvo)', '[14:31:22] PowerCRM: abrindo a base Ancore Proteção Veicular'] };

  // ---------- Resultados ----------
  // outubro até hoje (dia 22); resolvidos e com erro pelos chamados
  const dias = Array.from({ length: 22 }, (_, i) => String(i + 1).padStart(2, '0') + '/10'); // taste-skill-ignore: data
  const resolvidosDia = [3, 5, 0, 0, 6, 4, 7, 5, 3, 0, 0, 8, 6, 5, 4, 7, 0, 0, 9, 6, 5, 11];
  const errosDia = [1, 0, 0, 0, 2, 1, 1, 0, 1, 0, 0, 3, 1, 2, 0, 1, 0, 0, 2, 3, 1, 4];
  const resolvidosMesAnterior = 81; const errosMesAnterior = 27;
  const porTipo = [['Cadastro de consultor', 29], ['Alterar senha do SGA', 24], ['Foto de perfil', 17], ['Cadastro de usuário', 9], ['Bloqueio de acesso', 8], ['Cadastro de modelo', 5], ['Sincronizar vistoria', 2]];
  const motivos = [['Token do SGA expirado', 9], ['Cooperativa não encontrada', 6], ['Usuário já cadastrado no CRM', 5], ['Placa diferente no card', 2], ['Sessão do PowerCRM caiu', 1]];
  const porHora = [0, 0, 0, 0, 0, 0, 0, 3, 11, 14, 12, 9, 4, 8, 11, 10, 7, 4, 1, 0, 0, 0, 0, 0]; // resolvidos por hora de início
  const assocs = [['Ancore', 41, 33], ['Valle', 25, 20], ['Unik', 16, 11], ['Coopera Truck', 12, 10], ['Tech Protege', 9, 8], ['Speed', 7, 6], ['Exodo', 7, 6]]; // [nome, chamados, resolvidos]
  const aprovadores = [['Automático (Carla Menezes)', 61, 52], ['Patrícia Lemos', 21, 17], ['Rodrigo Salles', 16, 12], ['Camila Rocha', 11, 8], ['André Viana', 8, 5]]; // [pessoa, execuções, resolvidos]
  const atendidos = [
    [13864, 'Cadastro CRM/SGA Ancore', 'Cadastro de consultor', 'Ancore', 'Carla Menezes', 'Hoje 14:31', 'Teste'],
    [13858, 'Alterar senha SGA Unik', 'Alterar senha do SGA', 'Unik', 'Automático', 'Hoje 13:20', 'Solucionado'],
    [13855, 'Foto de perfil Assistência', 'Foto de perfil', 'Coopera Truck', 'Automático', 'Hoje 11:05', 'Solucionado'],
    [13871, 'Alterar senha do SGA', 'Alterar senha do SGA', 'Unik', 'Automático', 'Hoje 11:40', 'Erro'],
    [13850, 'Cadastro de usuário Speed', 'Cadastro de usuário', 'Speed', 'Patrícia Lemos', 'Ontem 16:12', 'Solucionado'],
  ];
  const manuais = { execucoes: 14, itens: 52, concluidos: 47, erros: 5, minutos: 188, duracaoMedia: 96 };
  const porAuto = [['Extrai Relatórios', 5, 18, 18, 0], ['Alt. Status Usuário', 4, 21, 18, 3], ['Foto de perfil', 3, 9, 9, 0], ['Converter planilha', 2, 4, 2, 2]]; // [automação, execuções, itens, concluídos, erros]

  // ---------- Disponibilidade: últimos 30 dias, minutos fora do ar por dia ----------
  const servicos = [
    ['GLPI', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0]],
    ['Banco central', Array(30).fill(0)],
    ['Chamados do GLPI', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ['Tokens do SGA', [0, 0, 0, 35, 0, 0, 0, 0, 0, 70, 0, 0, 0, 35, 0, 0, 0, 0, 0, 0, 105, 35, 0, 0, 0, 0, 0, 35, 0, 70]],
    ['Robô do WhatsApp', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1440, 1440, 1440, 431]],
    ...automacoes.map((a) => [a.nome, a.id === '24' ? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 18, 0] : Array(30).fill(0)]),
  ];
  const quedas = [
    ['Tokens do SGA', 'Token da Unik recusado pelo SGA', 'Aviso', '22/10 11:40', null],
    ['Robô do WhatsApp', 'Robô sem sinal', 'Queda', '19/10 00:00', '22/10 07:11'],
    ['GLPI', 'GLPI fora do ar', 'Queda', '20/10 15:11', '20/10 15:16'],
    ['Tokens do SGA', 'Tokens de 7 empresas recusados', 'Aviso', '20/10 15:11', '20/10 15:46'],
  ];

  // ---------- Administração (exemplo) ----------
  const admins = [['CM', 'Carla Menezes', 'carla.menezes', 'Primeira administradora, 09/10'], ['RS', 'Rodrigo Salles', 'rodrigo.salles', 'Adicionado por Carla Menezes em 14/10']];
  const historico = [
    ['22/10 14:20', 'Carla Menezes', 'Alterou a configuração', 'Cofre: tempo liberado de 1 hora para 15 min'],
    ['21/10 18:02', 'Carla Menezes', 'Editou automação', 'Relatórios SGA: minutos por item de 5 para 8'],
    ['20/10 09:15', 'Rodrigo Salles', 'Mudou os grupos que veem a automação', 'Alt. Status Usuário: Sistemas, Cadastro'],
    ['14/10 10:40', 'Carla Menezes', 'Adicionou administrador', 'Rodrigo Salles'],
  ];
  const gruposGlpi = ['Sistemas', 'Cadastro', 'Comercial', 'Assistência', 'Vistoria', 'RH'];
  const vinculos = [['(62) 9 8412-****', 'Patrícia Lemos', 'Cadastro'], ['(62) 9 9137-****', 'Rodrigo Salles', 'Comercial'], ['(64) 9 9208-****', 'Juliana Prado', 'Assistência']];
  const pedidos = [
    ['Hoje 13:02', 'Grupo Cadastro Ancore', 'Patrícia Lemos', 'Senha do SGA travou', 'Chamado aberto', '#13871'],
    ['Hoje 10:44', 'Grupo Comercial Valle', 'Rodrigo Salles', 'Inativar o consultor que saiu', 'Concluído', '#13875'],
    ['Ontem 17:20', 'Privado', 'Sem vínculo', 'Bom dia, preciso de acesso', 'Sem vínculo', ''],
  ];
  const ia = { modelo: 'qwen2.5:1.5b', revisao: 'qwen2.5:7b', treinadoEm: '18/10 02:10', exemplos: 3360, acerto: 0.912, divergencias: 37, decididas: 112 };

  // ---------- conferências ----------
  const soma = (a) => a.reduce((s, v) => s + v, 0);
  const resolvidosMes = soma(resolvidosDia), errosMes = soma(errosDia), atendidosMes = resolvidosMes + errosMes;
  console.assert(soma(porTipo.map((t) => t[1])) === resolvidosMes, 'por tipo soma os resolvidos');
  console.assert(soma(motivos.map((m) => m[1])) === errosMes, 'motivos somam os erros');
  console.assert(soma(porHora) === resolvidosMes, 'por hora soma os resolvidos');
  console.assert(soma(assocs.map((a) => a[1])) === atendidosMes && soma(assocs.map((a) => a[2])) === resolvidosMes, 'associações somam atendidos e resolvidos');
  console.assert(soma(aprovadores.map((p) => p[1])) === atendidosMes && soma(aprovadores.map((p) => p[2])) === resolvidosMes, 'quem aprovou soma atendidos e resolvidos');
  console.assert(soma(porAuto.map((p) => p[1])) === manuais.execucoes && soma(porAuto.map((p) => p[2])) === manuais.itens, 'por automação soma as manuais');
  console.assert(manuais.concluidos + manuais.erros === manuais.itens, 'itens manuais fecham');

  return {
    agora, automacoes, CATEGORIAS, nomeAuto, chamados, VISOES, filtra, conta, abertosNaTela, conversa, execucao,
    dias, resolvidosDia, errosDia, resolvidosMes, errosMes, atendidosMes, resolvidosMesAnterior, errosMesAnterior,
    porTipo, motivos, porHora, assocs, aprovadores, atendidos, manuais, porAuto, servicos, quedas,
    admins, historico, gruposGlpi, vinculos, pedidos, ia,
  };
})();
