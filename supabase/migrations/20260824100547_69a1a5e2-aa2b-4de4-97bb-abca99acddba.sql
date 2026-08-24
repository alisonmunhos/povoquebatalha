ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS conversations_last_inbound_at_idx
  ON public.conversations (last_inbound_at DESC NULLS LAST);

-- Backfill por contato
UPDATE public.conversations c
   SET last_inbound_at = s.last_in
  FROM (
    SELECT contact_id, MAX(received_at) AS last_in
      FROM public.inbound_messages
     WHERE contact_id IS NOT NULL
     GROUP BY contact_id
  ) s
 WHERE c.contact_id = s.contact_id;

-- Backfill por telefone (conversas sem contato vinculado)
UPDATE public.conversations c
   SET last_inbound_at = s.last_in
  FROM (
    SELECT from_phone, MAX(received_at) AS last_in
      FROM public.inbound_messages
     WHERE from_phone IS NOT NULL
     GROUP BY from_phone
  ) s
 WHERE c.contact_id IS NULL AND c.from_phone = s.from_phone;

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
      (NEW.contact_id, COALESCE(NEW.received_at, now()), LEFT(COALESCE(NEW.conteudo,''), 200), 'in', 'in', 1, 'aberta', COALESCE(NEW.received_at, now()))
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
      (NEW.from_phone, COALESCE(NEW.received_at, now()), LEFT(COALESCE(NEW.conteudo,''), 200), 'in', 'in', 1, 'aberta', COALESCE(NEW.received_at, now()))
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