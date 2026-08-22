-- 1. Vincula mensagens órfãs ao contato correto (match único por últimos 8 dígitos)
WITH candidates AS (
  SELECT m.id AS message_id,
         c.id AS contact_id,
         c.phone_e164,
         ROW_NUMBER() OVER (PARTITION BY m.id ORDER BY c.created_at ASC) AS rn
    FROM public.inbound_messages m
    JOIN public.contacts c
      ON public.phone_last8(c.phone_e164) = public.phone_last8(m.from_phone)
   WHERE m.contact_id IS NULL
     AND m.from_phone IS NOT NULL
)
UPDATE public.inbound_messages im
   SET contact_id = c.contact_id
  FROM candidates c
 WHERE im.id = c.message_id
   AND c.rn = 1
   AND NOT EXISTS (
     SELECT 1 FROM candidates c2
      WHERE c2.message_id = c.message_id AND c2.rn = 2
   );

-- 2. Log de auditoria das vinculações
INSERT INTO public.contact_audit_log (contact_id, action, changes)
SELECT DISTINCT im.contact_id,
       'vinculacao_inbound',
       jsonb_build_object(
         'message_id', im.id,
         'from_phone', im.from_phone,
         'matched_phone', c.phone_e164,
         'received_at', im.received_at
       )
  FROM public.inbound_messages im
  JOIN public.contacts c ON c.id = im.contact_id
 WHERE im.contact_id IS NOT NULL
   AND im.from_phone IS NOT NULL
   AND public.phone_last8(im.from_phone) = public.phone_last8(c.phone_e164)
   AND NOT EXISTS (
     SELECT 1 FROM public.contact_audit_log cal
      WHERE cal.contact_id = im.contact_id
        AND cal.action = 'vinculacao_inbound'
        AND (cal.changes->>'message_id')::uuid = im.id
   );

-- 3. Remove conversas duplicadas: quando existe uma conversa pelo contato e outra pelo telefone,
--    mantém a conversa do contato e remove a do telefone.
WITH phone_convs AS (
  SELECT id, from_phone FROM public.conversations WHERE contact_id IS NULL AND from_phone IS NOT NULL
),
contact_convs AS (
  SELECT c.id AS conv_id, ct.id AS contact_id, ct.phone_e164
    FROM public.conversations c
    JOIN public.contacts ct ON ct.id = c.contact_id
   WHERE c.contact_id IS NOT NULL
),
merge_pairs AS (
  SELECT pc.id AS old_conv_id, cc.conv_id AS keep_conv_id, cc.contact_id
    FROM phone_convs pc
    JOIN contact_convs cc ON public.phone_last8(pc.from_phone) = public.phone_last8(cc.phone_e164)
)
DELETE FROM public.conversations conv
 USING merge_pairs mp
 WHERE conv.id = mp.old_conv_id;

-- 4. Recalcula unread_count e last_message_at para todas as conversas com contact_id
UPDATE public.conversations c
   SET unread_count = COALESCE(m.unread, 0),
       last_message_at = m.last_at,
       last_message_preview = LEFT(COALESCE(m.preview, ''), 200),
       last_message_direction = 'in'
  FROM (
    SELECT contact_id,
           COUNT(*) FILTER (WHERE read_at IS NULL) AS unread,
           MAX(received_at) AS last_at,
           (ARRAY_AGG(conteudo ORDER BY received_at DESC))[1] AS preview
      FROM public.inbound_messages
     WHERE contact_id IS NOT NULL
     GROUP BY contact_id
  ) m
 WHERE c.contact_id = m.contact_id;

-- 5. Recalcula conversas sem contato (pelo from_phone)
UPDATE public.conversations c
   SET unread_count = COALESCE(m.unread, 0),
       last_message_at = m.last_at,
       last_message_preview = LEFT(COALESCE(m.preview, ''), 200),
       last_message_direction = 'in'
  FROM (
    SELECT from_phone,
           COUNT(*) FILTER (WHERE read_at IS NULL) AS unread,
           MAX(received_at) AS last_at,
           (ARRAY_AGG(conteudo ORDER BY received_at DESC))[1] AS preview
      FROM public.inbound_messages
     WHERE contact_id IS NULL AND from_phone IS NOT NULL
     GROUP BY from_phone
  ) m
 WHERE c.contact_id IS NULL AND c.from_phone = m.from_phone;

