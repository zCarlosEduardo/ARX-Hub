// Administração do Hub (funções puras, testáveis): quem é admin, validação das configurações e da ordem das automações.
//
// Quem é admin: a identidade vem do GLPI (o token do usuário abre uma sessão e o GLPI diz quem é). O Hub NÃO tem login próprio;
// este módulo só decide se aquela pessoa está na lista de admins. A lista casa por id do GLPI (o mais seguro), por login ou por
// nome completo. Na primeira vez que alguém casa por login ou nome, o id do GLPI é gravado (aí só o id vale).

const norm = (s) =>
  String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Lê o que o GLPI devolve em GET /getFullSession e devolve { id, login, nome, nomes }.
 * `nomes` são as formas normalizadas do nome completo (nome sobrenome, sobrenome nome, nome de exibição), para comparar.
 * @returns {{id: number|null, login: string, nome: string, nomes: string[]} | null}
 */
function usuarioDaSessao(resposta) {
  const s = resposta && typeof resposta === 'object' ? resposta.session || resposta : null;
  if (!s || typeof s !== 'object') return null;
  const id = Number(s.glpiID);
  const login = String(s.glpiname || '').trim();
  // o GLPI da ARX põe o departamento entre parênteses no nome: "(Sistemas) Fulano"; fora isso não faz parte do nome
  const semDepto = (t) => String(t || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const primeiro = semDepto(s.glpifirstname);
  const ultimo = semDepto(s.glpirealname);
  const amigavel = semDepto(s.glpifriendlyname);
  const completo = [primeiro, ultimo].filter(Boolean).join(' ');
  const nome = completo || amigavel || login;
  if (!Number.isInteger(id) && !login && !nome) return null;
  const nomes = [...new Set([completo, [ultimo, primeiro].filter(Boolean).join(' '), amigavel, login].map(norm).filter(Boolean))];
  // grupos do GLPI da pessoa (lista de ids; versões antigas mandam objeto { id: id })
  const brutos = Array.isArray(s.glpigroups) ? s.glpigroups : s.glpigroups && typeof s.glpigroups === 'object' ? Object.values(s.glpigroups) : [];
  const grupos = [...new Set(brutos.map(Number).filter((g) => Number.isInteger(g) && g > 0))];
  return { id: Number.isInteger(id) && id > 0 ? id : null, login, nome, nomes, grupos };
}

/** Grupos do GLPI que veem uma automação: lista de ids sem repetir (vazia = todo mundo). */
function validarGrupos(corpo) {
  const lista = corpo && Array.isArray(corpo.grupos) ? corpo.grupos : null;
  if (!lista || lista.length > 200) return { ok: false, error: 'grupos deve ser uma lista com até 200 ids de grupo do GLPI' };
  const saida = [];
  for (const g of lista) {
    const n = Number(g);
    if (!Number.isSafeInteger(n) || n < 1) return { ok: false, error: 'id de grupo inválido' };
    if (!saida.includes(n)) saida.push(n);
  }
  return { ok: true, valor: saida };
}

/**
 * A pessoa vê a automação? Sem grupos = todo mundo; admin vê tudo; senão precisa estar em um dos grupos.
 * @param {{grupos?: number[]}} automacao
 * @param {{admin: boolean, usuario: {grupos: number[]}}|null} quem  null = sem token do GLPI
 */
function podeVer(automacao, quem) {
  const grupos = (automacao && automacao.grupos) || [];
  if (!grupos.length) return true;
  if (!quem) return false;
  if (quem.admin) return true;
  const meus = (quem.usuario && quem.usuario.grupos) || [];
  return grupos.some((g) => meus.includes(Number(g)));
}

/**
 * A pessoa está na lista de admins? Devolve a entrada que casou (com `porId: false` quando casou por login ou nome e o id
 * ainda não estava gravado, para o servidor gravar) ou null.
 * @param {{id: number|null, login: string, nomes: string[]}} usuario
 * @param {Array<{id: number, glpiId: number|null, login: string, nome: string}>} admins
 */
function adminCorrespondente(usuario, admins) {
  if (!usuario) return null;
  for (const a of admins || []) {
    if (a.glpiId != null) {
      if (usuario.id != null && a.glpiId === usuario.id) return { admin: a, porId: true };
      continue; // com id gravado, login e nome não valem (evita homônimo)
    }
    if (a.login && norm(a.login) === norm(usuario.login)) return { admin: a, porId: false };
    if (a.nome && usuario.nomes.includes(norm(a.nome))) return { admin: a, porId: false };
  }
  return null;
}

/** Nomes iniciais de admin vindos da variável de ambiente (separados por ; ou vírgula), sem repetir. */
function adminsIniciais(texto) {
  const vistos = new Set();
  const lista = [];
  for (const bruto of String(texto || '').split(/[;\n]/)) {
    const nome = bruto.trim();
    if (nome && !vistos.has(norm(nome))) {
      vistos.add(norm(nome));
      lista.push(nome);
    }
  }
  return lista;
}

// ---------- configurações ----------
const SESSOES_COFRE = ['dia', 'horas', 'aba', 'pedir'];
const MODOS_WHATSAPP = ['observacao', 'ativo'];
const OPERACOES_WHATSAPP = ['fila_automatico', 'so_abrir'];
/** Tipos de solicitação que o robô do WhatsApp pode tratar (mesmas chaves do chamados-glpi). */
const TIPOS_SOLICITACAO = [
  { chave: 'cadastro_consultor', nome: 'Cadastro de consultor' },
  { chave: 'cadastro_usuario', nome: 'Cadastro de usuário' },
  { chave: 'inativacao_consultor', nome: 'Inativação de consultor' },
  { chave: 'ativacao_consultor', nome: 'Ativação de consultor' },
  { chave: 'bloqueio_acesso', nome: 'Bloqueio de acesso' },
  { chave: 'senha_sistemas', nome: 'Senha de sistemas' },
  { chave: 'alterar_senha_sga', nome: 'Alterar senha do SGA' },
  { chave: 'desbloquear_usuario_sga', nome: 'Desbloqueio de usuário do SGA' },
  { chave: 'foto_perfil', nome: 'Foto de perfil' },
  { chave: 'sincronizar_vistoria', nome: 'Sincronizar vistoria' },
  { chave: 'cadastro_modelo', nome: 'Cadastro de modelo' },
  { chave: 'erro_exportar_modelo', nome: 'Erro ao exportar modelo' },
  { chave: 'fechamento', nome: 'Fechamento' },
];
const CHAVES_TIPOS = new Set(TIPOS_SOLICITACAO.map((t) => t.chave));
const SLUG = /^[a-z0-9][a-z0-9_-]{0,29}$/;

function configPadrao() {
  return {
    cofre: { modo: 'ativo', sessao: 'dia', horas: 8 },
    // quem cadastra, edita e remove automação (e vê o endereço real), como o endereço aparece para os outros e se
    // eles podem abrir a automação em nova aba (sempre pelo proxy, sem o endereço real)
    automacoes: { cadastro: 'admins', endereco: 'mascarado', novaAba: true, marca: '' },
    // IA local (ia-local): ligada = containers rodando (ia-controle); automaticoTipos = tipos que rodam no automático
    // com a validação dela (mesmo quando discorda da regra, se a confiança passar de confiancaMinima)
    ia: { ligada: false, automaticoTipos: [], confiancaMinima: 0.8, textoPelaIa: false, repetirErros: false, maxTentativas: 2, reabertos: false, pedirPendencias: false, whatsappModo: 'reagir' },
    // extensões de navegador para baixar (app/extensoes): mostrar = botão "Extensões" no Hub; ocultas = ids escondidas
    extensoes: { mostrar: true, ocultas: [] },
    whatsapp: {
      ativo: false,
      modo: 'observacao',
      operacao: 'fila_automatico',
      respostaModelo: 'Chamado {chamado} concluído.',
      numeros: [],
      grupos: [],
      remetentesAutorizados: [],
      privado: { ativo: false, tipos: [], responder: false, reagir: true, explicarDuvida: true, categorias: [] },
      reacoes: { aFazer: '⏳', andamento: '🔍', sucesso: '✅', erro: '⚠️', duvida: '❓' },
      // Conversas no Hub: o robô guarda as mensagens dos grupos atendidos, dos grupos extras (jids) e, se ligado, do privado
      // quem vê a aba: 'admins', 'grupos' (administradores e os grupos do GLPI marcados) ou 'todos' (quem entra com o token do GLPI)
      conversas: { ativo: false, privado: false, jids: [], quem: 'admins', grupos: [] },
      // resposta enviada à pessoa quando o chamado é aberto pelas Conversas: a do tipo escolhido ou a geral
      respostas: { abertura: 'Recebemos seu pedido. Chamado {chamado} aberto.', porTipo: {} },
    },
  };
}

const { chaveNome } = require('./whatsapp');
const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max + 1) : '');
const soDigitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');

