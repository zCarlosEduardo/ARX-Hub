// Dados FICTÍCIOS do Hub de exemplo (inicio-exemplo.html): nomes, logins e números inventados, só para ver como as telas
// ficariam. Nada aqui vem do GLPI nem do banco-central. Sorteio com semente fixa: a mesma tela a cada recarga.
(function () {
  function sorteio(semente) {
    let a = semente >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const r = sorteio(20261020);
  const um = (lista) => lista[Math.floor(r() * lista.length)];
  const entre = (min, max) => min + Math.floor(r() * (max - min + 1));

  const TIPOS = {
    senha_sistemas: { nome: 'Senha de sistemas', minutos: 6 },
    cadastro_usuario: { nome: 'Cadastro de usuário', minutos: 15 },
    cadastro_consultor: { nome: 'Cadastro de consultor', minutos: 12 },
    inativacao_consultor: { nome: 'Inativação de consultor', minutos: 8 },
    foto_perfil: { nome: 'Foto de perfil', minutos: 5 },
    erro_exportar_modelo: { nome: 'Erro ao exportar modelo', minutos: 10 },
    sincronizar_vistoria: { nome: 'Sincronizar vistoria', minutos: 9 },
    cadastro_modelo: { nome: 'Cadastro de modelo', minutos: 7 },
    desbloquear_usuario_sga: { nome: 'Desbloquear usuário do SGA', minutos: 4 },
  };
  const ASSOCIACOES = ['Associação Aurora', 'Associação Boreal', 'Associação Cerrado', 'Associação Delta', 'Associação Estrela', 'Associação Farol'];
  const PRIMEIROS = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabriela', 'Heitor', 'Isabela', 'João', 'Larissa', 'Marcos', 'Natália', 'Otávio', 'Paula', 'Rafael', 'Sofia', 'Tiago'];
  const ULTIMOS = ['Almeida', 'Barros', 'Costa', 'Duarte', 'Esteves', 'Freitas', 'Gomes', 'Lima', 'Moraes', 'Nunes', 'Pereira', 'Rocha'];
  const DEPTOS = ['Comercial', 'Qualidade', 'Cadastro', 'Financeiro', 'Eventos', 'Assistência', 'Vistoria'];
  const pessoa = () => um(PRIMEIROS) + ' ' + um(ULTIMOS);
  const login = (nome) => nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(' ', '.');
  const placa = () => 'XYZ' + entre(0, 9) + String.fromCharCode(65 + entre(0, 9)) + entre(10, 99);

  // Cada modelo devolve título, descrição e os dados que a automação leria dela.
  const MODELOS = {
    senha_sistemas: () => { const n = pessoa(); return { titulo: 'Redefinir senha do SGA', descricao: 'Bom dia, meu usuário do SGA não entra mais e preciso redefinir a senha.\nUsuário: ' + login(n), solicitante: n, dados: { Sistema: 'SGA', Usuário: login(n) } }; },
    cadastro_usuario: () => { const n = pessoa(); return { titulo: 'Solicitação de acesso a sistemas', descricao: '1) Tipo de acesso: Colaborador\n2) Sistemas: SGA e PowerCRM\n3) Nome completo: ' + n + '\n4) Departamento: ' + um(DEPTOS), solicitante: pessoa(), dados: { Nome: n, Sistemas: 'SGA e PowerCRM', 'Tipo de acesso': 'Colaborador' } }; },
    cadastro_consultor: () => { const n = pessoa(); return { titulo: 'Cadastro de consultor', descricao: 'Favor cadastrar o consultor ' + n + ' na regional Centro.', solicitante: pessoa(), dados: { Consultor: n, Regional: 'Centro' } }; },
    inativacao_consultor: () => { const n = pessoa(); return { titulo: 'Inativar consultor', descricao: 'O consultor ' + n + ' saiu da empresa, favor inativar o acesso.', solicitante: pessoa(), dados: { Consultor: n } }; },
    foto_perfil: () => { const n = pessoa(); const d = um(DEPTOS); return { titulo: 'Foto de perfil', descricao: 'Preciso da foto de perfil para o WhatsApp.\nNome: ' + n + '\nDepartamento: ' + d, solicitante: n, dados: { Nome: n, Departamento: d } }; },
    erro_exportar_modelo: () => ({ titulo: 'Erro ao exportar card', descricao: 'O card não exporta para o SGA, aparece erro de modelo. Segue o print.', solicitante: pessoa(), dados: {} }),
    sincronizar_vistoria: () => { const p = placa(); return { titulo: 'Fotos SGA', descricao: 'As fotos da vistoria não subiram para o SGA. Placa ' + p, solicitante: pessoa(), dados: { Placa: p } }; },
    cadastro_modelo: () => ({ titulo: 'Cadastro de modelo', descricao: 'Modelo de veículo não encontrado no SGA. Código FIPE 0' + entre(10000, 99999) + '-' + entre(1, 9), solicitante: pessoa(), dados: { 'Código FIPE': 'informado' } }),
    desbloquear_usuario_sga: () => { const n = pessoa(); return { titulo: 'Reportar instabilidade ou erro', descricao: 'Meu usuário do SGA está bloqueado depois de errar a senha.', solicitante: n, dados: { Usuário: login(n) } }; },
  };
  const SEM_AUTOMACAO = [
    ['Reportar instabilidade ou erro', 'O sistema está lento desde cedo para todos do setor.'],
    ['Template de chat', 'Preciso de um novo modelo de mensagem para o chat de atendimento.'],
    ['Mensalidade divergente', 'O valor do boleto deste mês veio diferente do contratado.'],
    ['Liberação de acesso ao chat', 'Liberar acesso ao chat de atendimento para a nova colaboradora.'],
  ];

  const tipos = Object.keys(TIPOS);
  const chamados = [];
  for (let i = 0; i < 46; i++) {
    const semAuto = r() < 0.2;
    const tipo = semAuto ? null : um(tipos);
    const base = semAuto ? (() => { const m = um(SEM_AUTOMACAO); return { titulo: m[0], descricao: m[1], solicitante: pessoa(), dados: {} }; })() : MODELOS[tipo]();
    let status = 'pronto';
    const pendencias = [];
    let confianca = 'alta';
    if (!tipo) status = 'sem_automacao';
    else if (tipo === 'erro_exportar_modelo' && r() < 0.6) { status = 'pendencia'; pendencias.push('Placa ou código do card'); }
    else if (tipo === 'sincronizar_vistoria' && r() < 0.3) { status = 'pendencia'; pendencias.push('Placa, chassi ou ID'); }
    else if (tipo === 'desbloquear_usuario_sga' || (['senha_sistemas', 'cadastro_usuario'].includes(tipo) && r() < 0.4)) { status = 'manual'; confianca = 'media'; }
    else if (r() < 0.08) status = 'erro';
    // quando a IA discorda, ela sempre sugere um tipo diferente do da regra
    const ia = tipo ? (r() > 0.1 ? { concorda: true, confianca: Math.round((0.78 + r() * 0.21) * 100) } : { concorda: false, sugestao: um(tipos.filter((t) => t !== tipo)), confianca: Math.round((0.6 + r() * 0.2) * 100) }) : (r() < 0.3 ? { concorda: false, sugestao: um(tipos), confianca: Math.round((0.6 + r() * 0.2) * 100) } : null);
    chamados.push(Object.assign(base, {
      id: 48210 + i * 7 + entre(0, 6),
      tipo, status, confianca, pendencias, ia,
      associacao: um(ASSOCIACOES),
      abertoHaMin: Math.round(Math.pow(r(), 2) * 60 * 24 * 3) + 4,
      erro: status === 'erro' ? 'O SGA não respondeu no tempo esperado. Pode ser momentâneo.' : null,
    }));
  }
  // alguns já solucionados, para ver a resposta que foi ao GLPI
  for (let i = 0; i < 6; i++) {
    const tipo = um(['senha_sistemas', 'foto_perfil', 'cadastro_usuario', 'inativacao_consultor', 'cadastro_modelo', 'sincronizar_vistoria']);
    chamados.push(Object.assign(MODELOS[tipo](), {
      id: 48100 + i * 13, tipo, status: 'concluido', confianca: 'alta', pendencias: [], ia: { concorda: true, confianca: entre(88, 99) },
      associacao: um(ASSOCIACOES), abertoHaMin: entre(200, 2400), solucionadoHaMin: entre(20, 190), erro: null,
    }));
  }
  chamados.sort((a, b) => a.abertoHaMin - b.abertoHaMin);

  // Textos que a automação escreve no GLPI (fictícios, no tom dos modelos de solução).
  const primeiro = (n) => String(n || '').split(' ')[0];
  const ASSINATURA = '\n\nby automação';
  function respostaSolucao(c) {
    const ola = 'Olá, ' + primeiro(c.solicitante) + '!\n\n';
    const d = c.dados || {};
    const textos = {
      senha_sistemas: 'A senha do SGA do usuário ' + (d['Usuário'] || '') + ' foi redefinida. A senha temporária foi enviada por mensagem privada e o sistema vai pedir a troca no primeiro acesso.',
      cadastro_usuario: 'O acesso de ' + (d.Nome || 'colaborador') + ' foi criado no SGA e no PowerCRM. Usuário e senha inicial foram enviados ao gestor por mensagem privada.',
      cadastro_consultor: 'O consultor ' + (d.Consultor || '') + ' foi cadastrado na regional ' + (d.Regional || 'informada') + ' e já pode receber leads.',
      inativacao_consultor: 'O consultor ' + (d.Consultor || '') + ' foi inativado no PowerCRM e no SGA. Os leads em aberto ficaram com o gestor da regional.',
      foto_perfil: 'Segue em anexo a foto de perfil de ' + (d.Nome || '') + ' (' + (d.Departamento || '').toUpperCase() + '), no tamanho certo para o WhatsApp.',
      erro_exportar_modelo: 'O modelo do card foi ajustado no SGA e a exportação voltou a funcionar. Pode exportar de novo.',
      sincronizar_vistoria: 'As fotos da vistoria da placa ' + (d.Placa || '') + ' foram enviadas do PowerCRM para o SGA (18 fotos).',
      cadastro_modelo: 'O modelo foi cadastrado no SGA a partir do código FIPE informado e já aparece na busca.',
      desbloquear_usuario_sga: 'O usuário ' + (d['Usuário'] || '') + ' foi desbloqueado no SGA. A senha continua a mesma.',
    };
    return ola + (textos[c.tipo] || 'Solicitação atendida.') + ASSINATURA;
  }
  function perguntaIa(c) {
    return 'Olá, ' + primeiro(c.solicitante) + '! Para seguir com este chamado preciso de: ' + c.pendencias.join(', ').toLowerCase() +
      '. Pode responder aqui no chamado? Se tiver um print da tela do card, também ajuda. Assim que chegar, a automação continua sozinha.' + ASSINATURA;
  }
  function devolutivaErro(c) {
    return 'Olá, ' + primeiro(c.solicitante) + '. A automação tentou atender o chamado, mas ' + (c.erro || 'não conseguiu concluir').replace(/\.$/, '').toLowerCase() +
      '. O chamado ficou Pendente e alguém da equipe de Sistemas vai conferir.' + ASSINATURA;
  }

  // Resultados: 120 dias de execuções (dá para comparar 12 semanas e o mês passado com o período anterior).
  const DIAS = 120;
  const MOTIVOS = {
    erro_exportar_modelo: ['Card sem modelo no SGA', 'Placa não encontrada no CRM'],
    sincronizar_vistoria: ['Vistoria sem fotos no CRM', 'Card não encontrado pela placa'],
    geral: ['SGA não respondeu a tempo', 'Sessão do SGA expirou', 'Usuário não encontrado', 'Login do CRM recusado'],
  };
  const agora = new Date();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const porDia = [];
  for (let d = DIAS - 1; d >= 0; d--) {
    const data = new Date(hoje.getTime() - d * 86400000);
    const fimDeSemana = data.getDay() === 0 || data.getDay() === 6;
    const crescimento = 0.5 + (DIAS - d) / DIAS; // o uso cresce ao longo do período
    const total = fimDeSemana ? entre(0, 3) : Math.round(entre(8, 22) * crescimento);
    const execucoes = [];
    for (let k = 0; k < total; k++) {
      const tipo = um(tipos);
      const erro = r() < (tipo === 'erro_exportar_modelo' ? 0.22 : tipo === 'sincronizar_vistoria' ? 0.15 : 0.06);
      // expediente das 8 às 18 h, com pico de manhã
      const hora = Math.min(18, 8 + Math.floor(Math.pow(r(), 1.4) * 11));
      if (d === 0 && hora > agora.getHours()) continue;
      execucoes.push({
        tipo, erro, hora, associacao: um(ASSOCIACOES), segundos: entre(25, 240),
        origem: r() < 0.68 ? 'automatico' : 'manual',
        motivo: erro ? um(MOTIVOS[tipo] ? MOTIVOS[tipo].concat(MOTIVOS.geral.slice(0, 1)) : MOTIVOS.geral) : null,
        chamado: 47000 + entre(0, 1800), solicitante: pessoa(),
      });
    }
    porDia.push({ data, execucoes });
  }

  // Disponibilidade: minutos fora do ar por dia de cada automação (a maioria dos dias sem queda).
  const AUTOMACOES = ['Chamados GLPI', 'Alterar senha SGA', 'Cadastro de usuário', 'Foto de perfil', 'Relatórios SGA', 'Sincronizar vistoria', 'Converter planilha', 'Banco central', 'Robô do WhatsApp', 'GLPI'];
  const MOTIVOS_QUEDA = ['Não respondeu à checagem de saúde', 'Reiniciado na atualização', 'Sem memória e reiniciado', 'Servidor do GLPI fora do ar', 'Rede interna instável'];
  const disponibilidade = AUTOMACOES.map((nome, i) => {
    const fragil = i === 4 || i === 9; // duas com mais quedas, para o exemplo ter contraste
    const dias = porDia.map((p) => {
      const quedas = [];
      if (r() < (fragil ? 0.12 : 0.035)) {
        const n = r() < 0.2 ? 2 : 1;
        for (let k = 0; k < n; k++) quedas.push({ inicio: new Date(p.data.getTime() + entre(7, 19) * 3600000 + entre(0, 59) * 60000), minutos: Math.round(Math.pow(r(), 2.2) * 180) + 1, motivo: um(MOTIVOS_QUEDA) });
      }
      return { data: p.data, quedas };
    });
    return { nome, dias, agora: i === 9 ? 'offline' : 'online' };
  });

  window.ExemploDados = { TIPOS, ASSOCIACOES, chamados, porDia, pessoa, DEPTOS, disponibilidade, respostaSolucao, perguntaIa, devolutivaErro, MODELOS, placa, login };
})();
