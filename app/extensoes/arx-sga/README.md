# ARX SGA (extensão do Chrome e do Edge)

Mantém você logado no SGA Hinova: na tela de login de uma empresa, a extensão preenche o login daquela empresa e clica
em Entrar. Quando o SGA mostra "Request Header Or Cookie Too Large" (cookies acumulados), ela apaga os cookies do SGA e
volta para o login, que entra sozinho.

## Instalar

1. No ARX Hub, clique no botão **Extensões** (barra de endereço) e em **Baixar** na ARX SGA. Quem libera o botão e a
   extensão é a Administração > Extensões.
2. Extraia o `.zip` numa pasta que não vai ser apagada.
3. Chrome: abra `chrome://extensions` (no Edge, `edge://extensions`) e ligue o **Modo do desenvolvedor**.
4. **Carregar sem compactação** e escolha a pasta extraída (a que tem o `manifest.json`).
5. Fixe o ícone "ARX SGA" na barra e clique nele.

Para atualizar: baixe de novo pelo Hub, troque os arquivos da mesma pasta e clique em **Recarregar** no cartão da extensão.

## Usar

1. **Criar a senha mestra** (8 caracteres ou mais). Ela cifra os logins; sem ela não dá para recuperar o que foi
   guardado (em "Esqueci a senha" o cofre é apagado e os logins são cadastrados de novo).
2. **Adicionar** cada login do SGA e marcar as empresas em que ele vale. Cada empresa fica num login só.
3. Abra qualquer endereço do SGA: se cair na tela de login, a extensão cobre a tela com "Entrando no SGA…" e entra
   sozinha, sem mostrar o formulário. Sem login para aquela empresa (ou travada), a tela de login aparece normal.

- **Destravar** vale até fechar o navegador (ou até clicar em **Travar**). Travada, a tela de login mostra um aviso e
  nada é preenchido.
- **Entrar sozinho** desligado: a extensão não preenche nada (o erro de cookies continua sendo resolvido).
- **Limpar cookies** apaga na hora os cookies de todos os servidores do SGA (`hinova.com.br`). As abas abertas do SGA
  saem e, ao voltar para o login, entram sozinhas.
- Se o login salvo não entrar (senha trocada), a extensão não insiste: avisa na tela e espera você corrigir.

## Segurança

- Os logins ficam em `chrome.storage.local` só cifrados (AES-GCM 256, chave derivada da senha mestra por PBKDF2-SHA256
  com 310 mil iterações e sal próprio). A senha mestra nunca é guardada.
- A chave do cofre aberto fica em `chrome.storage.session` (memória do navegador, some ao fechar) e só é lida pelo
  service worker e pela janela da extensão.
- O login só é entregue ao script das páginas `https://*.hinova.com.br/sga/*` e apenas para uma empresa conhecida da lista
  do kit (`empresasSga.js`, cópia de `ARX-Automacoes/shared/sga/`).
- Permissões: `storage`, `cookies` e o domínio `hinova.com.br`. Nenhum outro site.
- Quem usa o seu perfil do navegador com a extensão destravada entra no SGA: trave ao sair do computador.

## Arquivos

- `regras.js`: regras puras (empresa pela URL, login da empresa, erro de cookies, cofre). Testes em
  `app/test/extensao-sga.test.js` (`npm --prefix app test` no Hub).
- `background.js`: service worker (entrega o login, apaga os cookies).
- `cortina.js`: cobre a tela de login logo no começo (antes de ela aparecer).
- `conteudo.js`: roda nas páginas do SGA (entra sozinho, tira a cortina quando não vai entrar, reage ao erro de cookies).
- `icones/`: logo (`logo.svg`) e os PNGs que o Chrome pede (16, 32, 48 e 128 px).
- `popup.*`: a janela da extensão.
- `empresasSga.js` + `modulo.js`: a lista de empresas, carregada como script. É cópia de
  `ARX-Automacoes/shared/sga/empresasSga.js`: empresa nova no kit, copie para cá também.
