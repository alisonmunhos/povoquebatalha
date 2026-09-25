CREATE OR REPLACE FUNCTION public.conv_sync_from_inbound()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    INSERT INTO public.conversations
      (contact_id, last_message_at, last_message_preview, last_message_direction, first_message_direction, unread_count, status, last_inbound_at)
    VALUES
      (NEW.contact_id, COALESCE(NEW.received_at, now()), LEFT(COALESCE(NEW.reaction_emoji, NEW.conteudo, ''), 200), 'in', 'in', 1, 'aberta', COALESCE(NEW.received_at, now()))
    ON CONFLICT (contact_id) WHERE contact_id IS NOT NULL DO UPDATE SET
      last_message_at = EXCLUDED.last_message_at,
      last_message_preview = EXCLUDED.last_message_preview,
      last_message_direction = 'in',
      last_inbound_at = GREATEST(COALESCE(public.conversations.last_inbound_at, EXCLUDED.last_inbound_at), EXCLUDED.last_inbound_at),
      status = CASE WHEN public.conversations.status = 'resolvida' THEN 'aberta' ELSE public.conversations.status END,
      updated_at = now();

    PERFORM public.recalc_conversation_unread(NEW.contact_id, NULL);

  ELSIF NEW.from_phone IS NOT NULL THEN
    INSERT INTO public.conversations
      (from_phone, last_message_at, last_message_preview, last_message_direction, first_message_direction, unread_count, status, last_inbound_at)
    VALUES
      (NEW.from_phone, COALESCE(NEW.received_at, now()), LEFT(COALESCE(NEW.reaction_emoji, NEW.conteudo, ''), 200), 'in', 'in', 1, 'aberta', COALESCE(NEW.received_at, now()))
    ON CONFLICT (from_phone) WHERE contact_id IS NULL AND from_phone IS NOT NULL DO UPDATE SET
      last_message_at = EXCLUDED.last_message_at,
      last_message_preview = EXCLUDED.last_message_preview,
      last_message_direction = 'in',
      last_inbound_at = GREATEST(COALESCE(public.conversations.last_inbound_at, EXCLUDED.last_inbound_at), EXCLUDED.last_inbound_at),
      status = CASE WHEN public.conversations.status = 'resolvida' THEN 'aberta' ELSE public.conversations.status END,
      updated_at = now();

    PERFORM public.recalc_conversation_unread(NULL, NEW.from_phone);
  END IF;
  RETURN NEW;
END;
$function$;

ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS buttons jsonb;
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS header_type text;
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS header_text text;

create table if not exists public.inbox_tag_pins (
  tag_id uuid primary key references public.tags(id) on delete cascade,
  pinned_by uuid not null references auth.users(id),
  pinned_at timestamptz not null default now()
);

grant select, insert, delete on public.inbox_tag_pins to authenticated;
grant all on public.inbox_tag_pins to service_role;

alter table public.inbox_tag_pins enable row level security;

drop policy if exists "inbox_tag_pins staff manage" on public.inbox_tag_pins;
create policy "inbox_tag_pins staff manage" on public.inbox_tag_pins
  for all to authenticated
  using (private.is_staff(auth.uid()))
  with check (private.is_staff(auth.uid()));