// Endereço da automação escondido para quem não é admin, como banco faz com cartão: cada parte do host vira "xxx"
// e só a porta fica (diz qual automação é, não onde está). Ex.: http://192.168.0.10:4016/ -> xxx.xxx.xxx.xxx:4016
(function (raiz) {
  function mascararUrl(url) {
    let u;
    try {
      u = new URL(String(url || ''));
    } catch {
      return 'xxx'; // URL estragada também não pode vazar
    }
    const host = u.hostname.replace(/^\[|\]$/g, '').split(/[.:]/).filter(Boolean).map(() => 'xxx').join('.') || 'xxx';
    return u.port ? host + ':' + u.port : host;
  }

  const api = { mascararUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.ArxMascara = api;
})(typeof window !== 'undefined' ? window : this);
