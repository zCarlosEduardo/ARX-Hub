// Regras puras do robô do WhatsApp (sem Express nem banco): telefone, vínculo telefone x usuário do GLPI, texto do chamado
// que o robô abre e reação de cada situação do pedido. As rotas ficam em rotasWhatsapp.js.

const soDigitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');

/**
 * Telefone só com dígitos e DDI. Aceita "(31) 98888-7777", "+55 31 ..." e o JID do WhatsApp ("5531...:12@s.whatsapp.net").
 * Sem DDI (10 ou 11 dígitos) vale Brasil (55). Devolve '' quando não parece um telefone.
 */
function normalizarTelefone(valor) {
  const bruto = String(valor == null ? '' : valor).split('@')[0].split(':')[0];
  let d = soDigitos(bruto).replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d.length >= 12 && d.length <= 15 ? d : '';
}

/** O WhatsApp de número antigo vem sem o nono dígito: cada telefone brasileiro de celular tem duas grafias possíveis. */
function chavesTelefone(valor) {
  const n = normalizarTelefone(valor);
  if (!n) return [];
  const chaves = [n];
  if (n.startsWith('55') && n.length === 13 && n[4] === '9') chaves.push(n.slice(0, 4) + n.slice(5));
  if (n.startsWith('55') && n.length === 12 && '6789'.includes(n[4])) chaves.push(`${n.slice(0, 4)}9${n.slice(4)}`);
  return chaves;
}

function mesmoTelefone(a, b) {
  const x = chavesTelefone(a);
  const y = chavesTelefone(b);
  return x.length > 0 && x.some((c) => y.includes(c));
}

/** Vínculo: telefone do solicitante x usuário do GLPI (id) que vai como requerente do chamado. */
function validarVinculo(corpo) {
  const b = corpo && typeof corpo === 'object' ? corpo : {};
  const telefone = normalizarTelefone(b.telefone);
  if (!telefone) return { ok: false, error: 'informe um telefone válido, com DDD' };
  const glpiId = Number(b.glpiId);
  if (!Number.isInteger(glpiId) || glpiId < 1) return { ok: false, error: 'escolha o usuário do GLPI' };
  const nome = typeof b.nome === 'string' ? b.nome.trim() : '';
  if (nome.length > 160) return { ok: false, error: 'o nome passa de 160 caracteres' };
  return { ok: true, valor: { telefone, glpiId, nome } };
}

/** Chave de comparação de nomes: sem acento, caixa, espaço nem pontuação ("TechProtege" = "Tech Protege"). */
const chaveNome = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Conversa privada: a categoria do GLPI vem de uma linha "Categoria Ancore" (ou "Categoria: Ancore") nas 3 primeiras
 * linhas. Devolve o apelido e o texto sem essa linha; sem a linha, o texto volta intacto.
 */
function extrairCategoria(texto) {
  const t = String(texto == null ? '' : texto);
  const linhas = t.split(/\r?\n/);
  for (let i = 0; i < Math.min(3, linhas.length); i++) {
    const m = /^\s*categoria\s*[:\-]?\s*(\S.*?)\s*$/i.exec(linhas[i]);
    if (m) return { apelido: m[1], texto: linhas.filter((_, j) => j !== i).join('\n').replace(/^\s*\n+/, '').trim() };
  }
  return { apelido: '', texto: t };
}

/** Categoria do GLPI cadastrada para o apelido que a pessoa escreveu (null = não existe). */
function acharCategoria(categorias, apelido) {
  const chave = chaveNome(apelido);
  if (!chave) return null;
  return (categorias || []).find((c) => chaveNome(c.apelido) === chave) || null;
}

function acharVinculo(vinculos, telefone) {
  return (vinculos || []).find((v) => mesmoTelefone(v.telefone, telefone)) || null;
}

/** Título (primeira linha da mensagem) e descrição do chamado que o robô abre. */
function montarChamado({ texto, vinculo, grupo, tipoNome }) {
  const t = String(texto || '').trim();
  const primeira = t.split(/\r?\n/).map((l) => l.trim()).find(Boolean) || '';
  const titulo = (primeira || tipoNome || 'Solicitação pelo WhatsApp').slice(0, 120);
  const onde = grupo && grupo.privado ? 'conversa privada' : `grupo ${(grupo && grupo.nome) || 'Não informado'}`;
  const origem = `Aberto pelo ARX Hub a partir do WhatsApp (${onde}, solicitante ${(vinculo && vinculo.nome) || 'Não informado'}).`;
  return { titulo, descricao: t ? `${t}\n\n${origem}` : origem };
}

const NOMES_MIDIA = { imagem: 'imagem', audio: 'áudio', video: 'vídeo', documento: 'documento' };
const EXT_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'video/mp4': 'mp4', 'application/pdf': 'pdf' };
const quandoBr = (ms) => new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

