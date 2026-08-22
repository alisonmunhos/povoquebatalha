# Deixar o envio manual do fluxo fácil de achar

Os dois botões de disparo manual já existem no cartão de cada fluxo em **Cadastro pelo WhatsApp** (`/fluxos-whatsapp`), mas ficam numa linha única no topo do cartão, junto do liga/desliga, de "Editar" e "Excluir". Em tela estreita (o caso do seu acesso, ~680px) essa linha não quebra: os botões saem para fora da área visível do cartão, então na prática eles desaparecem.

## O que vai mudar

- Uma **barra de ações própria**, abaixo do nome do fluxo, que quebra em várias linhas e nunca sai da tela.
- Ação principal em destaque: **"Enviar agora para quem falou nas últimas 24h"**, com ícone e ocupando a largura toda no celular.
- Ação secundária: **"Testar em um número"** (era "Testar no meu WhatsApp"), com o mesmo comportamento de hoje.
- "Editar", "Duplicar"/"Excluir" e o liga/desliga passam para uma linha discreta, separados das ações de envio.
- Uma linha curta de ajuda no topo da tela: como disparar manualmente e o lembrete da janela de 24h.
- Quando o fluxo está **desligado**, o botão de envio continua funcionando (o disparo manual não depende do gatilho), mas mostra um aviso curto explicando isso.

## Detalhes técnicos

- Só `src/routes/_authenticated/fluxos-whatsapp.tsx`: reorganizar o `CardHeader`/`CardContent` do cartão do fluxo em duas áreas (identificação + ações), usando `flex-wrap` e `w-full sm:w-auto` nos botões.
- Nenhuma mudança em `FlowSendDialog.tsx`, nas funções de servidor (`listFlowEligibleRecipients`, `startWhatsappFlowForMany`, `startWhatsappFlowManually`) nem no banco.

## Cuidados

- Comportamento de envio segue igual: só aparece quem escreveu nas últimas 24h e quem já está respondendo vem desmarcado.
