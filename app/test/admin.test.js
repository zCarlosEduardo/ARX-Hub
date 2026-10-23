const test = require('node:test');
const assert = require('node:assert/strict');
const { usuarioDaSessao, adminCorrespondente, adminsIniciais, configPadrao, validarSecao, validarNovoAdmin, validarOrdem, validarGrupos, podeVer, TIPOS_SOLICITACAO } = require('../admin');

test('usuarioDaSessao lê os grupos do GLPI (lista ou objeto) sem repetir', () => {
  assert.deepEqual(usuarioDaSessao({ glpiID: 3, glpiname: 'x', glpigroups: [4, '9', 4] }).grupos, [4, 9]);
  assert.deepEqual(usuarioDaSessao({ glpiID: 3, glpiname: 'x', glpigroups: { 5: 5, 6: '6' } }).grupos, [5, 6]);
  assert.deepEqual(usuarioDaSessao({ glpiID: 3, glpiname: 'x' }).grupos, []);
});

test('validarGrupos: ids positivos sem repetir; lista vazia libera para todos', () => {
  assert.deepEqual(validarGrupos({ grupos: ['3', 3, 8] }), { ok: true, valor: [3, 8] });
  assert.deepEqual(validarGrupos({ grupos: [] }), { ok: true, valor: [] });
  assert.equal(validarGrupos({ grupos: [0] }).ok, false);
  assert.equal(validarGrupos({}).ok, false);
});

test('podeVer: sem grupos todos veem; com grupos só quem está neles, e admin sempre', () => {
  const restrita = { grupos: [10, 20] };
  assert.equal(podeVer({ grupos: [] }, null), true);
  assert.equal(podeVer(restrita, null), false);
  assert.equal(podeVer(restrita, { admin: false, usuario: { grupos: [20] } }), true);
  assert.equal(podeVer(restrita, { admin: false, usuario: { grupos: [30] } }), false);
  assert.equal(podeVer(restrita, { admin: true, usuario: { grupos: [] } }), true);
});

const SESSAO = { session: { glpiID: 7, glpiname: 'carlos.alonso', glpifirstname: 'Carlos Eduardo', glpirealname: 'de Souza Alonso', glpifriendlyname: 'Carlos Eduardo de Souza Alonso' } };

test('usuarioDaSessao lê id, login e as formas do nome completo (sem acento e em maiúsculas)', () => {
  const u = usuarioDaSessao(SESSAO);
  assert.equal(u.id, 7);
  assert.equal(u.login, 'carlos.alonso');
  assert.equal(u.nome, 'Carlos Eduardo de Souza Alonso');
  assert.ok(u.nomes.includes('CARLOS EDUARDO DE SOUZA ALONSO'));
  assert.ok(u.nomes.includes('DE SOUZA ALONSO CARLOS EDUARDO'));
  assert.ok(u.nomes.includes('CARLOS.ALONSO'));
});

test('usuarioDaSessao aceita a sessão sem o envelope e recusa lixo', () => {
  assert.equal(usuarioDaSessao({ glpiID: 3, glpiname: 'x' }).id, 3);
  assert.equal(usuarioDaSessao(null), null);
  assert.equal(usuarioDaSessao('texto'), null);
  assert.equal(usuarioDaSessao({ session: {} }), null);
});

