// Textos do estado do modo automático (aba Chamados). Funções puras, sem React nem DOM.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'chamados-auto.js'), 'utf8'), sandbox, { filename: 'chamados-auto.js' });
const { descreverAuto } = sandbox.window.ChamadosAuto;

const base = { computadores: ['Ana'], rodando: 0, ultima: null, filaWhatsapp: 0, modoTeste: false, limite: 5 };
const PROIBIDO = /NaN|undefined|\[object|—|–| - |\(s\)|>null</;

test('um computador só: diz que só este está no automático e quanto pega por vez', () => {
  const d = descreverAuto(base);
  assert.equal(d.computadores, 'Só este computador está no automático. Pega até 5 chamados por vez.');
});

test('vários computadores: conta, nomes e a divisão da parte de cada um', () => {
  const d = descreverAuto({ ...base, computadores: ['Ana', 'Beto'] });
  assert.equal(d.computadores, '2 computadores no automático: Ana, Beto. Cada um pega a sua parte, até 5 chamados por vez.');
  assert.match(descreverAuto({ ...base, computadores: ['Ana', 'Beto', 'Caio'], limite: 1 }).computadores, /^3 computadores no automático: Ana, Beto, Caio\. Cada um pega a sua parte, até 1 chamado por vez\.$/);
});

test('sem a lista de computadores (servidor não respondeu): cai no texto de um computador', () => {
  assert.match(descreverAuto({ ...base, computadores: [] }).computadores, /^Só este computador/);
  assert.match(descreverAuto({ ...base, computadores: undefined }).computadores, /^Só este computador/);
});

test('agora: executando (com plural certo) ou aguardando', () => {
  assert.equal(descreverAuto({ ...base, rodando: 1 }).agora, 'Executando 1 chamado agora.');
  assert.equal(descreverAuto({ ...base, rodando: 3 }).agora, 'Executando 3 chamados agora.');
  assert.equal(descreverAuto(base).agora, 'Aguardando chamados prontos.');
});

test('última rodada: só aparece quando houve uma', () => {
  assert.equal(descreverAuto(base).ultima, null);
  assert.equal(descreverAuto({ ...base, ultima: { hora: '14:02', quantos: 3 } }).ultima, 'Última rodada às 14:02 com 3 chamados.');
  assert.equal(descreverAuto({ ...base, ultima: { hora: '09:30', quantos: 1 } }).ultima, 'Última rodada às 09:30 com 1 chamado.');
});

test('pedidos do WhatsApp na fila: só aparece quando há, com plural certo', () => {
  assert.equal(descreverAuto(base).whatsapp, null);
  assert.equal(descreverAuto({ ...base, filaWhatsapp: 1 }).whatsapp, '1 pedido do WhatsApp na fila.');
  assert.equal(descreverAuto({ ...base, filaWhatsapp: 4 }).whatsapp, '4 pedidos do WhatsApp na fila.');
});

test('modo teste liga o aviso de que nada é escrito no GLPI', () => {
  assert.equal(descreverAuto(base).aviso, null);
  assert.equal(descreverAuto({ ...base, modoTeste: true }).aviso, 'Modo teste ligado: nada é escrito no GLPI.');
});

test('nenhum texto tem travessão, hífen como separador, "(s)", NaN ou undefined', () => {
  const d = descreverAuto({ computadores: ['Ana', 'Beto'], rodando: 2, ultima: { hora: '10:00', quantos: 2 }, filaWhatsapp: 2, modoTeste: true, limite: 5 });
  for (const t of Object.values(d)) if (t) assert.ok(!PROIBIDO.test(t), t);
});

test('entradas estranhas não quebram (limite ausente, números inválidos)', () => {
  const d = descreverAuto({ computadores: ['Ana'], rodando: -1, filaWhatsapp: 'x', limite: 0 });
  assert.ok(!PROIBIDO.test(Object.values(d).filter(Boolean).join(' ')));
  assert.equal(d.agora, 'Aguardando chamados prontos.');
  assert.equal(d.whatsapp, null);
});
