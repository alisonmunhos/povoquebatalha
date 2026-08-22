# Chat completo no Inbox: reações, mídias, respostas e recibos

## Por que essa mensagem da Aline aparece vazia (confirmado no banco)

A mensagem de 21/08 às 18:32 não é texto: é uma **reação** (❤️) ao disparo da campanha. O sistema salvou o evento, mas:

- reação não tem texto nem mídia, então a bolha aparece em branco;
- a reação deveria aparecer colada na mensagem reagida, como no WhatsApp — não como mensagem separada.

No total hoje: 2 reações e 89 eventos antigos (reações, entrada em grupo, avisos) salvos sem conteúdo visível.

## Problema mais grave descoberto agora

Depois da migração para a API oficial do WhatsApp, **nenhuma mídia recebida é baixada**. Imagens, áudios, vídeos e documentos que chegarem hoje entram no histórico sem arquivo (a API oficial manda apenas um ID que precisa ser baixado, e isso não é feito). Ou seja: se alguém mandar um áudio ou foto agora, a conversa mostra bolha vazia.

## O que vou fazer

1. **Reações**: exibir como no WhatsApp — o emoji fica preso na bolha da mensagem reagida, não gera bolha vazia.
2. **Mídia recebida pela API oficial**: baixar o arquivo no momento em que a mensagem chega, guardar no armazenamento privado do app e exibir na conversa (foto, vídeo com player, áudio com player, documento com download e nome/tamanho).
3. **Tipos que hoje somem**: figurinha (sticker), localização (mapa com link), contato compartilhado (vCard), resposta a botão/lista e mensagem com legenda passam a ser renderizados com aparência própria.
4. **Resposta citada (reply)**: quando a pessoa responde uma mensagem específica, mostrar o trecho citado acima da bolha, como no WhatsApp.
5. **Eventos que não são conversa** (entrou no grupo, aviso de sistema, chamada perdida): sair da lista de bolhas e virar linha discreta de sistema, ou ficar ocultos — nunca bolha vazia.
6. **Recibos de entrega**: mostrar os tiquinhos (enviado / entregue / lido) nas mensagens enviadas, com base nos eventos que já recebemos.
7. **Higiene do histórico**: retroativamente reclassificar os 89 eventos antigos sem conteúdo (reação / aviso de grupo / etc.) usando o conteúdo bruto já guardado, para o histórico antigo também ficar coerente. Nada é apagado.

Ficam fora desta etapa (posso fazer depois): enviar áudio gravado pelo app, enviar figurinha, reagir com emoji a partir do app, e busca dentro da conversa.

## Detalhes técnicos

- `src/routes/api/public/whatsapp-cloud/webhook.ts`: tratar `message.type` completo (`image|video|audio|document|sticker|location|contacts|button|interactive|reaction|system`); para mídia, chamar Graph API `/{media-id}` → baixar binário com o token → subir em bucket privado novo `inbox-media` → gravar `media_path/mime/filename/size`; gravar `reply_to_message_id` (de `message.context.id`) e, para reação, `reaction_to_message_id` + emoji.
- `src/routes/api/public/zapi/$evento.ts`: mesmo mapeamento para os tipos que faltam (sticker, location, contacts, reaction, button reply), reaproveitando `pickMedia`.
- Migration: colunas novas em `inbound_messages` (`media_path`, `reaction_emoji`, `reaction_target_id`, `reply_to_wa_id`, `wa_message_id`, `is_system_event`), índices, bucket privado `inbox-media` + policies; backfill dos 89 registros a partir de `payload` (apenas classificação, sem exclusão). GRANTs mantidos como nas políticas atuais (staff ou `profiles.inbox_access`).
- `src/lib/communication.functions.ts` (`getConversation`): retornar os campos novos e URLs assinadas de `inbox-media`; agrupar reações por mensagem-alvo antes de devolver a timeline.
- `src/components/CommunicationInbox.tsx`: novos renderizadores de bolha (`InboundMedia` estendido para vídeo/sticker, `LocationBubble`, `VCardBubble`, `QuotedPreview`, chip de reação, tiquinhos de status) e filtro de eventos de sistema.