test('adminCorrespondente: por nome completo, por login e por id; com id gravado só o id vale (homônimo não entra)', () => {
  const u = usuarioDaSessao(SESSAO);
  assert.deepEqual(adminCorrespondente(u, [{ id: 1, glpiId: null, login: '', nome: 'carlos eduardo de souza alonso' }]), { admin: { id: 1, glpiId: null, login: '', nome: 'carlos eduardo de souza alonso' }, porId: false });
  assert.equal(adminCorrespondente(u, [{ id: 2, glpiId: null, login: 'CARLOS.ALONSO', nome: '' }]).porId, false);
  assert.equal(adminCorrespondente(u, [{ id: 3, glpiId: 7, login: '', nome: '' }]).porId, true);
  // outra pessoa com o mesmo nome: o admin já está preso ao id 7, então o homônimo (id 99) não passa
  const homonimo = usuarioDaSessao({ session: { ...SESSAO.session, glpiID: 99, glpiname: 'outro' } });
  assert.equal(adminCorrespondente(homonimo, [{ id: 3, glpiId: 7, login: 'carlos.alonso', nome: 'Carlos Eduardo de Souza Alonso' }]), null);
  assert.equal(adminCorrespondente(u, []), null);
  assert.equal(adminCorrespondente(null, [{ id: 1, glpiId: 7 }]), null);
});

test('adminsIniciais separa por ; ou linha, tira vazios e repetidos', () => {
  assert.deepEqual(adminsIniciais('Carlos Eduardo de Souza Alonso; maria.silva ;; carlos eduardo de souza alonso'), ['Carlos Eduardo de Souza Alonso', 'maria.silva']);
  assert.deepEqual(adminsIniciais(''), []);
  assert.deepEqual(adminsIniciais(undefined), []);
});

test('configuração padrão: cofre ativo com sessão do dia e WhatsApp desligado em observação', () => {
  const c = configPadrao();
  assert.deepEqual(c.cofre, { modo: 'ativo', sessao: 'dia', horas: 8 });
  assert.equal(c.whatsapp.ativo, false);
  assert.equal(c.whatsapp.modo, 'observacao');
  // o padrão é válido pelas próprias regras
  assert.equal(validarSecao('cofre', c.cofre).ok, true);
  assert.equal(validarSecao('whatsapp', c.whatsapp).ok, true);
  assert.deepEqual(validarSecao('automacoes', c.automacoes), { ok: true, valor: { cadastro: 'admins', endereco: 'mascarado', novaAba: true, marca: '' } });
});

test('ia: padrão desligada; aceita tipos existentes e recusa limites fora da faixa', () => {
  assert.equal(validarSecao('ia', configPadrao().ia).ok, true);
  const ok = validarSecao('ia', { ligada: true, automaticoTipos: ['senha_sistemas', 'senha_sistemas'], confiancaMinima: '0.85', whatsappModo: 'responder' });
  assert.deepEqual([ok.valor.automaticoTipos, ok.valor.confiancaMinima, ok.valor.whatsappModo], [['senha_sistemas'], 0.85, 'responder']);
  assert.equal(validarSecao('ia', { automaticoTipos: ['nao_existe'] }).ok, false);
  assert.equal(validarSecao('ia', { confiancaMinima: 0.3 }).ok, false);
  assert.equal(validarSecao('ia', { maxTentativas: 9 }).ok, false);
  assert.equal(validarSecao('ia', { whatsappModo: 'gritar' }).ok, false);
});

test('automacoes: aceita as opções da tela e recusa valor desconhecido', () => {
  assert.deepEqual(validarSecao('automacoes', { cadastro: 'todos', endereco: 'oculto', novaAba: false }).valor, { cadastro: 'todos', endereco: 'oculto', novaAba: false, marca: '' });
  // nome na barra de abas: texto curto, sem espaço sobrando; vazio deixa a barra sem nome
  assert.equal(validarSecao('automacoes', { marca: '  ARX Aut  ' }).valor.marca, 'ARX Aut');
  assert.equal(validarSecao('automacoes', { marca: '' }).valor.marca, '');
  assert.equal(validarSecao('automacoes', { marca: 'x'.repeat(31) }).ok, false);
  assert.equal(validarSecao('automacoes', { marca: 12 }).ok, false);
  assert.equal(validarSecao('automacoes', { cadastro: 'qualquer' }).ok, false);
  assert.equal(validarSecao('automacoes', { endereco: 'completo' }).ok, false);
  assert.equal(validarSecao('automacoes', { novaAba: 'sim' }).ok, false);
});

