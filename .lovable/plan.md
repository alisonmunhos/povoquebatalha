# Inbox: filtros claros, "não lidas" que somem e respostas prontas com anexo

## 1. O que significa "Abertas" (e por que confunde)

Cada conversa tem um status: **Aberta**, **Aguardando** ou **Resolvida** (o mesmo seletor que aparece no painel de informações à direita).

- **Abertas** = conversas em andamento, ainda não resolvidas e não marcadas como "aguardando".
- **Aguardando** = você já respondeu/está esperando algo da pessoa.
- **Resolvidas** = encerradas.
- **Não lidas** = têm mensagem da pessoa que ninguém abriu ainda (independente do status).

Ajustes:
- Renomear "Abertas" para **"Em aberto"** e adicionar tooltip em cada chip explicando o critério em uma frase.
- Corrigir o número do chip **Não lidas**: hoje ele mostra apenas as não lidas *atribuídas a mim* (por isso aparece 0 mesmo existindo 26 no sistema). Passará a mostrar a mesma contagem da lista filtrada, como os outros chips.

## 2. Bug: conversas antigas não perdem a marcação de "não lidas"

Causa confirmada: a marcação de leitura só acontece quando a conversa tem contato vinculado. No banco, 24 das 26 conversas não lidas **não têm contato vinculado** (mensagens recebidas antes da API oficial, sem contato correspondente). Nesses casos o app simplesmente não chama a marcação, e a função do servidor também só aceita contato — não aceita conversa.

Correção:
- A função de marcar como lida passa a aceitar **contato OU conversa**: zera o contador da conversa e marca as mensagens recebidas dela como lidas (por conversa e/ou telefone de origem, além do contato quando houver).
- Ao abrir qualquer conversa não lida, o app chama a marcação — inclusive sem contato vinculado.
- Após marcar, atualizar lista e badge para o número cair na hora.

## 3. Bug: respostas prontas não trazem a imagem anexada

Causa: a lista de respostas rápidas devolve só título e texto; os campos de anexo do modelo (arquivo/mime/nome) não são lidos. Ao escolher a resposta, só o texto entra no campo.

Correção:
- Incluir os campos de anexo na consulta das respostas rápidas.
- Ao escolher uma resposta que tenha anexo, preencher o texto **e** carregar o anexo como anexo pendente do envio (com miniatura, igual ao anexo manual), podendo ser removido antes de enviar.
- Indicar no menu, com um ícone de clipe, quais respostas prontas têm arquivo.

## Detalhes técnicos

- `src/lib/communication.functions.ts`: `markConversationRead` passa a aceitar `{ contact_id? , conversation_id? }` (pelo menos um), atualizando `conversations.unread_count = 0` e `inbound_messages.read_at` por `conversation_id`/`from_phone`/`contact_id`.
- `src/components/CommunicationInbox.tsx`: `openConversation` chama a marcação para conversas sem contato; contagem do chip "Não lidas" derivada de `rawList`; rótulo/tooltips dos chips; estado do anexo preenchido a partir da resposta rápida.
- `src/lib/inbox.functions.ts`: `listQuickReplies` também retorna `media_path`, `media_mime`, `media_filename`. O envio (`sendDirectMessage`) já aceita esses campos — sem mudança no motor de envio.
- Sem migrations; nenhum dado é apagado.