function validarCofre(b) {
  const padrao = configPadrao().cofre;
  const c = b && typeof b === 'object' ? b : {};
  const modo = c.modo === undefined ? padrao.modo : c.modo;
  if (modo !== 'ativo' && modo !== 'desativado') return { erro: 'cofre.modo deve ser ativo ou desativado' };
  const sessao = c.sessao === undefined ? padrao.sessao : c.sessao;
  if (!SESSOES_COFRE.includes(sessao)) return { erro: `cofre.sessao deve ser uma de: ${SESSOES_COFRE.join(', ')}` };
  const horas = c.horas === undefined ? padrao.horas : Number(c.horas);
  if (!Number.isInteger(horas) || horas < 1 || horas > 72) return { erro: 'cofre.horas deve ser um número inteiro de 1 a 72' };
  return { valor: { modo, sessao, horas } };
}

function validarAutomacoes(b) {
  const padrao = configPadrao().automacoes;
  const c = b && typeof b === 'object' ? b : {};
  const cadastro = c.cadastro === undefined ? padrao.cadastro : c.cadastro;
  if (cadastro !== 'admins' && cadastro !== 'todos') return { erro: 'automacoes.cadastro deve ser admins ou todos' };
  const endereco = c.endereco === undefined ? padrao.endereco : c.endereco;
  if (endereco !== 'mascarado' && endereco !== 'oculto') return { erro: 'automacoes.endereco deve ser mascarado ou oculto' };
  const novaAba = c.novaAba === undefined ? padrao.novaAba : c.novaAba;
  if (typeof novaAba !== 'boolean') return { erro: 'automacoes.novaAba deve ser verdadeiro ou falso' };
  // nome que aparece no começo da barra de abas (ex.: "ARX Aut"); vazio deixa a barra sem nome
  const marca = c.marca === undefined ? padrao.marca : c.marca;
  if (typeof marca !== 'string' || marca.trim().length > 30) return { erro: 'automacoes.marca deve ser um texto de até 30 caracteres' };
  return { valor: { cadastro, endereco, novaAba, marca: marca.trim() } };
}