test('cofre: valores válidos passam; modo, sessão e horas inválidos são recusados', () => {
  assert.deepEqual(validarSecao('cofre', { modo: 'desativado', sessao: 'horas', horas: '12' }).valor, { modo: 'desativado', sessao: 'horas', horas: 12 });
  assert.equal(validarSecao('cofre', { modo: 'talvez' }).ok, false);
  assert.equal(validarSecao('cofre', { sessao: 'sempre' }).ok, false);
  assert.equal(validarSecao('cofre', { horas: 0 }).ok, false);
  assert.equal(validarSecao('cofre', { horas: 73 }).ok, false);
  assert.equal(validarSecao('cofre', { horas: 1.5 }).ok, false);
  assert.equal(validarSecao('cofre', {}).ok, true, 'campos ausentes usam o padrão');
});

const WHATS = {
  ativo: true,
  modo: 'ativo',
  numeros: [{ id: 'principal', rotulo: 'Chip dedicado', telefone: '+55 (31) 99999-1234', ativo: true }],
  grupos: [{ id: 'cadastros', nome: 'Cadastro de consultores', jid: '120363000000000000@g.us', numeroId: 'principal', tipos: ['cadastro_consultor', 'bloqueio_acesso'], ativo: true, responder: true, reagir: true }],
  remetentesAutorizados: ['(31) 98888-7777', '5531988887777'],
  reacoes: { aFazer: '⏳', andamento: '🔍', sucesso: '✅', erro: '⚠️', duvida: '❓' },
};

test('whatsapp: configuração completa é normalizada (telefones só com dígitos, sem repetir)', () => {
  const r = validarSecao('whatsapp', WHATS);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.valor.numeros[0].telefone, '5531999991234');
  assert.deepEqual(r.valor.grupos[0].tipos, ['cadastro_consultor', 'bloqueio_acesso']);
  assert.deepEqual(r.valor.remetentesAutorizados, ['31988887777', '5531988887777']);
  assert.equal(r.valor.grupos[0].responder, true);
});

test('whatsapp: número ainda não definido (telefone vazio) é aceito para deixar tudo configurado antes', () => {
  const r = validarSecao('whatsapp', { ...WHATS, numeros: [{ id: 'principal', rotulo: 'Chip dedicado', telefone: '' }] });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.valor.numeros[0].telefone, '');
});

test('whatsapp: recusa modo, telefone, ids repetidos, número inexistente e tipo desconhecido', () => {
  const com = (mud) => validarSecao('whatsapp', { ...WHATS, ...mud });
  assert.match(com({ modo: 'turbo' }).error, /whatsapp\.modo/);
  assert.match(com({ ativo: 'sim' }).error, /ativo/);
  assert.match(com({ numeros: [{ id: 'a', rotulo: 'A', telefone: '123' }] }).error, /10 a 15 dígitos/);
  assert.match(com({ numeros: [{ id: 'a', rotulo: 'A' }, { id: 'a', rotulo: 'B' }] }).error, /repetido/);
  assert.match(com({ numeros: [{ id: 'Id Ruim', rotulo: 'A' }] }).error, /id do número/);
  assert.match(com({ grupos: [{ ...WHATS.grupos[0], numeroId: 'naoexiste' }] }).error, /número que não existe/);
  assert.match(com({ grupos: [{ ...WHATS.grupos[0], tipos: ['voar'] }] }).error, /não existe/);
  assert.match(com({ grupos: [{ ...WHATS.grupos[0], nome: '' }] }).error, /nome/);
  assert.match(com({ grupos: [WHATS.grupos[0], WHATS.grupos[0]] }).error, /repetido/);
  assert.match(com({ remetentesAutorizados: ['12'] }).error, /remetente/);
  assert.match(com({ reacoes: { sucesso: 'ok ok ok ok ok' } }).error, /emoji/);
});

