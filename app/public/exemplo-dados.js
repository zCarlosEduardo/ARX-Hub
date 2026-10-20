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
    else if (tipo === 'desbloquear_usuario_sga' || (tipo === 'senha_sistemas' && r() < 0.35)) { status = 'manual'; confianca = 'media'; }
    else if (r() < 0.08) status = 'erro';
    const ia = tipo ? { concorda: r() > 0.1, confianca: Math.round((0.78 + r() * 0.21) * 100) } : (r() < 0.3 ? { concorda: false, sugestao: um(tipos), confianca: Math.round((0.6 + r() * 0.2) * 100) } : null);
    chamados.push(Object.assign(base, {
      id: 48210 + i * 7 + entre(0, 6),
      tipo, status, confianca, pendencias, ia,
      associacao: um(ASSOCIACOES),
      abertoHaMin: Math.round(Math.pow(r(), 2) * 60 * 24 * 3) + 4,
      erro: status === 'erro' ? 'O SGA não respondeu no tempo esperado. Pode ser momentâneo.' : null,
    }));
  }
  chamados.sort((a, b) => a.abertoHaMin - b.abertoHaMin);

  // Resultados: 84 dias de execuções, com a semana e o tipo de cada uma.
  const DIAS = 84;
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
      execucoes.push({ tipo, erro, associacao: um(ASSOCIACOES), segundos: entre(25, 240) });
    }
    porDia.push({ data, execucoes });
  }

  window.ExemploDados = { TIPOS, ASSOCIACOES, chamados, porDia, pessoa, DEPTOS };
})();