function validarExtensoes(b) {
  const padrao = configPadrao().extensoes;
  const c = b && typeof b === 'object' ? b : {};
  const mostrar = c.mostrar === undefined ? padrao.mostrar : c.mostrar;
  if (typeof mostrar !== 'boolean') return { erro: 'extensoes.mostrar deve ser verdadeiro ou falso' };
  const ocultas = c.ocultas === undefined ? padrao.ocultas : c.ocultas;
  if (!Array.isArray(ocultas) || ocultas.some((x) => typeof x !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(x))) return { erro: 'extensoes.ocultas deve ser uma lista de ids de extensão' };
  return { valor: { mostrar, ocultas: [...new Set(ocultas)] } };
}

function validarIa(b) {
  const padrao = configPadrao().ia;
  const c = b && typeof b === 'object' ? b : {};
  const v = (k) => (c[k] === undefined ? padrao[k] : c[k]);
  for (const k of ['ligada', 'textoPelaIa', 'repetirErros', 'reabertos', 'pedirPendencias']) if (typeof v(k) !== 'boolean') return { erro: `ia.${k} deve ser verdadeiro ou falso` };
  const tiposBrutos = v('automaticoTipos');
  if (!Array.isArray(tiposBrutos)) return { erro: 'ia.automaticoTipos deve ser uma lista' };
  const automaticoTipos = [...new Set(tiposBrutos.map(String))];
  const invalido = automaticoTipos.find((t) => !CHAVES_TIPOS.has(t));
  if (invalido) return { erro: `o tipo "${invalido}" não existe` };
  const confiancaMinima = Number(v('confiancaMinima'));
  if (!Number.isFinite(confiancaMinima) || confiancaMinima < 0.5 || confiancaMinima > 1) return { erro: 'a confiança mínima deve ser de 0,5 a 1' };
  const maxTentativas = Number(v('maxTentativas'));
  if (!Number.isInteger(maxTentativas) || maxTentativas < 1 || maxTentativas > 5) return { erro: 'as tentativas automáticas devem ser de 1 a 5' };
  const whatsappModo = v('whatsappModo');
  if (whatsappModo !== 'reagir' && whatsappModo !== 'responder') return { erro: 'ia.whatsappModo deve ser reagir ou responder' };
  return { valor: { ligada: v('ligada'), automaticoTipos, confiancaMinima: Math.round(confiancaMinima * 100) / 100, textoPelaIa: v('textoPelaIa'), repetirErros: v('repetirErros'), maxTentativas, reabertos: v('reabertos'), pedirPendencias: v('pedirPendencias'), whatsappModo } };
}

