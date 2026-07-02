
CREATE OR REPLACE FUNCTION private.is_communication_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id=_user_id AND role IN ('admin','operador','vrm','comunicacao')
  )
$$;

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL UNIQUE REFERENCES public.contacts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','aguardando','resolvida')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_message_at timestamptz,
  last_message_preview text,
  last_message_direction text CHECK (last_message_direction IN ('in','out')),
  unread_count integer NOT NULL DEFAULT 0,
  flagged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conv_status ON public.conversations(status);
CREATE INDEX IF NOT EXISTS idx_conv_assigned ON public.conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_conv_last_at ON public.conversations(last_message_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comm_staff_read_conv" ON public.conversations;
DROP POLICY IF EXISTS "comm_staff_update_conv" ON public.conversations;
DROP POLICY IF EXISTS "comm_staff_insert_conv" ON public.conversations;
CREATE POLICY "comm_staff_read_conv" ON public.conversations FOR SELECT
  TO authenticated USING (private.is_communication_staff(auth.uid()));
CREATE POLICY "comm_staff_update_conv" ON public.conversations FOR UPDATE
  TO authenticated USING (private.is_communication_staff(auth.uid()))
  WITH CHECK (private.is_communication_staff(auth.uid()));
CREATE POLICY "comm_staff_insert_conv" ON public.conversations FOR INSERT
  TO authenticated WITH CHECK (private.is_communication_staff(auth.uid()));

CREATE TABLE IF NOT EXISTS public.conversation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('assigned','unassigned','status_changed','note','mention','opened','flagged','unflagged')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conv_evt_conv ON public.conversation_events(conversation_id, created_at DESC);

GRANT SELECT, INSERT ON public.conversation_events TO authenticated;
GRANT ALL ON public.conversation_events TO service_role;
ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comm_staff_read_evt" ON public.conversation_events;
DROP POLICY IF EXISTS "comm_staff_insert_evt" ON public.conversation_events;
CREATE POLICY "comm_staff_read_evt" ON public.conversation_events FOR SELECT
  TO authenticated USING (private.is_communication_staff(auth.uid()));
CREATE POLICY "comm_staff_insert_evt" ON public.conversation_events FOR INSERT
  TO authenticated WITH CHECK (
    private.is_communication_staff(auth.uid()) AND actor_id = auth.uid()
  );

DROP TRIGGER IF EXISTS trg_conv_updated ON public.conversations;
CREATE TRIGGER trg_conv_updated BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.conv_sync_from_inbound()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
BEGIN
  IF NEW.contact_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.conversations (contact_id, last_message_at, last_message_preview, last_message_direction, unread_count, status)
  VALUES (NEW.contact_id, COALESCE(NEW.received_at, now()), left(COALESCE(NEW.conteudo,''), 200), 'in', 1, 'aberta')
  ON CONFLICT (contact_id) DO UPDATE SET
    last_message_at = EXCLUDED.last_message_at,
    last_message_preview = EXCLUDED.last_message_preview,
    last_message_direction = 'in',
    unread_count = public.conversations.unread_count + 1,
    status = CASE WHEN public.conversations.status = 'resolvida' THEN 'aberta' ELSE public.conversations.status END,
    updated_at = now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_conv_from_inbound ON public.inbound_messages;
CREATE TRIGGER trg_conv_from_inbound AFTER INSERT ON public.inbound_messages
  FOR EACH ROW EXECUTE FUNCTION public.conv_sync_from_inbound();

CREATE OR REPLACE FUNCTION public.conv_sync_from_direct()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
BEGIN
  INSERT INTO public.conversations (contact_id, last_message_at, last_message_preview, last_message_direction, unread_count, status, assigned_to)
  VALUES (NEW.contact_id, COALESCE(NEW.created_at, now()), left(COALESCE(NEW.conteudo,''), 200), 'out', 0, 'aberta', NEW.sent_by)
  ON CONFLICT (contact_id) DO UPDATE SET
    last_message_at = EXCLUDED.last_message_at,
    last_message_preview = EXCLUDED.last_message_preview,
    last_message_direction = 'out',
    assigned_to = COALESCE(public.conversations.assigned_to, NEW.sent_by),
    updated_at = now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_conv_from_direct ON public.direct_messages;
CREATE TRIGGER trg_conv_from_direct AFTER INSERT ON public.direct_messages
  FOR EACH ROW EXECUTE FUNCTION public.conv_sync_from_direct();

INSERT INTO public.conversations (contact_id, last_message_at, last_message_preview, last_message_direction, unread_count, status)
SELECT
  im.contact_id,
  max(im.received_at),
  (SELECT left(coalesce(im2.conteudo,''),200) FROM public.inbound_messages im2
    WHERE im2.contact_id = im.contact_id ORDER BY im2.received_at DESC LIMIT 1),
  'in',
  count(*) FILTER (WHERE im.read_at IS NULL),
  CASE WHEN bool_and(im.resolved_at IS NOT NULL) THEN 'resolvida' ELSE 'aberta' END
FROM public.inbound_messages im
WHERE im.contact_id IS NOT NULL
GROUP BY im.contact_id
ON CONFLICT (contact_id) DO NOTHING;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_events; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