-- 6. Função para recalcular contador de não lidas de uma conversa
CREATE OR REPLACE FUNCTION public.recalc_conversation_unread(p_contact_id uuid DEFAULT NULL, p_from_phone text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unread int;
  v_last_at timestamptz;
  v_preview text;
BEGIN
  IF p_contact_id IS NOT NULL THEN
    SELECT COUNT(*) FILTER (WHERE read_at IS NULL),
           MAX(received_at),
           LEFT((ARRAY_AGG(conteudo ORDER BY received_at DESC))[1], 200)
      INTO v_unread, v_last_at, v_preview
      FROM public.inbound_messages
     WHERE contact_id = p_contact_id;

    UPDATE public.conversations
       SET unread_count = COALESCE(v_unread, 0),
           last_message_at = COALESCE(v_last_at, last_message_at),
           last_message_preview = COALESCE(v_preview, last_message_preview)
     WHERE contact_id = p_contact_id;
  ELSIF p_from_phone IS NOT NULL THEN
    SELECT COUNT(*) FILTER (WHERE read_at IS NULL),
           MAX(received_at),
           LEFT((ARRAY_AGG(conteudo ORDER BY received_at DESC))[1], 200)
      INTO v_unread, v_last_at, v_preview
      FROM public.inbound_messages
     WHERE contact_id IS NULL AND from_phone = p_from_phone;

    UPDATE public.conversations
       SET unread_count = COALESCE(v_unread, 0),
           last_message_at = COALESCE(v_last_at, last_message_at),
           last_message_preview = COALESCE(v_preview, last_message_preview)
     WHERE contact_id IS NULL AND from_phone = p_from_phone;
  END IF;
END;
$$;

-- 7. Trigger que usa recalc_conversation_unread para manter contador coerente
CREATE OR REPLACE FUNCTION public.conv_sync_from_inbound()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    INSERT INTO public.conversations
      (contact_id, last_message_at, last_message_preview, last_message_direction, first_message_direction, unread_count, status)
    VALUES
      (NEW.contact_id, COALESCE(NEW.received_at, now()), LEFT(COALESCE(NEW.conteudo,''), 200), 'in', 'in', 1, 'aberta')
    ON CONFLICT (contact_id) WHERE contact_id IS NOT NULL DO UPDATE SET
      last_message_at = EXCLUDED.last_message_at,
      last_message_preview = EXCLUDED.last_message_preview,
      last_message_direction = 'in',
      status = CASE WHEN public.conversations.status = 'resolvida' THEN 'aberta' ELSE public.conversations.status END,
      updated_at = now();

    PERFORM public.recalc_conversation_unread(NEW.contact_id, NULL);

  ELSIF NEW.from_phone IS NOT NULL THEN
    INSERT INTO public.conversations
      (from_phone, last_message_at, last_message_preview, last_message_direction, first_message_direction, unread_count, status)
    VALUES
      (NEW.from_phone, COALESCE(NEW.received_at, now()), LEFT(COALESCE(NEW.conteudo,''), 200), 'in', 'in', 1, 'aberta')
    ON CONFLICT (from_phone) WHERE contact_id IS NULL AND from_phone IS NOT NULL DO UPDATE SET
      last_message_at = EXCLUDED.last_message_at,
      last_message_preview = EXCLUDED.last_message_preview,
      last_message_direction = 'in',
      status = CASE WHEN public.conversations.status = 'resolvida' THEN 'aberta' ELSE public.conversations.status END,
      updated_at = now();

    PERFORM public.recalc_conversation_unread(NULL, NEW.from_phone);
  END IF;
  RETURN NEW;
END;
$$;

-- 8. Trigger para marcar como aberta quando chega resposta inbound em conversa aguardando
CREATE OR REPLACE FUNCTION public.conv_open_on_inbound()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    UPDATE public.conversations
       SET status = 'aberta'
     WHERE contact_id = NEW.contact_id AND status = 'aguardando';
  ELSIF NEW.from_phone IS NOT NULL THEN
    UPDATE public.conversations
       SET status = 'aberta'
     WHERE contact_id IS NULL AND from_phone = NEW.from_phone AND status = 'aguardando';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conv_open_on_inbound ON public.inbound_messages;
CREATE TRIGGER trg_conv_open_on_inbound
AFTER INSERT ON public.inbound_messages
FOR EACH ROW
EXECUTE FUNCTION public.conv_open_on_inbound();

-- 9. Trigger para marcar como aguardando quando enviamos resposta
CREATE OR REPLACE FUNCTION public.conv_set_aguardando_on_direct()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL AND NEW.origem = 'inbox' THEN
    UPDATE public.conversations
       SET status = 'aguardando'
     WHERE contact_id = NEW.contact_id AND status = 'aberta';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conv_set_aguardando_on_direct ON public.direct_messages;
CREATE TRIGGER trg_conv_set_aguardando_on_direct
AFTER INSERT ON public.direct_messages
FOR EACH ROW
EXECUTE FUNCTION public.conv_set_aguardando_on_direct();

GRANT EXECUTE ON FUNCTION public.recalc_conversation_unread(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_conversation_unread(uuid, text) TO service_role;