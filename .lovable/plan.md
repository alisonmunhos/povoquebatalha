# Excluir mensagem, reagir com emoji e emojis modernos no Inbox

## Ponto importante antes de começar (limitação da Meta)

Hoje o envio de mensagens usa a API oficial do WhatsApp (Meta). Essa API **não tem** recurso de "apagar para todos": não existe endpoint que remova uma mensagem já entregue do celular do contato. Ou seja, não é tecnicamente possível excluir a mensagem da conversa do contato.

Reagir com emoji, ao contrário, **é suportado** pela API oficial: a reação aparece de verdade no WhatsApp do contato, colada na mensagem, igual ao app.

Então o que vou entregar:

- **Excluir mensagem**: exclusão no histórico do Inbox ("apagar para mim"), com aviso claro na confirmação de que a mensagem continua no celular do contato. Nada é apagado de forma definitiva do banco — a mensagem fica marcada como excluída, sai da conversa e da prévia da lista, e o registro permanece para auditoria.
- **Reagir com emoji**: reação real, enviada ao WhatsApp do contato e mostrada na bolha do Inbox (podendo trocar ou remover a reação).

## O que muda na tela

1. **Menu de ações na bolha** (aparece ao passar o mouse no desktop e ao pressionar e segurar no celular):
   - Responder (já existe)
   - Copiar texto (já existe)
   - Reagir (abre uma barra com 👍 ❤️ 😂 😮 😢 🙏 + botão "mais" que abre o seletor completo)
   - Excluir mensagem
2. **Reagir**: a reação escolhida aparece imediatamente na bolha; se der erro no envio, volta ao estado anterior e mostra aviso. Clicar na mesma reação remove.
3. **Excluir**: caixa de confirmação em português explicando que a mensagem sai só do histórico do sistema e continua no celular do contato. Após confirmar, a bolha desaparece da conversa.
   - Regra de permissão: quem enviou, quem está atribuído à conversa e administradores podem excluir.
   - Reação só é possível em mensagens dentro da janela de 24h (fora dela a Meta rejeita); o botão fica desabilitado com explicação.

## Emojis modernos com tons de pele

Os dois seletores passam a usar a base de emojis mais nova disponível na biblioteca, com **seletor de tom de pele** visível e memória da escolha (fica salva no navegador):

- Seletor do Inbox (composer da conversa) — hoje já existe, ganha tons de pele, busca ativada (hoje está desligada) e categorias.
- Tela de criar mensagens / respostas prontas — hoje só tem 13 emojis fixos; passa a ter o mesmo seletor completo, mantendo os atalhos rápidos.
- O seletor completo é reaproveitado também na barra de reação.

## Detalhes técnicos

- Migration: em `direct_messages` e `inbound_messages`, colunas `deleted_at` e `deleted_by`; em `direct_messages`, colunas para reação enviada por nós (`reaction_emoji`, `reaction_target_wa_id`) quando a reação for registrada como saída. Índices e políticas mantidas no padrão atual (staff ou `profiles.inbox_access`).
- `src/lib/communication.functions.ts`: filtrar `deleted_at is null` nas leituras de conversa/prévia; novas server functions `deleteInboxMessage` e `reactToInboxMessage` com `requireSupabaseAuth` + checagem de permissão; agrupar reações de saída junto das de entrada na timeline.
- `src/lib/wa-send.server.ts` / `src/integrations/whatsapp-cloud/client.server.ts`: envio `type: "reaction"` (`message_id` + `emoji`, emoji vazio remove) usando `wa_message_id`/`message_id` já gravados.
- `src/components/inbox/MessageBubble.tsx`: novo componente `MessageActions` (menu + barra de reação), long-press no mobile, exibição das reações próprias.
- `src/components/CommunicationInbox.tsx` e `src/components/MessageComposer.tsx`: novo `EmojiPickerPopover` compartilhado em `src/components/inbox/EmojiPickerPopover.tsx` com `emojiVersion` atual, `SkinTonePickerLocation.PREVIEW`, tom persistido em `localStorage` e busca habilitada.
- `src/lib/inbox-timeline.ts`: campo `deleted` e `myReaction` no tipo `InboxMsg`.
