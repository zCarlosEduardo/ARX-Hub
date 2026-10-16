// Cards dos pedidos de senha (senha_sistemas e alterar_senha_sga) da aba Chamados.
// Renderiza com um React mínimo (sem DOM) e confere estrutura e textos. Não valida o visual.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUBLIC = path.join(__dirname, '..', 'public');
const NOOP = () => {};
const estado = { lista: null };

const React = {
  createElement(tipo, props, ...filhos) {
    const p = { ...(props || {}) };
    if (filhos.length) p.children = filhos.length === 1 ? filhos[0] : filhos;
    return { tipo, props: p };
  },
  useState(init) {
    if (init && typeof init === 'object' && 'itens' in init && 'perfis' in init && estado.lista) return [estado.lista, NOOP];
    return [typeof init === 'function' ? init() : init, NOOP];
  },
  cloneElement: (el, props) => ({ tipo: el.tipo, props: { ...el.props, ...(props || {}) } }),
  useRef: () => ({ current: null }),
  useEffect: NOOP,
  useCallback: (fn) => fn,
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const SEM_UNIDADE = new Set(['fontWeight', 'opacity', 'lineHeight', 'flex', 'zIndex']);
const valorCss = (k, v) => (typeof v === 'number' && v !== 0 && !SEM_UNIDADE.has(k) ? v + 'px' : v);
const paraCss = (o) => Object.entries(o).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${valorCss(k, v)}`).join(';');
function html(no) {
  if (no === null || no === undefined || no === false || no === true) return '';
  if (Array.isArray(no)) return no.map(html).join('');
  if (typeof no !== 'object') return esc(no);
  const { tipo, props } = no;
  if (typeof tipo === 'function') return html(tipo(props));
  const attrs = Object.entries(props)
    .filter(([k, v]) => k !== 'children' && k !== 'key' && k !== 'ref' && typeof v !== 'function' && v !== null && v !== undefined && v !== false)
    .map(([k, v]) => ` ${k === 'className' ? 'class' : k}="${esc(k === 'style' ? paraCss(v) : v)}"`)
    .join('');
  return `<${tipo}${attrs}>${html(props.children)}</${tipo}>`;
}

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
vm.runInThisContext(fs.readFileSync(path.join(PUBLIC, 'chamados.js'), 'utf8'), { filename: 'chamados.js' });
const { nomeSistema, avisoSenha, bloqueioSenha } = window.ChamadosSenhas;

const PROIBIDO = /NaN|undefined|\[object|—|–| - |\(s\)|>null</;
const base = { id: 101, link: 'http://glpi/101', categoria: 'Senha', titulo: 'Pedido de senha', abertoEm: '2026-10-01 10:00:00', statusNome: 'Novo', requerente: 'Maria Souza', problemas: [] };
const SENHA_SISTEMAS = { ...base, tipo: 'senha_sistemas', tipoNome: 'Senha de sistemas (resposta padrão)', sistemas: ['crm', 'ezchat', 'wint', 'mundiale', 'chat'] };
const alterar = (identidade, extra) => ({
  ...base, id: 202, tipo: 'alterar_senha_sga', tipoNome: 'Alterar senha do SGA', sistemas: ['sga'], outrosSistemas: ['crm', 'chat'],
  senhaAlvo: { nome: 'João Pereira', usuario: 'joao.p', cpfMascarado: '***.123.456-**' }, empresaSga: { chave: 'arx', nome: 'ARX' }, identidade, ...extra,
});
const OK_PROPRIA = { ok: true, regra: 'mesma_pessoa', motivo: 'Mesma pessoa' };
const OK_GESTAO = { ok: true, regra: 'gestao', motivo: 'Gestor do departamento' };
const NEGADO = { ok: false, regra: null, motivo: 'Solicitante não é a mesma pessoa nem gestor do departamento' };

function tela(itens, extra) {
  estado.lista = { carregando: false, erro: null, itens, usuario: { nome: 'Fulano' }, outros: 0, totalAbertos: itens.length, perfis: [], entidades: [], tempos: null, guardado: false, em: null, ...extra };
  try { return html(React.createElement(window.ChamadosView, {})); } finally { estado.lista = null; }
}

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

test('card senha_sistemas: chips com nomes amigáveis, sem campo extra e botão liberado', () => {
  const h = tela([SENHA_SISTEMAS]);
  assert.ok(!PROIBIDO.test(h), (h.match(PROIBIDO) || [])[0]);
  for (const n of ['CRM (PowerCRM)', 'EzChat', 'Wint', 'Mundiale', 'Chat']) assert.ok(h.includes(`>${n}<`), n);
  assert.equal((h.match(/role="listitem"/g) || []).length, 5);
  assert.ok(h.includes('Senha de sistemas (resposta padrão)'));
  assert.ok(h.includes('Nenhuma senha é alterada'));
  assert.ok(!h.includes('placeholder'), 'sem campo de texto extra');
  assert.ok(!h.includes('disabled="true"'), 'botão Rodar liberado');
});

test('card alterar_senha_sga liberado: requerente x alvo, selo e empresa', () => {
  for (const [id, selo] of [[OK_PROPRIA, 'Própria pessoa'], [OK_GESTAO, 'Gestão do departamento']]) {
    const h = tela([alterar(id)]);
    assert.ok(!PROIBIDO.test(h), (h.match(PROIBIDO) || [])[0]);
    assert.ok(h.includes('>Requerente<') && h.includes('>Usuário alvo<'));
    assert.ok(h.includes('>Maria Souza<') && h.includes('>João Pereira<'));
    assert.ok(h.includes('Usuário joao.p') && h.includes('CPF ***.123.456-**'));
    assert.ok(h.includes(`>${selo}<`), selo);
    assert.ok(h.includes('var(--accent-soft)'));
    assert.ok(!h.includes('role="alert"') && !h.includes('não será executado'));
    assert.ok(h.includes('>ARX<'));
    assert.ok(h.includes('>CRM (PowerCRM)<') && h.includes('>Chat<'));
    assert.ok(h.includes('Recebem só a orientação'));
    assert.ok(!h.includes('disabled="true"'), 'botão Rodar liberado');
    assert.ok(!/senha=|"senha"/i.test(h));
  }
});

test('card alterar_senha_sga com identidade negada: aviso âmbar e botão Rodar desabilitado', () => {
  const h = tela([alterar(NEGADO)]);
  assert.ok(!PROIBIDO.test(h), (h.match(PROIBIDO) || [])[0]);
  assert.ok(h.includes('role="alert"'));
  assert.ok(h.includes(NEGADO.motivo) && h.includes('>Este chamado não será executado<'));
  assert.ok(h.includes('var(--warn-tint)'));
  assert.ok(!h.includes('>Própria pessoa<') && !h.includes('>Gestão do departamento<'));
  assert.match(h, /<button[^>]*disabled="true"[^>]*>.*?Rodar<\/span>/);
});

test('card alterar_senha_sga sem login do SGA da empresa: botão desabilitado com a pendência', () => {
  const h = tela([alterar(OK_PROPRIA, { empresaSga: { chave: 'outra', nome: 'Outra' } })]);
  assert.ok(h.includes('Marque Outra em um login do SGA (Acessos)'));
  assert.match(h, /<button[^>]*disabled="true"[^>]*>.*?Rodar<\/span>/);
});

test('valores vazios viram "Não informado"', () => {
  const h = tela([alterar(OK_PROPRIA, { requerente: '', senhaAlvo: {} })]);
  assert.ok((h.match(/Não informado/g) || []).length >= 3);
  assert.ok(!PROIBIDO.test(h));
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

test('card de confirmação manual: chip, aviso âmbar com role status e Rodar liberado', () => {
  const h = tela([{ ...SENHA_SISTEMAS, ...MEDIA }]);
  assert.ok(!PROIBIDO.test(h), (h.match(PROIBIDO) || [])[0]);
  assert.ok(h.includes('>Confirmação manual<'), 'chip');
  assert.ok(h.includes('role="status"'));
  assert.ok(h.includes('Confirmação manual: ' + MEDIA.motivoConfianca));
  assert.ok(h.includes('Revise o chamado antes de rodar. Este item não entra no modo automático.'));
  assert.ok(h.includes('var(--warn-tint)'));
  assert.ok(!/#[0-9a-fA-F]{6}[^"]*"[^>]*role="status"/.test(h));
  assert.ok(!h.includes('disabled="true"'), 'Rodar continua liberado');
});

test('card de confiança alta ou sem o campo: sem chip nem aviso', () => {
  for (const it of [{ ...SENHA_SISTEMAS, ...ALTA }, SENHA_SISTEMAS]) {
    const h = tela([it]);
    assert.ok(!h.includes('Confirmação manual') && !h.includes('role="status"'));
  }
});

test('modo automático e lote: nenhum item somenteManual entra (lê o código)', () => {
  const src = fs.readFileSync(path.join(PUBLIC, 'chamados.js'), 'utf8');
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

test('desbloqueio: o card diz que só desbloqueia, mostra requerente e alvo e não fala em trocar a senha', () => {
  const h = tela([desbloquear(OK_PROPRIA)]);
  assert.match(h, /Desbloqueio de usuário do SGA/);
  assert.match(h, /Desbloqueia o usuário alvo no SGA e soluciona o chamado\. A senha não é alterada/);
  assert.match(h, /Requerente/);
  assert.match(h, /Usuário alvo/);
  assert.ok(!/Troca a senha do usuário alvo/.test(h));
  assert.ok(!PROIBIDO.test(h), (h.match(PROIBIDO) || [])[0]);
});

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

test('o card da troca de senha não mudou (continua falando em trocar a senha)', () => {
  const h = tela([alterar(OK_PROPRIA)]);
  assert.match(h, /Troca a senha do usuário alvo no SGA e soluciona o chamado/);
});

// ---------- lista em cache: guardada, entidade e tempos ----------
const livre = { ...SENHA_SISTEMAS, id: 301, entidade: 'Sistemas' };
const outra = { ...SENHA_SISTEMAS, id: 302, entidade: 'Infraestrutura' };

test('lista guardada: Rodar desabilitado com o texto de espera e aviso discreto Atualizando…', () => {
  const h = tela([SENHA_SISTEMAS], { guardado: true, em: new Date(2026, 9, 14, 12, 0, 0) });
  assert.ok(!PROIBIDO.test(h), (h.match(PROIBIDO) || [])[0]);
  assert.ok(h.includes('>Aguardando a atualização da lista<'));
  assert.match(h, /<button[^>]*disabled="true"[^>]*>.*?Rodar<\/span>/);
  assert.ok(h.includes('aria-live="polite"') && h.includes('Atualizando…'));
  assert.ok(h.includes('guardada às'));
  assert.ok(!h.includes('Rodar todos'));
});

test('lista fresca: sem aviso de espera, Rodar liberado e carimbo atualizado às', () => {
  const h = tela([SENHA_SISTEMAS], { em: new Date(2026, 9, 14, 12, 0, 0) });
  assert.ok(!h.includes('Aguardando a atualização') && !h.includes('Atualizando…'));
  assert.ok(!h.includes('disabled="true"'));
  assert.ok(h.includes('atualizado às'));
  assert.ok(h.includes('aria-live="polite"'), 'região viva sempre presente');
});

test('guardada com erro de atualização: aviso e lista continua visível sem rodar', () => {
  const h = tela([SENHA_SISTEMAS], { guardado: true, erro: 'HTTP 500', em: new Date(2026, 9, 14, 12, 0, 0) });
  assert.ok(h.includes('Não foi possível atualizar a lista: HTTP 500'));
  assert.ok(h.includes('Nada roda até a lista ser atualizada'));
  assert.ok(h.includes('Aguardando a atualização da lista'));
  assert.ok(!h.includes('Atualizando…'));
});

test('uma entidade ou servidor antigo: sem chip nem filtro', () => {
  for (const [itens, ents] of [[[livre], ['Sistemas']], [[SENHA_SISTEMAS], []]]) {
    const h = tela(itens, { entidades: ents });
    assert.ok(!h.includes('Entidade no GLPI') && !h.includes('Filtrar por entidade'));
    assert.ok(h.includes('na entidade ' + (ents[0] || 'Sistemas')));
  }
});

test('mais de uma entidade: chip no cartão e filtro com Todas e cada entidade', () => {
  const h = tela([livre, outra], { entidades: ['Sistemas', 'Infraestrutura'] });
  assert.ok(!PROIBIDO.test(h), (h.match(PROIBIDO) || [])[0]);
  assert.ok(h.includes('aria-label="Filtrar por entidade"'));
  assert.ok(h.includes('>Todas<') && h.includes('aria-pressed="true"'));
  assert.equal((h.match(/title="Entidade no GLPI"/g) || []).length, 2);
  assert.ok(h.includes('em 2 entidades'));
  assert.ok(h.includes('#301') && h.includes('#302'), 'sem filtro mostra todos');
});

test('item sem entidade num servidor misto continua normal', () => {
  const h = tela([livre, SENHA_SISTEMAS], { entidades: ['Sistemas', 'Infraestrutura'] });
  assert.equal((h.match(/title="Entidade no GLPI"/g) || []).length, 1);
});

test('tempos: tooltip no carimbo só quando o servidor mede (e nunca na lista guardada)', () => {
  const com = tela([SENHA_SISTEMAS], { em: new Date(2026, 9, 14, 12, 0, 0), tempos: { glpi: 1500 } });
  assert.ok(com.includes('title="Leitura do GLPI: 1,5 s"'));
  const sem = tela([SENHA_SISTEMAS], { em: new Date(2026, 9, 14, 12, 0, 0), tempos: null });
  assert.ok(!sem.includes('Leitura do GLPI'));
  const guardada = tela([SENHA_SISTEMAS], { guardado: true, em: new Date(2026, 9, 14, 12, 0, 0), tempos: { glpi: 1500 } });
  assert.ok(!guardada.includes('Leitura do GLPI'));
});

test('proteção contra dado antigo: automático e rodar conferem lista.guardado (lê o código)', () => {
  const src = fs.readFileSync(path.join(PUBLIC, 'chamados.js'), 'utf8');
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
