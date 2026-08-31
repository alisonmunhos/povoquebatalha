-- Etapa 4, item 4.1: prévia em branco quando a última mensagem é uma reação.
-- conv_sync_from_inbound grava conversations.last_message_preview a partir
-- de NEW.conteudo — mas mensagens do tipo "reaction" não preenchem conteudo
-- (o emoji fica em reaction_emoji), então a prévia ficava vazia. Passa a
-- usar o emoji da reação quando presente, mantendo o mesmo fallback pra
-- string vazia de antes.
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

-- Etapa 4, item 4.4: coluna pra registrar os botões/lista oferecidos por uma
-- mensagem do robô de cadastro (fluxo), hoje perdidos do histórico do Inbox.
ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS buttons jsonb;
