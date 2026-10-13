# CLAUDE.md (ARX Hub)

## Visão geral
Painel central das automações ARX: lista as automações (cada uma é um container em `../ARX-Automacoes`), mostra se estão no ar (varredura periódica + SSE) e abre chamados no GLPI. Repositório irmão: `../ARX-Automacoes` (regras gerais do projeto no `CLAUDE.md` de lá).

## Stack
Express 4 + Postgres (`pg`) no servidor; front em React UMD **sem build** (`app/public/*.js`, tudo em `window`, ordem de carga: icons, acessos, alertas, chamados, disponibilidade, resultados, app).

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
- **Token GLPI do usuário** fica só no navegador (localStorage) e viaja no corpo da requisição; o servidor nunca grava nem loga (ver `glpi.sanitizar` e `http.erroFinal`). O App-Token fica só em env.
- Varredura: `CHECK_INTERVAL_MS` (padrão 15000) e `CHECK_TIMEOUT_MS` (3000). Só grava no banco e faz broadcast quando o status muda; a lista é cacheada em memória.
