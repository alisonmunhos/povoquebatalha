
-- 1) Triggers para inbound e direct (funções já existem)
DROP TRIGGER IF EXISTS trg_conv_from_inbound ON public.inbound_messages;
CREATE TRIGGER trg_conv_from_inbound
AFTER INSERT ON public.inbound_messages
FOR EACH ROW EXECUTE FUNCTION public.conv_sync_from_inbound();

DROP TRIGGER IF EXISTS trg_conv_from_direct ON public.direct_messages;
CREATE TRIGGER trg_conv_from_direct
AFTER INSERT ON public.direct_messages
FOR EACH ROW EXECUTE FUNCTION public.conv_sync_from_direct();

-- 2) Função + trigger para automation_deliveries (dispara quando vira 'sent')
CREATE OR REPLACE FUNCTION public.conv_sync_from_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.contact_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM 'sent' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'sent' THEN RETURN NEW; END IF;

  INSERT INTO public.conversations
    (contact_id, last_message_at, last_message_preview, last_message_direction, unread_count, status)
  VALUES
    (NEW.contact_id, COALESCE(NEW.sent_at, now()), left(COALESCE(NEW.rendered_body,''), 200), 'out', 0, 'aberta')
  ON CONFLICT (contact_id) DO UPDATE SET
    last_message_at = EXCLUDED.last_message_at,
    last_message_preview = EXCLUDED.last_message_preview,
    last_message_direction = 'out',
    updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_conv_from_automation_ins ON public.automation_deliveries;
CREATE TRIGGER trg_conv_from_automation_ins
AFTER INSERT ON public.automation_deliveries
FOR EACH ROW EXECUTE FUNCTION public.conv_sync_from_automation();

DROP TRIGGER IF EXISTS trg_conv_from_automation_upd ON public.automation_deliveries;
CREATE TRIGGER trg_conv_from_automation_upd
AFTER UPDATE OF status ON public.automation_deliveries
FOR EACH ROW EXECUTE FUNCTION public.conv_sync_from_automation();

-- 3) Função + trigger para campaign_recipients (dispara quando ganha sent_at)
CREATE OR REPLACE FUNCTION public.conv_sync_from_campaign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.contact_id IS NULL OR NEW.sent_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.sent_at IS NOT NULL THEN RETURN NEW; END IF;

  INSERT INTO public.conversations
    (contact_id, last_message_at, last_message_preview, last_message_direction, unread_count, status)
  VALUES
    (NEW.contact_id, NEW.sent_at, left(COALESCE(NEW.rendered_message,''), 200), 'out', 0, 'aberta')
  ON CONFLICT (contact_id) DO UPDATE SET
    last_message_at = EXCLUDED.last_message_at,
    last_message_preview = EXCLUDED.last_message_preview,
    last_message_direction = 'out',
    updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_conv_from_campaign_ins ON public.campaign_recipients;
CREATE TRIGGER trg_conv_from_campaign_ins
AFTER INSERT ON public.campaign_recipients
FOR EACH ROW EXECUTE FUNCTION public.conv_sync_from_campaign();

DROP TRIGGER IF EXISTS trg_conv_from_campaign_upd ON public.campaign_recipients;
CREATE TRIGGER trg_conv_from_campaign_upd
AFTER UPDATE OF sent_at ON public.campaign_recipients
FOR EACH ROW EXECUTE FUNCTION public.conv_sync_from_campaign();

-- 4) Backfill: consolidar a mensagem mais recente de cada contato
WITH events AS (
  SELECT contact_id, received_at AS at, LEFT(COALESCE(conteudo,''),200) AS preview, 'in'::text AS dir, 1 AS unread
    FROM public.inbound_messages WHERE contact_id IS NOT NULL
  UNION ALL
  SELECT contact_id, created_at, LEFT(COALESCE(conteudo,''),200), 'out', 0
    FROM public.direct_messages WHERE contact_id IS NOT NULL
  UNION ALL
  SELECT contact_id, COALESCE(sent_at, created_at), LEFT(COALESCE(rendered_body,''),200), 'out', 0
    FROM public.automation_deliveries WHERE contact_id IS NOT NULL AND status = 'sent'
  UNION ALL
  SELECT contact_id, sent_at, LEFT(COALESCE(rendered_message,''),200), 'out', 0
    FROM public.campaign_recipients WHERE contact_id IS NOT NULL AND sent_at IS NOT NULL
),
latest AS (
  SELECT DISTINCT ON (contact_id) contact_id, at, preview, dir
  FROM events
  WHERE at IS NOT NULL
  ORDER BY contact_id, at DESC
),
unread AS (
  SELECT contact_id, COUNT(*)::int AS n
    FROM public.inbound_messages
   WHERE contact_id IS NOT NULL AND read_at IS NULL
   GROUP BY contact_id
)
INSERT INTO public.conversations
  (contact_id, last_message_at, last_message_preview, last_message_direction, unread_count, status)
SELECT l.contact_id, l.at, l.preview, l.dir, COALESCE(u.n, 0), 'aberta'
FROM latest l
LEFT JOIN unread u ON u.contact_id = l.contact_id
ON CONFLICT (contact_id) DO UPDATE SET
  last_message_at = EXCLUDED.last_message_at,
  last_message_preview = EXCLUDED.last_message_preview,
  last_message_direction = EXCLUDED.last_message_direction,
  unread_count = EXCLUDED.unread_count,
  updated_at = now();