function validarWhatsapp(b) {
  const padrao = configPadrao().whatsapp;
  const w = b && typeof b === 'object' ? b : {};
  const ativo = w.ativo === undefined ? padrao.ativo : w.ativo;
  if (typeof ativo !== 'boolean') return { erro: 'whatsapp.ativo deve ser verdadeiro ou falso' };
  const modo = w.modo === undefined ? padrao.modo : w.modo;
  if (!MODOS_WHATSAPP.includes(modo)) return { erro: `whatsapp.modo deve ser um de: ${MODOS_WHATSAPP.join(', ')}` };

  const operacao = w.operacao === undefined ? padrao.operacao : w.operacao;
  if (operacao === 'totalmente') return { erro: 'o modo totalmente automático exige logins do SGA e do PowerCRM guardados no servidor e ainda não está disponível' };
  if (!OPERACOES_WHATSAPP.includes(operacao)) return { erro: `whatsapp.operacao deve ser uma de: ${OPERACOES_WHATSAPP.join(', ')}` };
  const respostaModelo = w.respostaModelo === undefined ? padrao.respostaModelo : texto(w.respostaModelo, 300);
  if (!respostaModelo || respostaModelo.length > 300) return { erro: 'o texto da resposta no grupo precisa ter de 1 a 300 caracteres' };

  const numerosBrutos = w.numeros === undefined ? [] : w.numeros;
  if (!Array.isArray(numerosBrutos) || numerosBrutos.length > 10) return { erro: 'whatsapp.numeros deve ser uma lista de até 10 números' };
  const numeros = [];
  const idsNumeros = new Set();
  for (const n of numerosBrutos) {
    if (!n || typeof n !== 'object') return { erro: 'cada número do WhatsApp deve ser um objeto' };
    if (typeof n.id !== 'string' || !SLUG.test(n.id)) return { erro: 'o id do número deve ter letras minúsculas, números, hífen ou sublinhado (até 30)' };
    if (idsNumeros.has(n.id)) return { erro: `o número "${n.id}" está repetido` };
    idsNumeros.add(n.id);
    const rotulo = texto(n.rotulo, 60);
    if (!rotulo || rotulo.length > 60) return { erro: 'cada número precisa de um nome de até 60 caracteres' };
    const telefone = soDigitos(n.telefone);
    if (telefone && (telefone.length < 10 || telefone.length > 15)) return { erro: `o telefone de "${rotulo}" deve ter de 10 a 15 dígitos (com DDI e DDD)` };
    numeros.push({ id: n.id, rotulo, telefone, ativo: n.ativo !== false });
  }

  const gruposBrutos = w.grupos === undefined ? [] : w.grupos;
  if (!Array.isArray(gruposBrutos) || gruposBrutos.length > 100) return { erro: 'whatsapp.grupos deve ser uma lista de até 100 grupos' };
  const grupos = [];
  const idsGrupos = new Set();
  for (const g of gruposBrutos) {
    if (!g || typeof g !== 'object') return { erro: 'cada grupo deve ser um objeto' };
    if (typeof g.id !== 'string' || !SLUG.test(g.id)) return { erro: 'o id do grupo deve ter letras minúsculas, números, hífen ou sublinhado (até 30)' };
    if (idsGrupos.has(g.id)) return { erro: `o grupo "${g.id}" está repetido` };
    idsGrupos.add(g.id);
    const nome = texto(g.nome, 120);
    if (!nome || nome.length > 120) return { erro: 'cada grupo precisa de um nome de até 120 caracteres' };
    const jid = texto(g.jid, 120);
    if (jid.length > 120) return { erro: `o identificador do grupo "${nome}" passa de 120 caracteres` };
    const numeroId = typeof g.numeroId === 'string' ? g.numeroId : '';
    if (numeroId && !idsNumeros.has(numeroId)) return { erro: `o grupo "${nome}" usa um número que não existe na lista` };
    const tiposBrutos = g.tipos === undefined ? [] : g.tipos;
    if (!Array.isArray(tiposBrutos)) return { erro: `os tipos do grupo "${nome}" devem ser uma lista` };
    const tipos = [...new Set(tiposBrutos.map(String))];
    const invalido = tipos.find((t) => !CHAVES_TIPOS.has(t));
    if (invalido) return { erro: `o tipo "${invalido}" do grupo "${nome}" não existe` };
    const categoriaId = g.categoriaId === undefined || g.categoriaId === null || g.categoriaId === '' ? null : Number(g.categoriaId);
    if (categoriaId !== null && (!Number.isInteger(categoriaId) || categoriaId < 1)) return { erro: `a categoria do GLPI do grupo "${nome}" é inválida` };
    const categoriaLabel = texto(g.categoriaLabel, 300).slice(0, 300);
    grupos.push({ id: g.id, nome, jid, numeroId, categoriaId, categoriaLabel, tipos, ativo: g.ativo !== false, responder: g.responder === true, reagir: g.reagir !== false });
  }

  const autorizadosBrutos = w.remetentesAutorizados === undefined ? [] : w.remetentesAutorizados;
  if (!Array.isArray(autorizadosBrutos) || autorizadosBrutos.length > 200) return { erro: 'whatsapp.remetentesAutorizados deve ser uma lista de até 200 telefones' };
  const remetentesAutorizados = [];
  for (const t of autorizadosBrutos) {
    const d = soDigitos(t);
    if (d.length < 10 || d.length > 15) return { erro: 'cada remetente autorizado deve ter de 10 a 15 dígitos (com DDI e DDD)' };
    if (!remetentesAutorizados.includes(d)) remetentesAutorizados.push(d);
  }

  // conversa privada: o robô atende pedidos mandados direto para o chip; a categoria do GLPI vem da mensagem ("Categoria Ancore")
  const pv = w.privado && typeof w.privado === 'object' ? w.privado : {};
  const pvAtivo = pv.ativo === undefined ? false : pv.ativo;
  if (typeof pvAtivo !== 'boolean') return { erro: 'whatsapp.privado.ativo deve ser verdadeiro ou falso' };
  if (pv.tipos !== undefined && !Array.isArray(pv.tipos)) return { erro: 'os tipos da conversa privada devem ser uma lista' };
  const pvTipos = [...new Set((pv.tipos || []).map(String))];
  const pvTipoInvalido = pvTipos.find((t) => !CHAVES_TIPOS.has(t));
  if (pvTipoInvalido) return { erro: `o tipo "${pvTipoInvalido}" da conversa privada não existe` };
  const pvCatsBrutas = pv.categorias === undefined ? [] : pv.categorias;
  if (!Array.isArray(pvCatsBrutas) || pvCatsBrutas.length > 100) return { erro: 'whatsapp.privado.categorias deve ser uma lista de até 100 categorias' };
  const pvCategorias = [];
  const chavesApelidos = new Set();
  for (const c of pvCatsBrutas) {
    if (!c || typeof c !== 'object') return { erro: 'cada categoria da conversa privada deve ser um objeto' };
    const apelido = texto(c.apelido, 60);
    if (!apelido || apelido.length > 60 || !chaveNome(apelido)) return { erro: 'cada categoria da conversa privada precisa de um nome de até 60 caracteres' };
    if (chavesApelidos.has(chaveNome(apelido))) return { erro: `o nome de categoria "${apelido}" está repetido` };
    chavesApelidos.add(chaveNome(apelido));
    const categoriaId = Number(c.categoriaId);
    if (!Number.isInteger(categoriaId) || categoriaId < 1) return { erro: `escolha a categoria do GLPI de "${apelido}"` };
    pvCategorias.push({ apelido, categoriaId, categoriaLabel: texto(c.categoriaLabel, 300).slice(0, 300) });
  }
  if (pv.explicarDuvida !== undefined && typeof pv.explicarDuvida !== 'boolean') return { erro: 'whatsapp.privado.explicarDuvida deve ser verdadeiro ou falso' };
  const privado = { ativo: pvAtivo, tipos: pvTipos, responder: pv.responder === true, reagir: pv.reagir !== false, explicarDuvida: pv.explicarDuvida !== false, categorias: pvCategorias };

  const r = w.reacoes && typeof w.reacoes === 'object' ? w.reacoes : {};
  const reacoes = {};
  for (const chave of ['aFazer', 'andamento', 'sucesso', 'erro', 'duvida']) {
    const v = r[chave] === undefined ? padrao.reacoes[chave] : r[chave];
    if (typeof v !== 'string' || !v.trim() || [...v.trim()].length > 4) return { erro: `a reação "${chave}" deve ser um emoji` };
    reacoes[chave] = v.trim();
  }
  const cv = w.conversas && typeof w.conversas === 'object' ? w.conversas : {};
  if (cv.ativo !== undefined && typeof cv.ativo !== 'boolean') return { erro: 'whatsapp.conversas.ativo deve ser verdadeiro ou falso' };
  if (cv.privado !== undefined && typeof cv.privado !== 'boolean') return { erro: 'whatsapp.conversas.privado deve ser verdadeiro ou falso' };
  const jidsBrutos = cv.jids === undefined ? [] : cv.jids;
  if (!Array.isArray(jidsBrutos) || jidsBrutos.length > 100) return { erro: 'whatsapp.conversas.jids deve ser uma lista de até 100 grupos' };
  const jids = [...new Set(jidsBrutos.map((j) => texto(j, 120)))];
  if (jids.some((j) => !/^[0-9-]{5,100}@g\.us$/.test(j))) return { erro: 'cada grupo das Conversas deve ser um identificador que termina em @g.us' };
  const quem = cv.quem === undefined ? 'admins' : cv.quem;
  if (!['admins', 'grupos', 'todos'].includes(quem)) return { erro: 'whatsapp.conversas.quem deve ser admins, grupos ou todos' };
  const gruposVer = cv.grupos === undefined ? [] : cv.grupos;
  if (!Array.isArray(gruposVer) || gruposVer.length > 200 || gruposVer.some((g) => !Number.isInteger(Number(g)) || Number(g) < 1)) return { erro: 'whatsapp.conversas.grupos deve ser uma lista de grupos do GLPI' };
  if (quem === 'grupos' && !gruposVer.length) return { erro: 'escolha ao menos um grupo do GLPI que pode ver as Conversas' };
  const conversas = { ativo: cv.ativo === true, privado: cv.privado === true, jids, quem, grupos: [...new Set(gruposVer.map(Number))] };

  const rp = w.respostas && typeof w.respostas === 'object' ? w.respostas : {};
  const abertura = rp.abertura === undefined ? padrao.respostas.abertura : texto(rp.abertura, 500);
  if (!abertura || abertura.length > 500) return { erro: 'a resposta geral ao abrir o chamado precisa ter de 1 a 500 caracteres' };
  const porTipoBruto = rp.porTipo && typeof rp.porTipo === 'object' && !Array.isArray(rp.porTipo) ? rp.porTipo : {};
  const porTipo = {};
  for (const [k, v] of Object.entries(porTipoBruto)) {
    if (!CHAVES_TIPOS.has(k)) return { erro: `o tipo "${k}" das respostas não existe` };
    const t = texto(v, 500);
    if (t.length > 500) return { erro: 'cada resposta por tipo pode ter até 500 caracteres' };
    if (t) porTipo[k] = t;
  }
  return { valor: { ativo, modo, operacao, respostaModelo, numeros, grupos, remetentesAutorizados, privado, reacoes, conversas, respostas: { abertura, porTipo } } };
}

