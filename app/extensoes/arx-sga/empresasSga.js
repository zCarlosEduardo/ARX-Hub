/**
 * Lista das empresas (tenants) do SGA Hinova suportadas pela automação
 * mesma lista usada nas outras automações. Cada empresa tem sua própria URL
 * base; login e relatórios seguem o mesmo padrão de caminho em todas.
 */

/**
 * Recebe uma URL "crua" de uma empresa (pode vir com /v5/login.php, com
 * /v5/, com /v5 sem barra, ou já como base pura) e devolve só a URL BASE
 * comum, sem esses sufixos e sem barra final.
 * Ex.: "https://sga.hinova.com.br/sga/sgav4_valle/v5/login.php"
 *   -> "https://sga.hinova.com.br/sga/sgav4_valle"
 */
function normalizeBase(url) {
  let base = String(url).trim();

  base = base.replace(/\/+$/, '');
  base = base.replace(/\/v5\/login\.php$/i, '');
  base = base.replace(/\/v5$/i, '');
  base = base.replace(/\/+$/, '');

  return base;
}

function buildEmpresa(chave, nome, urlBruta) {
  const base = normalizeBase(urlBruta);
  return {
    chave,
    nome,
    base,
    loginUrl: `${base}/v5/login.php`,
  };
}

const EMPRESAS_SGA = [
  buildEmpresa('ancore', 'Ancore', 'https://sga.hinova.com.br/sga/sgav4_ancore'),
  buildEmpresa('arp', 'ARP', 'https://sga.hinova.com.br/sga/sgav4_sage/v5/login.php'),
  buildEmpresa('brtruck', 'BR Truck', 'https://saturno.hinova.com.br/sga/sgav4_br_truck/v5/'),
  buildEmpresa('coopera', 'Coopera Truck', 'https://sga.hinova.com.br/sga/sgav4_coopera_truck/v5/login.php'),
  buildEmpresa('digicar', 'Digicar', 'https://taiga.hinova.com.br/sga/sgav4_digicar/v5/login.php'),
  buildEmpresa('eseg', 'Eseg', 'https://sga.hinova.com.br/sga/sgav4_esegcoop/v5/login.php'),
  buildEmpresa('exodo', 'Êxodo', 'https://sga.hinova.com.br/sga/sgav4_exodo/v5/login.php'),
  buildEmpresa('gta', 'GTA', 'https://sga.hinova.com.br/sga/sgav4_gta/v5/login.php'),
  buildEmpresa('canaa', 'Canaã', 'https://sga.hinova.com.br/sga/sgav4_grupo_canaa/v5/login.php'),
  buildEmpresa('movidas', 'Movidas', 'https://sga.hinova.com.br/sga/sgav4_movidas/v5/login.php'),
  buildEmpresa('protegecar', 'ProtegeCar', 'https://sga.hinova.com.br/sga/sgav4_protegecar_pv/v5/login.php'),
  buildEmpresa('royale', 'Royale', 'https://sga.hinova.com.br/sga/sgav4_royale/v5/login.php'),
  buildEmpresa('speed', 'Speed', 'https://sga.hinova.com.br/sga/sgav4_speed/v5/login.php'),
  buildEmpresa('techprotege', 'TechProtege', 'https://sga.hinova.com.br/sga/sgav4_techprotege/v5/login.php'),
  buildEmpresa('unik', 'Unik', 'https://sga.hinova.com.br/sga/sgav4_unik/v5/login.php'),
  buildEmpresa('validi', 'Válidi', 'https://sga.hinova.com.br/sga/sgav4_validi/v5/login.php'),
  buildEmpresa('valle', 'Valle', 'https://sga.hinova.com.br/sga/sgav4_valle/v5/login.php'),
];

function getEmpresaByChave(chave) {
  return EMPRESAS_SGA.find((e) => e.chave === chave);
}

/** Monta a URL direta de um relatório (link do menu) para uma empresa. */
function urlRelatorio(empresa, caminho) {
  return `${empresa.base}${caminho}`;
}

module.exports = { EMPRESAS_SGA, normalizeBase, getEmpresaByChave, urlRelatorio };
