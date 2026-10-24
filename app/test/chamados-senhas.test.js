// Regras dos pedidos de senha (senha_sistemas, alterar_senha_sga, desbloqueio) e do modo automático da aba Chamados
// do Hub (public/v1/chamados.js): o que bloqueia, o que fica só no manual e o que o clique manual manda ao servidor.
// Carrega o arquivo com um React mínimo (sem DOM); o desenho da tela não é conferido aqui.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUBLIC = path.join(__dirname, '..', 'public');
const NOOP = () => {};

const React = {
  createElement(tipo, props, ...filhos) {
    const p = { ...(props || {}) };
    if (filhos.length) p.children = filhos.length === 1 ? filhos[0] : filhos;
    return { tipo, props: p };
  },
  useState: (init) => [typeof init === 'function' ? init() : init, NOOP],
  cloneElement: (el, props) => ({ tipo: el.tipo, props: { ...el.props, ...(props || {}) } }),
  useRef: () => ({ current: null }),
  useEffect: NOOP,
  useCallback: (fn) => fn,
};

const SGAS = [{ usuario: 'x', senha: 'y', empresas: ['arx'] }];
globalThis.window = globalThis;
globalThis.React = React;
globalThis.location = { protocol: 'http:', hostname: 'localhost' };
globalThis.localStorage = { getItem: () => null, setItem: NOOP };
globalThis.sessionStorage = { getItem: () => null, setItem: NOOP };
vm.runInThisContext(fs.readFileSync(path.join(PUBLIC, 'icons.js'), 'utf8'), { filename: 'icons.js' });
globalThis.ArxAcessosHub = {
  ler: () => ({ pronto: true, userToken: 't', sgas: SGAS, crm: null, senhaPadrao: '' }),
  aoMudar: () => NOOP,
  loginDaEmpresa: (sgas, chave) => sgas.find((l) => (l.empresas || []).includes(chave)) || null,
  chavesDoLogin: (l) => l.empresas,
  abrirEditor: NOOP,
  EditorAcessos: () => null,
};
globalThis.CHAMADOS_CACHE_MANUAL = true; // sem pré-carga nem rede nos testes
vm.runInThisContext(fs.readFileSync(path.join(PUBLIC, 'chamados-cache.js'), 'utf8'), { filename: 'chamados-cache.js' });
vm.runInThisContext(fs.readFileSync(path.join(PUBLIC, 'v1', 'chamados.js'), 'utf8'), { filename: 'v1/chamados.js' });
const { nomeSistema, avisoSenha, bloqueioSenha } = window.ChamadosSenhas;

const base = { id: 101, link: 'http://glpi/101', categoria: 'Senha', titulo: 'Pedido de senha', abertoEm: '2026-10-01 10:00:00', statusNome: 'Novo', requerente: 'Maria Souza', problemas: [] };
const SENHA_SISTEMAS = { ...base, tipo: 'senha_sistemas', tipoNome: 'Senha de sistemas (resposta padrão)', sistemas: ['crm', 'ezchat', 'wint', 'mundiale', 'chat'] };
const alterar = (identidade, extra) => ({
  ...base, id: 202, tipo: 'alterar_senha_sga', tipoNome: 'Alterar senha do SGA', sistemas: ['sga'], outrosSistemas: ['crm', 'chat'],
  senhaAlvo: { nome: 'João Pereira', usuario: 'joao.p', cpfMascarado: '***.123.456-**' }, empresaSga: { chave: 'arx', nome: 'ARX' }, identidade, ...extra,
});
const OK_PROPRIA = { ok: true, regra: 'mesma_pessoa', motivo: 'Mesma pessoa' };
const OK_GESTAO = { ok: true, regra: 'gestao', motivo: 'Gestor do departamento' };
const NEGADO = { ok: false, regra: null, motivo: 'Solicitante não é a mesma pessoa nem gestor do departamento' };

test('nomes amigáveis dos sistemas', () => {
  assert.equal(nomeSistema('crm'), 'CRM (PowerCRM)');
  assert.equal(nomeSistema('ezchat'), 'EzChat');
  assert.equal(nomeSistema('wint'), 'Wint');
  assert.equal(nomeSistema('mundiale'), 'Mundiale');
  assert.equal(nomeSistema('chat'), 'Chat');
  assert.equal(nomeSistema('outro'), 'outro');
});

