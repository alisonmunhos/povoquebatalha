# Reagir com emoji e emojis modernos no Inbox

A opção de excluir mensagem foi descartada: como a API oficial do WhatsApp não permite apagar a mensagem do celular do contato, não faz sentido oferecer uma exclusão só local. Nada de exclusão, nem no banco nem na tela.

O que fica:

## Reagir com emoji (reação de verdade)

- Nova opção **Reagir** no menu da bolha (passar o mouse no desktop; pressionar e segurar no celular).
- Abre uma barra com reações rápidas 👍 ❤️ 😂 😮 😢 🙏 + botão "mais" com o seletor completo.
- A reação é enviada pela API oficial e aparece no WhatsApp do contato, colada na mensagem — igual ao app.
- No Inbox, a reação aparece imediatamente na bolha; se o envio falhar, volta ao estado anterior com aviso.
- Clicar na mesma reação novamente remove (a Meta trata emoji vazio como remoção); escolher outro emoji troca a reação.
- Só funciona em mensagens dentro da janela de 24h (fora dela a Meta rejeita); nesse caso o botão fica desabilitado com explicação.

## Emojis modernos com tons de pele

Os dois seletores passam a usar a base de emojis mais nova da biblioteca, com **seletor de tom de pele** visível e memória da escolha (salva no navegador):

- Seletor do Inbox (composer da conversa) — hoje já existe; ganha tons de pele, busca ativada (hoje está desligada) e categorias.
- Tela de criar mensagens / respostas prontas — hoje só tem 13 emojis fixos; passa a ter o mesmo seletor completo, mantendo os atalhos rápidos.
- O seletor completo é reaproveitado na barra de reação.

## Detalhes técnicos

- Migration: em `direct_messages`, colunas `reaction_emoji` e `reaction_target_wa_id` (para registrar a reação enviada por nós). Índices e políticas mantidas no padrão atual (staff ou `profiles.inbox_access`). Nenhuma coluna de exclusão.
- `src/lib/wa-send.server.ts` / `src/integrations/whatsapp-cloud/client.server.ts`: envio `type: "reaction"` (`message_id` + `emoji`, emoji vazio remove) usando `wa_message_id`/`message_id` já gravados na mensagem original.
- `src/lib/communication.functions.ts`: nova server function `reactToInboxMessage` com `requireSupabaseAuth`; agrupar reações de saída junto das de entrada na timeline (campo `myReaction` em `InboxMsg`, em `src/lib/inbox-timeline.ts`).
- `src/components/inbox/MessageBubble.tsx`: novo `MessageActions` (menu + barra de reação) e long-press no mobile.
- `src/components/CommunicationInbox.tsx` e `src/components/MessageComposer.tsx`: novo `EmojiPickerPopover` compartilhado em `src/components/inbox/EmojiPickerPopover.tsx`, com `emojiVersion` atual, `SkinTonePickerLocation.PREVIEW`, tom persistido em `localStorage` e busca habilitada.