/** Valida UMA seção da configuração. @returns {{ok: true, valor: object} | {ok: false, error: string}} */
function validarSecao(chave, corpo) {
  const validadores = { cofre: validarCofre, automacoes: validarAutomacoes, whatsapp: validarWhatsapp, ia: validarIa, extensoes: validarExtensoes };
  const r = validadores[chave] ? validadores[chave](corpo) : { erro: 'seção de configuração desconhecida' };
  return r.erro ? { ok: false, error: r.erro } : { ok: true, valor: r.valor };
}

/** Admin novo: id do GLPI, login ou nome (ao menos um). */
function validarNovoAdmin(corpo) {
  const b = corpo && typeof corpo === 'object' ? corpo : {};
  const glpiId = b.glpiId === undefined || b.glpiId === null || b.glpiId === '' ? null : Number(b.glpiId);
  if (glpiId !== null && (!Number.isInteger(glpiId) || glpiId < 1)) return { ok: false, error: 'glpiId inválido' };
  const login = texto(b.login, 80);
  const nome = texto(b.nome, 160);
  if (login.length > 80 || nome.length > 160) return { ok: false, error: 'login ou nome grande demais' };
  if (glpiId === null && !login && !nome) return { ok: false, error: 'informe a pessoa (id, login ou nome do GLPI)' };
  return { ok: true, valor: { glpiId, login, nome } };
}

/** Nova ordem das automações: lista de ids sem repetir. */
function validarOrdem(corpo) {
  const ids = corpo && Array.isArray(corpo.ids) ? corpo.ids : null;
  if (!ids || !ids.length || ids.length > 500) return { ok: false, error: 'ids deve ser uma lista com as automações na nova ordem' };
  const saida = [];
  for (const bruto of ids) {
    const s = String(bruto);
    if (!/^[1-9][0-9]{0,15}$/.test(s)) return { ok: false, error: 'id de automação inválido' };
    const n = Number(s);
    if (!Number.isSafeInteger(n) || saida.includes(n)) return { ok: false, error: 'ids repetidos ou inválidos' };
    saida.push(n);
  }
  return { ok: true, valor: saida };
}

module.exports = {
  norm,
  usuarioDaSessao,
  adminCorrespondente,
  adminsIniciais,
  configPadrao,
  validarSecao,
  validarNovoAdmin,
  validarOrdem,
  validarGrupos,
  podeVer,
  TIPOS_SOLICITACAO,
  SESSOES_COFRE,
  MODOS_WHATSAPP,
  OPERACOES_WHATSAPP,
};
