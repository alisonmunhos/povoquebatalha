# Consertar o Inbox de Comunicação

## Diagnóstico

Investiguei o banco e o código do Inbox. Encontrei **três causas** somadas:

1. **A tabela `conversations` está vazia (0 linhas).** O Inbox (`/comunicacao/inbox`) lê dessa tabela — por isso nada aparece, nem o Faylon, nem ninguém.
2. **As funções que deveriam alimentar `conversations` existem, mas nunca foram ligadas como gatilhos.** `conv_sync_from_inbound` e `conv_sync_from_direct` estão criadas no banco, mas sem `CREATE TRIGGER`. Resultado: quando chega uma mensagem inbound ou o operador envia uma direta, `conversations` não é atualizada.
3. **A busca acha o contato, mas clicar não abre o chat.** No componente `CommunicationInbox`, o painel da direita usa `selected = list.find(c => c.contact_id === selectedContactId)`. Se o contato não está na lista de conversas (caso do Faylon, que só recebeu a mensagem de confirmação e ainda não respondeu no WhatsApp), `selected` fica `null` e o painel mostra "Selecione uma conversa".

Além disso, a mensagem de **confirmação enviada** ao Faylon vai por `automation_deliveries` — hoje isso não cria conversa nenhuma. Para ficar igual ao WhatsApp Web, toda saída (direta, campanha ou automação) precisa abrir/atualizar a conversa.

## Escopo da correção

### 1. Banco — ligar triggers e cobrir todas as fontes de mensagem

Migração nova com:

- `CREATE TRIGGER trg_conv_from_inbound AFTER INSERT ON inbound_messages FOR EACH ROW EXECUTE FUNCTION conv_sync_from_inbound();`
- `CREATE TRIGGER trg_conv_from_direct AFTER INSERT ON direct_messages FOR EACH ROW EXECUTE FUNCTION conv_sync_from_direct();`
- Nova função `conv_sync_from_automation()` + trigger em `automation_deliveries` (dispara quando `status` vira `sent`), para que as mensagens automáticas (boas-vindas, confirmação de recadastro) também apareçam.
- Nova função `conv_sync_from_campaign()` + trigger em `campaign_recipients` (dispara quando `sent_at` deixa de ser NULL), para envios em massa.

Todas usam `INSERT ... ON CONFLICT (contact_id) DO UPDATE`.

### 2. Backfill — trazer o histórico já existente

Na mesma migração, popular `conversations` a partir do que já existe hoje:

- Para cada `contact_id` distinto em `inbound_messages`, `direct_messages`, `campaign_recipients` (com `sent_at`) e `automation_deliveries` (com `status='sent'`), criar/atualizar a linha em `conversations` com o `last_message_at`, `last_message_preview` e `last_message_direction` da mensagem mais recente.
- Isso faz o Faylon (que recebeu a confirmação via automação) aparecer imediatamente no Inbox.

### 3. UI — abrir chat de qualquer contato, estilo WhatsApp Web

Alterações em `src/components/CommunicationInbox.tsx`:

- Deixar de depender de `selected` (que vinha só da lista de conversas). O painel da direita passa a ser controlado por `convQ.data?.contact` — se o contato foi carregado, mostra o chat, mesmo sem `conversations` ainda.
- Cabeçalho, `canSend` e o input passam a ler `contact` e `phone_whatsapp_candidate ?? phone_e164` do `convQ.data`.
- Ao clicar em um resultado de "Iniciar nova conversa", chamar `openConversation(contactId, 0)` como já faz — mas o painel agora renderiza corretamente porque não exige linha em `conversations`.
- Após o primeiro envio, o trigger de `direct_messages` cria a linha em `conversations` e o Realtime já invalida a lista.
- Ajustar a busca da lista: hoje `listConversations` só olha `conversations`. Quando o usuário digita ≥ 2 caracteres, o bloco "Iniciar nova conversa" (que já existe) resolve o resto usando `searchContactsForNewChat`. Manter esse comportamento, só garantindo que ele apareça **sempre** que houver resultados novos, mesmo quando a lista principal também tem algo.

### 4. Verificação

Depois de aplicar:

- Confirmar via `read_query` que `conversations` foi populado (Faylon deve estar lá).
- Abrir `/comunicacao/inbox`, buscar "faylon", clicar e ver o chat abrindo com a mensagem de confirmação já no histórico.
- Enviar uma mensagem de teste pelo próprio Inbox para checar que o `direct_messages` cria/atualiza a `conversations` e a lista reordena.

## Fora do escopo (não vou mexer agora)

- Redesign visual do Inbox — só as correções necessárias para o clique abrir o chat.
- Anexos no Inbox (o botão já está desabilitado como "em breve").
- Notas internas / atribuição — já funcionam quando a conversa existe.

## Detalhes técnicos

- Todas as funções `conv_sync_*` são `SECURITY DEFINER` para escrever em `conversations` mesmo quando o INSERT original veio via `supabaseAdmin` (webhook) ou via RLS de operador.
- `automation_deliveries` só conta como "saída visível" quando `status = 'sent'` e há `contact_id`. A função ignora entregas em `queued`/`erro` para não poluir a lista.
- `campaign_recipients` idem: só quando `sent_at IS NOT NULL`.
- O trigger de `direct_messages` já mantém `assigned_to = COALESCE(existing, sent_by)`, então o operador que responder "assume" a conversa automaticamente.
- A UI não muda o contrato dos server functions — só reorganiza a fonte da verdade do painel direito.