// A categoria do chamado é a associação; pedido que não é de nenhuma associação vai para a categoria interna da ARX.
const CATEGORIA_INTERNA_ID = 2;
const curtoCategoria = (label) => String(label || '').split('>').pop().trim();
const palavras = (t) => ` ${String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
const ehInterna = (c) => c.id === CATEGORIA_INTERNA_ID || /DEMANDASINTERNAS/.test(chaveNome(c.label));

/**
 * Categoria sugerida para um chamado aberto pelas Conversas, nesta ordem: a configurada no grupo; a associação citada
 * nas mensagens ou no nome da conversa (palavra inteira, a de nome mais longo); a que a IA reconheceu (mesmo escrita
 * errado, mas só se existir na lista); senão a interna. `categorias` = lista do GLPI ({ id, label }).
 * @returns {{ id: number|null, nome: string, origem: 'grupo'|'texto'|'ia'|'interna' }}
 */
function categoriaSugerida({ categorias = [], grupoCategoriaId = null, grupoCategoriaNome = '', texto = '', conversa = '', associacaoIa = '' }) {
  if (grupoCategoriaId) return { id: grupoCategoriaId, nome: grupoCategoriaNome, origem: 'grupo' };
  const associacoes = categorias.filter((c) => !ehInterna(c) && chaveNome(curtoCategoria(c.label)).length >= 3);
  const onde = palavras(`${conversa}\n${texto}`);
  const compacto = chaveNome(`${conversa} ${texto}`);
  const citadas = associacoes.filter((c) => {
    const nome = curtoCategoria(c.label);
    // nome de várias palavras também vale escrito junto ("techprotege"); nome curto só como palavra inteira
    return onde.includes(palavras(nome)) || (/\s/.test(nome.trim()) && compacto.includes(chaveNome(nome)));
  }).sort((a, b) => chaveNome(curtoCategoria(b.label)).length - chaveNome(curtoCategoria(a.label)).length);
  if (citadas.length) return { id: citadas[0].id, nome: citadas[0].label, origem: 'texto' };
  const pelaIa = associacaoIa ? associacoes.find((c) => chaveNome(curtoCategoria(c.label)) === chaveNome(associacaoIa)) : null;
  if (pelaIa) return { id: pelaIa.id, nome: pelaIa.label, origem: 'ia' };
  const interna = categorias.find(ehInterna);
  return { id: interna ? interna.id : CATEGORIA_INTERNA_ID, nome: interna ? interna.label : 'ARX - Demandas Internas', origem: 'interna' };
}

/** Nome do anexo de uma mensagem com mídia: o nome do documento ou "whatsapp-<tipo>-<data>.<ext>". */
function nomeAnexo(m) {
  const mime = String((m.midia && m.midia.mime) || '').split(';')[0];
  if (m.midia && m.midia.nome) return String(m.midia.nome).replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200);
  const data = new Date(m.quando || 0).toISOString().slice(0, 16).replace(/[-:T]/g, '');
  return `whatsapp-${m.tipo || 'arquivo'}-${data}-${String(m.id).slice(-6)}.${EXT_MIME[mime] || 'bin'}`;
}

/** Descrição do chamado aberto pelas Conversas: as mensagens marcadas em ordem, com quem mandou e quando. */
function descricaoConversa(mensagens, { conversa } = {}) {
  const linhas = [...mensagens].sort((a, b) => a.quando - b.quando).map((m) => {
    const quem = m.deMim ? 'Robô' : (m.vinculo && m.vinculo.nome) || m.nome || 'Não informado';
    const midia = m.midia ? ` [${NOMES_MIDIA[m.tipo] || 'arquivo'}${m.midia.disponivel ? ' em anexo' : ': arquivo não guardado'}]` : '';
    return `[${quandoBr(m.quando)}] ${quem}:${m.texto ? ` ${m.texto}` : ''}${midia}`;
  });
  return `Mensagens do WhatsApp${conversa ? ` (${conversa})` : ''}:\n\n${linhas.join('\n')}\n\nAberto pelo ARX Hub a partir das Conversas do WhatsApp.`;
}

/** Situação do pedido -> reação na mensagem (null = não reage). */
function reacaoDoStatus(status, reacoes) {
  const r = reacoes || {};
  const mapa = { pendente: r.aFazer, aberto: r.andamento, concluido: r.sucesso, erro: r.erro, sem_vinculo: r.duvida, sem_tipo: r.duvida, sem_categoria: r.duvida };
  return mapa[status] || null;
}

function textoResposta(modelo, { ticketId, solicitante, tipo }) {
  return String(modelo || '')
    .replace(/\{chamado\}/g, String(ticketId == null ? '' : ticketId))
    .replace(/\{solicitante\}/g, solicitante || '')
    .replace(/\{tipo\}/g, tipo || '');
}

/**
 * Tipo final de uma mensagem com a opinião da IA local (Administração > IA). Concordou: vale. Discordou com confiança
 * acima do mínimo: se ela tem certeza de que não é pedido, o robô ignora; se sugere outro tipo liberado para o
 * automático com a validação dela, vale o tipo dela. No resto, vale a regra.
 * @returns {{tipo: string|null, origem: 'regra'|'ia'|'regra e ia'}}
 */
function tipoComIa({ tipoRegra, ia, cfg }) {
  const regra = tipoRegra || null;
  if (!ia || !ia.tipo) return { tipo: regra, origem: 'regra' };
  const tipoIa = ia.tipo === 'sem_automacao' ? null : ia.tipo;
  if (tipoIa === regra) return { tipo: regra, origem: 'regra e ia' };
  if ((Number(ia.confianca) || 0) < (Number(cfg && cfg.confiancaMinima) || 0.8)) return { tipo: regra, origem: 'regra' };
  if (!tipoIa) return { tipo: null, origem: 'ia' };
  if (((cfg && cfg.automaticoTipos) || []).includes(tipoIa)) return { tipo: tipoIa, origem: 'ia' };
  return { tipo: regra, origem: 'regra' };
}

module.exports = { categoriaSugerida, curtoCategoria, CATEGORIA_INTERNA_ID, nomeAnexo, descricaoConversa, chaveNome, extrairCategoria, acharCategoria, normalizarTelefone, chavesTelefone, mesmoTelefone, validarVinculo, acharVinculo, montarChamado, reacaoDoStatus, textoResposta, tipoComIa };
