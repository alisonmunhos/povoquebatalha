# Conversas que abrem "sem mensagens": incluir mensagens automáticas no histórico

## O que está acontecendo (confirmado no banco)

A conversa de Lucas Rafael Lima existe, tem prévia ("Olá Lusca, tudo bem? Recebemos suas informações...") e a mensagem foi enviada por uma **automação**. Mas ao abrir a conversa o histórico busca apenas:

- mensagens recebidas (inbound),
- mensagens avulsas enviadas do Inbox,
- envios de campanha.

Mensagens enviadas por **automação** não são buscadas em lugar nenhum — por isso a conversa aparece vazia.

Não é caso isolado: de 260 conversas, **52 têm mensagens de automação** e **16 abrem completamente vazias** hoje (só têm mensagem de automação, como a do Lucas). Nas outras 36 o histórico aparece incompleto (falta a mensagem automática no meio da conversa).

## Correção

1. Ao abrir uma conversa, buscar também os envios de automação do contato e mostrá-los na linha do tempo como mensagens enviadas (bolha verde à direita), com:
   - texto renderizado da mensagem,
   - data/hora do envio,
   - etiqueta "Automação" + nome da automação,
   - indicação de erro quando o envio falhou.
2. Ordenar tudo junto por data (recebidas, avulsas, campanha e automação), para o histórico ficar cronológico e completo.
3. Estado vazio só aparece quando realmente não há nenhuma mensagem de nenhuma origem.

## Acesso

A leitura dos envios de automação hoje é permitida apenas para equipe (staff). Usuários liberados só pela flag de acesso ao Inbox continuariam vendo a conversa vazia. Vou ajustar a permissão de leitura para incluir também quem tem acesso ao Inbox, mantendo escrita restrita a administradores.

## Detalhes técnicos

- `src/lib/communication.functions.ts` (`getConversation`): nova consulta a `automation_deliveries` (`id, rendered_body, sent_at, created_at, status, error, automations:automation_id(nome)`) filtrada por `contact_id`, retornada como `automation[]`.
- `src/components/CommunicationInbox.tsx`: incluir `automation` na montagem/ordenação da timeline e renderizar bolha de saída com badge "Automação".
- Migration pequena: política `SELECT` de `automation_deliveries` passa a aceitar staff **ou** `profiles.inbox_access = true`; nenhum dado é alterado ou apagado.
