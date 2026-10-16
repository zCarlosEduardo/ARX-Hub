# CLAUDE.md (ARX Hub)

## Visão geral
Painel central das automações ARX: lista as automações (cada uma é um container em `../ARX-Automacoes`), mostra se estão no ar (varredura periódica + SSE) e abre chamados no GLPI. Repositório irmão: `../ARX-Automacoes` (regras gerais do projeto no `CLAUDE.md` de lá).

## Stack
Express 4 + Postgres (`pg`) no servidor; front em React UMD **sem build** (`app/public/*.js`, tudo em `window`, ordem de carga: icons, acessos, alertas, chamados, graficos-dados, graficos, disponibilidade, resultados, app; cálculos dos gráficos em `graficos-dados.js`, testados em `app/test`).

## Comandos
```bash
cd app && npm install && npm start     # precisa de DATABASE_URL (Postgres)
cd app && npm test                     # node --test (validação, erros, config, varredura, sanitização GLPI)
../ARX-Automacoes/scripts/deploy.sh hub   # deploy; nunca docker compose up --build direto (produção)
```

## Estrutura
- `app/server.js`: rotas, SSE, varredura. `db.js`: pool, tabelas, seed. `glpi.js`: cliente GLPI.
- `app/validacao.js`, `config.js`, `http.js`, `varredura.js`: lógica pura, com testes em `app/test/`.
- `app/public/`: front (`index.html`, scripts, `styles.css`, `vendor/`, `assets/`).
- `docker-compose.yml` + `.env` (modelo em `.env.example`).

## Regras
- Commits em português, Conventional Commits com escopo (`fix(hub): ...`). Sem push sem pedido. Arquivos em LF.
- Sem dependências novas sem necessidade; testes com `node --test`.
- Não derrube containers de produção; confira com `node --check` e testes.
- Em produção `POSTGRES_PASSWORD` é obrigatória (o servidor não sobe sem ela).

## Contexto importante
- **Sem autenticação de propósito**: o Hub vai virar iframe de outro projeto ARX, que cuidará do acesso. Por isso `/api/test-connection` só valida o formato da URL, não restringe hosts. Não adicionar auth aqui sem alinhar.
- **Acessos no navegador (cofre):** logins do SGA e do PowerCRM, senha padrão e token do GLPI ficam CIFRADOS no navegador (`app/public/cofre.js`: AES-GCM 256, chave derivada da senha mestra por PBKDF2-SHA256 de 600 mil voltas; a senha mestra e a chave nunca são gravadas, a chave só existe na memória). Trava sozinho em 15 minutos parado. `acessos.js` guarda tudo via cofre (nunca texto puro); acessos antigos em texto puro são migrados quando a pessoa cria o cofre. O token do GLPI também vai pelo cofre (`ArxAcessosHub.definirToken`). **Contexto seguro:** o navegador só libera o WebCrypto em HTTPS ou `localhost`; pelo Hub aberto por `http://IP-da-rede` o `crypto.subtle` não existe (erro "reading 'importKey'"). Por isso o `cofre.js` tem dois motores com o mesmo formato (um cofre abre nos dois): WebCrypto e o **motor de reserva** `app/public/vendor/arx-cripto.min.js` (`@noble/hashes` e `@noble/ciphers` 2.4.0, MIT, licenças em `vendor/arx-cripto.LICENSE.txt`; fonte e receita em `scripts/cripto/entrada.mjs`). No motor de reserva criar ou destravar leva ~1,5 s e a chave fica como bytes na memória (não como CryptoKey não extraível). Nunca escreva criptografia própria. Com HTTPS no Hub o WebCrypto passa a valer sozinho. Sem a senha mestra não há recuperação: "esqueci" apaga o cofre e a pessoa digita tudo de novo. Não é hash: as automações precisam da senha original.
- **Token GLPI do usuário** vem do cofre e viaja no corpo da requisição; o servidor nunca grava nem loga (ver `glpi.sanitizar` e `http.erroFinal`). O App-Token fica só em env.
- Varredura: `CHECK_INTERVAL_MS` (padrão 15000) e `CHECK_TIMEOUT_MS` (3000). Só grava no banco e faz broadcast quando o status muda; a lista é cacheada em memória.
