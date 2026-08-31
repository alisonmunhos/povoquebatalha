-- Etapa 2 da reforma do Inbox: campo de arquivamento de conversas (usado pelo
-- botão de opt-out + arquivar) e alinhamento do CHECK de conversation_events
-- com os event_type que o código já insere hoje.
--
-- archived_at é nullable e não recebe valor em nenhuma conversa existente —
-- toda conversa hoje na tela fica com archived_at IS NULL (equivalente a "não
-- arquivada"), então nada muda pra quem já está no Inbox: elas continuam
-- aparecendo nos mesmos filtros de sempre e passam a se classificar sozinhas
-- nos novos chips (aberta/aguardando/chat_disponivel/etc.), calculados em
-- cima das colunas que elas já têm hoje (status, last_inbound_at, flagged...),
-- sem precisar de nenhum backfill.
alter table public.conversations
  add column if not exists archived_at timestamptz;

create index if not exists conversations_archived_idx
  on public.conversations (archived_at)
  where archived_at is null;

-- communication.functions.ts já insere event_type 'linked_contact' e
-- 'quick_contact_created' (linkConversationToContact / criação rápida de
-- contato pelo Inbox) que nunca estiveram no CHECK original — esses inserts
-- são fire-and-forget sem checar erro, então isso falhava silenciosamente
-- desde que foram introduzidos (o evento nunca era gravado de verdade).
-- Aproveita esta migration pra corrigir isso também e já incluir 'archived',
-- usado pelo novo botão de opt-out + arquivar desta etapa.
alter table public.conversation_events
  drop constraint if exists conversation_events_event_type_check;

alter table public.conversation_events
  add constraint conversation_events_event_type_check
  check (event_type = any (array[
    'assigned', 'unassigned', 'status_changed', 'note', 'mention', 'opened',
    'flagged', 'unflagged', 'linked_contact', 'quick_contact_created', 'archived'
  ]));