test('avisoSenha e bloqueioSenha: só identidade não confirmada bloqueia', () => {
  const tem = () => true;
  assert.equal(avisoSenha(alterar(OK_PROPRIA)), null);
  assert.equal(avisoSenha(alterar(OK_GESTAO)), null);
  const a = avisoSenha(alterar(NEGADO));
  assert.equal(a.texto, 'Este chamado não será executado');
  assert.equal(a.motivo, NEGADO.motivo);
  assert.ok(avisoSenha(alterar(undefined)), 'sem identidade bloqueia por segurança');
  assert.equal(avisoSenha(SENHA_SISTEMAS), null);
  assert.equal(bloqueioSenha(SENHA_SISTEMAS, () => false), null, 'resposta padrão não pede login');
  assert.equal(bloqueioSenha(alterar(OK_PROPRIA), tem), null);
  assert.ok(bloqueioSenha(alterar(NEGADO), tem));
  assert.match(bloqueioSenha(alterar(OK_PROPRIA), () => false), /Marque ARX em um login do SGA/);
  assert.match(bloqueioSenha(alterar(OK_PROPRIA, { empresaSga: null }), tem), /Marque Senha em um login do SGA/);
});

// ---------- confirmação manual (chamados de senha menos certos) ----------
const { rotuloConfianca, deveExcluirDoAutomatico, montarPedidoItem, avisoConfianca } = window.ChamadosSenhas;
const MEDIA = { confianca: 'media', somenteManual: true, motivoConfianca: 'título sem a palavra senha; pedido identificado pela descrição' };
const ALTA = { confianca: 'alta', somenteManual: false, motivoConfianca: '' };

test('rotuloConfianca e deveExcluirDoAutomatico: só somenteManual === true', () => {
  assert.equal(rotuloConfianca({ ...SENHA_SISTEMAS, ...MEDIA }), 'Confirmação manual');
  assert.equal(rotuloConfianca({ ...SENHA_SISTEMAS, ...ALTA }), null);
  assert.equal(rotuloConfianca(SENHA_SISTEMAS), null, 'serviço antigo, sem o campo');
  assert.equal(rotuloConfianca(null), null);
  assert.equal(deveExcluirDoAutomatico({ ...SENHA_SISTEMAS, ...MEDIA }), true);
  assert.equal(deveExcluirDoAutomatico({ ...SENHA_SISTEMAS, ...ALTA }), false);
  assert.equal(deveExcluirDoAutomatico(SENHA_SISTEMAS), false);
  assert.equal(deveExcluirDoAutomatico({ somenteManual: 'true' }), false, 'só o booleano true vale');
  assert.equal(deveExcluirDoAutomatico(undefined), false);
});

test('concluído com o chamado ainda aberto não volta ao automático (a solução não chegou ao GLPI)', () => {
  const concluido = { ...SENHA_SISTEMAS, ...ALTA, ultimaExecucao: { status: 'concluido', em: '2026-10-24' } };
  assert.equal(deveExcluirDoAutomatico(concluido), true);
  assert.equal(deveExcluirDoAutomatico({ ...concluido, respostas: [{ texto: 'era para outra pessoa' }] }), false, 'reaberto com resposta segue as regras do servidor');
  assert.equal(deveExcluirDoAutomatico({ ...concluido, ultimaExecucao: { status: 'teste' } }), false);
});

test('avisoConfianca: motivo do serviço ou texto padrão', () => {
  assert.equal(avisoConfianca({ ...MEDIA }).titulo, 'Confirmação manual: ' + MEDIA.motivoConfianca);
  assert.equal(avisoConfianca({ ...MEDIA }).orientacao, 'Revise o chamado antes de rodar. Este item não entra no modo automático.');
  assert.equal(avisoConfianca({ somenteManual: true, motivoConfianca: '  ' }).titulo, 'Confirmação manual: pedido identificado pela descrição');
  assert.equal(avisoConfianca({ somenteManual: true }).titulo, 'Confirmação manual: pedido identificado pela descrição');
  assert.equal(avisoConfianca(ALTA), null);
});

test('montarPedidoItem: confirmado só no clique manual de item somenteManual', () => {
  const m = { ...SENHA_SISTEMAS, ...MEDIA };
  assert.deepEqual(montarPedidoItem(m, { manual: true }), { id: 101, confirmado: true });
  assert.deepEqual(montarPedidoItem(m, { manual: false }), { id: 101 });
  assert.deepEqual(montarPedidoItem(m), { id: 101 });
  assert.deepEqual(montarPedidoItem({ ...SENHA_SISTEMAS, ...ALTA }, { manual: true }), { id: 101 });
  assert.deepEqual(montarPedidoItem(SENHA_SISTEMAS, { manual: true }), { id: 101 });
  assert.ok(!('confirmado' in montarPedidoItem(m, { manual: false })));
  assert.deepEqual(montarPedidoItem(m, { manual: true, campos: { roleId: 3, loginSga: 'x' } }), { id: 101, roleId: 3, loginSga: 'x', confirmado: true });
});