test('whatsapp: grupo sem número definido é aceito; tipos viram lista sem repetir; padrões de responder e reagir', () => {
  const r = validarSecao('whatsapp', { ativo: false, numeros: [], grupos: [{ id: 'g1', nome: 'Grupo', tipos: ['foto_perfil', 'foto_perfil'] }] });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.valor.grupos[0], { id: 'g1', nome: 'Grupo', jid: '', numeroId: '', categoriaId: null, categoriaLabel: '', tipos: ['foto_perfil'], ativo: true, responder: false, reagir: true });
});

test('os tipos oferecidos existem e a seção desconhecida é recusada', () => {
  assert.ok(TIPOS_SOLICITACAO.length >= 10);
  assert.ok(TIPOS_SOLICITACAO.every((t) => t.chave && t.nome));
  assert.equal(validarSecao('outra', {}).ok, false);
});

test('validarNovoAdmin: precisa de id, login ou nome', () => {
  assert.deepEqual(validarNovoAdmin({ glpiId: '12', nome: ' Maria ' }).valor, { glpiId: 12, login: '', nome: 'Maria' });
  assert.deepEqual(validarNovoAdmin({ login: 'maria.silva' }).valor, { glpiId: null, login: 'maria.silva', nome: '' });
  assert.equal(validarNovoAdmin({}).ok, false);
  assert.equal(validarNovoAdmin(null).ok, false);
  assert.equal(validarNovoAdmin({ glpiId: 'abc' }).ok, false);
  assert.equal(validarNovoAdmin({ glpiId: 0 }).ok, false);
});

test('validarOrdem: lista de ids sem repetir', () => {
  assert.deepEqual(validarOrdem({ ids: ['3', 1, '2'] }).valor, [3, 1, 2]);
  assert.equal(validarOrdem({ ids: [1, 1] }).ok, false);
  assert.equal(validarOrdem({ ids: [] }).ok, false);
  assert.equal(validarOrdem({ ids: ['a'] }).ok, false);
  assert.equal(validarOrdem({}).ok, false);
});

test('usuarioDaSessao: GLPI com departamento entre parênteses no sobrenome ("(Sistemas)") ainda casa pelo nome completo', () => {
  const real = { session: { glpiID: 7, glpiname: 'carlos.alonso', glpifirstname: 'Carlos Eduardo de Souza Alonso', glpirealname: '(Sistemas)', glpifriendlyname: '(Sistemas) Carlos Eduardo de Souza Alonso' } };
  const u = usuarioDaSessao(real);
  assert.equal(u.nome, 'Carlos Eduardo de Souza Alonso');
  assert.ok(u.nomes.includes('CARLOS EDUARDO DE SOUZA ALONSO'));
  assert.ok(adminCorrespondente(u, [{ id: 1, glpiId: null, login: '', nome: 'Carlos Eduardo de Souza Alonso' }]));
});

test('whatsapp: reações de "a fazer" e "em andamento" existem no padrão e podem ser trocadas; configuração antiga sem elas continua válida', () => {
  const padrao = configPadrao().whatsapp.reacoes;
  assert.equal(padrao.aFazer, '⏳');
  assert.equal(padrao.andamento, '🔍');
  const antigo = validarSecao('whatsapp', { ...WHATS, reacoes: { sucesso: '✅', erro: '⚠️', duvida: '❓' } });
  assert.equal(antigo.ok, true, antigo.error);
  assert.equal(antigo.valor.reacoes.andamento, '🔍', 'o que faltava usa o padrão');
  const novo = validarSecao('whatsapp', { ...WHATS, reacoes: { ...WHATS.reacoes, andamento: '🔧' } });
  assert.equal(novo.valor.reacoes.andamento, '🔧');
  assert.match(validarSecao('whatsapp', { ...WHATS, reacoes: { andamento: 'ok ok ok ok ok' } }).error, /emoji/);
});
