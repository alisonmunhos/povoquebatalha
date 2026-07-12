ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS first_message_direction text CHECK (first_message_direction IN ('in','out'));

CREATE OR REPLACE FUNCTION public.conv_sync_from_inbound()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    INSERT INTO public.conversations (contact_id, last_message_at, last_message_preview, last_message_direction, first_message_direction, unread_count, status)
    VALUES (NEW.contact_id, COALESCE(NEW.received_at, now()), left(COALESCE(NEW.conteudo,''), 200), 'in', 'in', 1, 'aberta')
    ON CONFLICT (contact_id) WHERE contact_id IS NOT NULL DO UPDATE SET
      last_message_at = EXCLUDED.last_message_at,
      last_message_preview = EXCLUDED.last_message_preview,
      last_message_direction = 'in',
      unread_count = public.conversations.unread_count + 1,
      status = CASE WHEN public.conversations.status = 'resolvida' THEN 'aberta' ELSE public.conversations.status END,
      updated_at = now();
  ELSIF NEW.from_phone IS NOT NULL THEN
    INSERT INTO public.conversations (from_phone, last_message_at, last_message_preview, last_message_direction, first_message_direction, unread_count, status)
    VALUES (NEW.from_phone, COALESCE(NEW.received_at, now()), left(COALESCE(NEW.conteudo,''), 200), 'in', 'in', 1, 'aberta')
    ON CONFLICT (from_phone) WHERE contact_id IS NULL AND from_phone IS NOT NULL DO UPDATE SET
      last_message_at = EXCLUDED.last_message_at,
      last_message_preview = EXCLUDED.last_message_preview,
      last_message_direction = 'in',
      unread_count = public.conversations.unread_count + 1,
      status = CASE WHEN public.conversations.status = 'resolvida' THEN 'aberta' ELSE public.conversations.status END,
      updated_at = now();
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.conv_sync_from_direct()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.contact_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.conversations (contact_id, last_message_at, last_message_preview, last_message_direction, first_message_direction, unread_count, status, assigned_to)
  VALUES (NEW.contact_id, COALESCE(NEW.created_at, now()), left(COALESCE(NEW.conteudo,''), 200), 'out', 'out', 0, 'aberta', NEW.sent_by)
  ON CONFLICT (contact_id) WHERE contact_id IS NOT NULL DO UPDATE SET
    last_message_at = EXCLUDED.last_message_at,
    last_message_preview = EXCLUDED.last_message_preview,
    last_message_direction = 'out',
    assigned_to = COALESCE(public.conversations.assigned_to, NEW.sent_by),
    updated_at = now();
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.conv_sync_from_automation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.contact_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM 'sent' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'sent' THEN RETURN NEW; END IF;

  INSERT INTO public.conversations
    (contact_id, last_message_at, last_message_preview, last_message_direction, first_message_direction, unread_count, status)
  VALUES
    (NEW.contact_id, COALESCE(NEW.sent_at, now()), left(COALESCE(NEW.rendered_body,''), 200), 'out', 'out', 0, 'aberta')
  ON CONFLICT (contact_id) WHERE contact_id IS NOT NULL DO UPDATE SET
    last_message_at = EXCLUDED.last_message_at,
    last_message_preview = EXCLUDED.last_message_preview,
    last_message_direction = 'out',
    updated_at = now();
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.conv_sync_from_campaign()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.contact_id IS NULL OR NEW.sent_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.sent_at IS NOT NULL THEN RETURN NEW; END IF;

  INSERT INTO public.conversations
    (contact_id, last_message_at, last_message_preview, last_message_direction, first_message_direction, unread_count, status)
  VALUES
    (NEW.contact_id, NEW.sent_at, left(COALESCE(NEW.rendered_message,''), 200), 'out', 'out', 0, 'aberta')
  ON CONFLICT (contact_id) WHERE contact_id IS NOT NULL DO UPDATE SET
    last_message_at = EXCLUDED.last_message_at,
    last_message_preview = EXCLUDED.last_message_preview,
    last_message_direction = 'out',
    updated_at = now();
  RETURN NEW;
END $function$;