test('modo automático e lote: nenhum item somenteManual entra (lê o código)', () => {
  const src = fs.readFileSync(path.join(PUBLIC, 'v1', 'chamados.js'), 'utf8');
  const usos = src.match(/deveExcluirDoAutomatico\(i\)/g) || [];
  assert.equal(usos.length, 2, 'automático e "Rodar todos os prontos"');
  // o lote do automático só roda depois de reservado no servidor (vários computadores sem duplicar): roda só o que foi reservado
  assert.match(src, /\/api\/auto\/reservar/);
  assert.match(src, /const meus = lote\.filter\(\(i\) => r\.reservados\.includes\(i\.id\)\)/);
  assert.match(src, /rodar\(meus\)/);
  assert.ok(!/rodar\(lote\)/.test(src), 'nunca roda o lote inteiro sem reservar');
  assert.match(src, /onClick: \(\) => rodar\(\[item\], \{ manual: true \}\)/);
});

// ---------- desbloqueio de usuário do SGA (mesmo card da troca de senha, outra ação) ----------
const desbloquear = (identidade, extra) => ({ ...alterar(identidade, extra), tipo: 'desbloquear_usuario_sga', tipoNome: 'Desbloqueio de usuário do SGA', outrosSistemas: [], somenteManual: true, motivoConfianca: 'pedido reconhecido pela descrição (usuário do SGA bloqueado)' });

test('desbloqueio: identidade não confirmada tem o mesmo aviso e o mesmo bloqueio da troca de senha', () => {
  const tem = () => true;
  const item = desbloquear(NEGADO);
  assert.ok(avisoSenha(item));
  assert.ok(bloqueioSenha(item, tem));
  assert.equal(avisoSenha(desbloquear(OK_PROPRIA)), null);
  assert.equal(bloqueioSenha(desbloquear(OK_PROPRIA), tem), null);
  assert.match(bloqueioSenha(desbloquear(OK_PROPRIA), () => false), /Marque ARX em um login do SGA/);
});

test('desbloqueio: liberável no clique manual quando o alvo está identificado, e nunca entra no automático', () => {
  const LIBERAVEL = { ok: false, regra: null, motivo: 'o solicitante não é da gestão', liberavelManual: true };
  const item = desbloquear(LIBERAVEL);
  assert.equal(avisoSenha(item).liberavel, true);
  assert.equal(bloqueioSenha(item, () => true), null);
  assert.equal(window.ChamadosSenhas.deveExcluirDoAutomatico(item), true);
  assert.equal(window.ChamadosSenhas.montarPedidoItem(item, { manual: true }).confirmado, true);
});

test('proteção contra dado antigo: automático e rodar conferem lista.guardado (lê o código)', () => {
  const src = fs.readFileSync(path.join(PUBLIC, 'v1', 'chamados.js'), 'utf8');
  assert.match(src, /if \(!auto\.ativo \|\| !pronto \|\| lista\.carregando \|\| lista\.guardado \|\| rodandoAlgo\) return;/);
  assert.match(src, /if \(lista\.guardado\) return;/);
  assert.match(src, /const prontosTodos = lista\.guardado \? \[\]/);
});

test('identidade liberável no manual: aviso com orientação, sem bloquear o clique, e fora do automático', () => {
  const tem = () => true;
  const LIBERAVEL = { ok: false, regra: null, motivo: 'o solicitante não é da gestão de nenhum departamento (função: Analista)', liberavelManual: true };
  const item = alterar(LIBERAVEL);
  const a = avisoSenha(item);
  assert.equal(a.liberavel, true);
  assert.match(a.texto, /rode manualmente/);
  assert.equal(bloqueioSenha(item, tem), null, 'o clique manual fica liberado');
  assert.match(bloqueioSenha(item, () => false), /Marque/, 'o login do SGA continua exigido');
  assert.equal(window.ChamadosSenhas.deveExcluirDoAutomatico(item), true);
  assert.equal(window.ChamadosSenhas.montarPedidoItem(item, { manual: true }).confirmado, true);
  assert.equal(window.ChamadosSenhas.montarPedidoItem(item, { manual: false }).confirmado, undefined);
  assert.equal(window.ChamadosSenhas.deveExcluirDoAutomatico(alterar(OK_PROPRIA)), false);
  assert.ok(bloqueioSenha(alterar({ ...LIBERAVEL, liberavelManual: false }), tem), 'quando cita outra pessoa não identificada continua bloqueado');
});

test('diagnóstico da planilha aparece no card sem CPF', () => {
  const item = alterar({ ok: false, regra: null, motivo: 'x', liberavelManual: true });
  item.diagnosticoPlanilha = { solicitante: { estado: 'unica', nome: 'JOANA SANTOS', funcao: 'ANALISTA', departamento: 'CADASTRO' }, alvo: { estado: 'nenhuma' } };
  const txt = JSON.stringify(window.ChamadosSenhas.detalhesSenha(item), (k, v) => (typeof v === 'function' ? undefined : v));
  assert.match(txt, /Planilha de funcionários: solicitante JOANA SANTOS \(função ANALISTA, departamento CADASTRO\); alvo não encontrado/);
});
