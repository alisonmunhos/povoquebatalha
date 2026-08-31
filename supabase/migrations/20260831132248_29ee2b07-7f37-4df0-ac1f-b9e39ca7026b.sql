alter table public.conversations
  add column if not exists archived_at timestamptz;

create index if not exists conversations_archived_idx
  on public.conversations (archived_at)
  where archived_at is null;

alter table public.conversation_events
  drop constraint if exists conversation_events_event_type_check;

alter table public.conversation_events
  add constraint conversation_events_event_type_check
  check (event_type = any (array[
    'assigned', 'unassigned', 'status_changed', 'note', 'mention', 'opened',
    'flagged', 'unflagged', 'linked_contact', 'quick_contact_created', 'archived'
  ]));