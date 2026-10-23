# ARX Gravador

Extensão do Chrome que grava os passos de um atendimento no SGA Hinova e no PowerCRM para virar automação depois.
Etapa 1 de 4 do plano (gravar e mascarar). As próximas são: mandar ao Hub, juntar gravações do mesmo tipo com a IA
local e escrever a automação no molde do `alterar-senha-sga`.

## Como usar
1. Clique no ícone da extensão, diga o que vai fazer (ex.: "Desbloquear usuário do SGA") e, se quiser, o número do chamado.
2. Faça o atendimento normalmente no SGA ou no PowerCRM.
3. Volte à extensão e clique em "Parar e salvar". Em "Gravações salvas": Ver, Exportar (`.json` com uma descrição por passo) ou Apagar.

## O que é gravado
| Passo | O que fica |
|---|---|
| Página aberta | endereço com o caminho mascarado e só o NOME dos parâmetros (`?cpf=…`); título mascarado |
| Clique | botão, link, aba, item de menu ou célula: o texto dele (mascarado), id, name e um seletor |
| Campo preenchido | o rótulo do campo e o TIPO do valor: `[cpf]`, `[cnpj]`, `[email]`, `[telefone]`, `[placa]`, `[chassi]`, `[número]`, `[data]`; texto livre vira `[texto de N caracteres]`; senha vira `[senha]`; caixa vira marcado ou desmarcado; lista de opções guarda a opção escolhida (mascarada) |
| Enter | em qual campo |

Nunca é gravado: o que foi digitado em texto livre, senhas, valores de parâmetros do endereço, cookies, conteúdo da página.
A máscara é aplicada na própria página, antes de o passo sair dela (`mascarar.js`, testes em `app/test/extensao-gravador.test.js`).

## Onde fica
Só neste navegador (`chrome.storage.local`): a gravação em andamento e as últimas 50 salvas, até 2000 passos cada.
Só grava em `https://*.hinova.com.br` e `https://app.powercrm.com.br`, e só enquanto uma gravação está ligada.
