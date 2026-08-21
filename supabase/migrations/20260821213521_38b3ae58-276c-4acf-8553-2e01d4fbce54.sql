ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS inbox_access boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION private.has_inbox_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','operador','vrm','comunicacao')
  ) OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = _user_id AND inbox_access = true
  )
$$;

CREATE OR REPLACE FUNCTION private.is_communication_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT private.has_inbox_access(_user_id)
$$;

CREATE POLICY "inbox_access update inbound" ON public.inbound_messages
  FOR UPDATE TO authenticated
  USING (private.has_inbox_access(auth.uid()))
  WITH CHECK (private.has_inbox_access(auth.uid()));

CREATE POLICY "inbox_access view direct messages" ON public.direct_messages
  FOR SELECT TO authenticated
  USING (private.has_inbox_access(auth.uid()));

CREATE POLICY "inbox_access insert direct messages" ON public.direct_messages
  FOR INSERT TO authenticated
  WITH CHECK (private.has_inbox_access(auth.uid()) AND sent_by = auth.uid());

CREATE POLICY "inbox_access view message templates" ON public.message_templates
  FOR SELECT TO authenticated
  USING (private.has_inbox_access(auth.uid()));

CREATE POLICY "inbox_access view whatsapp templates" ON public.whatsapp_templates
  FOR SELECT TO authenticated
  USING (private.has_inbox_access(auth.uid()));

CREATE POLICY "inbox_access update contacts" ON public.contacts
  FOR UPDATE TO authenticated
  USING (private.has_inbox_access(auth.uid()))
  WITH CHECK (private.has_inbox_access(auth.uid()));