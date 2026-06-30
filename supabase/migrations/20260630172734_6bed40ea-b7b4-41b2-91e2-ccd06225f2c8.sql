
-- Move SECURITY DEFINER helper functions out of the API-exposed public schema
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
$$;

CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role IN ('admin','operador'))
$$;

CREATE OR REPLACE FUNCTION private.is_member(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id)
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_staff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_member(uuid) TO authenticated, service_role;

-- Recreate all policies that used public.has_role/is_staff/is_member to use private.* instead
-- user_roles
DROP POLICY IF EXISTS "user_roles read own or admin" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles admin manage" ON public.user_roles;
CREATE POLICY "user_roles read own or admin" ON public.user_roles FOR SELECT
  USING ((user_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "user_roles admin manage" ON public.user_roles FOR ALL
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

-- profiles
DROP POLICY IF EXISTS "profiles members read" ON public.profiles;
CREATE POLICY "profiles members read" ON public.profiles FOR SELECT USING (private.is_member(auth.uid()));

-- contacts
DROP POLICY IF EXISTS "contacts members read" ON public.contacts;
DROP POLICY IF EXISTS "contacts staff insert" ON public.contacts;
DROP POLICY IF EXISTS "contacts staff update" ON public.contacts;
DROP POLICY IF EXISTS "contacts admin delete" ON public.contacts;
CREATE POLICY "contacts members read" ON public.contacts FOR SELECT USING (private.is_member(auth.uid()));
CREATE POLICY "contacts staff insert" ON public.contacts FOR INSERT WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "contacts staff update" ON public.contacts FOR UPDATE USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "contacts admin delete" ON public.contacts FOR DELETE USING (private.has_role(auth.uid(), 'admin'::public.app_role));

-- tags
DROP POLICY IF EXISTS "tags members read" ON public.tags;
DROP POLICY IF EXISTS "tags staff manage" ON public.tags;
CREATE POLICY "tags members read" ON public.tags FOR SELECT USING (private.is_member(auth.uid()));
CREATE POLICY "tags staff manage" ON public.tags FOR ALL USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

-- contact_tags
DROP POLICY IF EXISTS "contact_tags members read" ON public.contact_tags;
DROP POLICY IF EXISTS "contact_tags staff manage" ON public.contact_tags;
CREATE POLICY "contact_tags members read" ON public.contact_tags FOR SELECT USING (private.is_member(auth.uid()));
CREATE POLICY "contact_tags staff manage" ON public.contact_tags FOR ALL USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

-- segments
DROP POLICY IF EXISTS "segments members read" ON public.segments;
DROP POLICY IF EXISTS "segments staff manage" ON public.segments;
CREATE POLICY "segments members read" ON public.segments FOR SELECT USING (private.is_member(auth.uid()));
CREATE POLICY "segments staff manage" ON public.segments FOR ALL USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

-- imports
DROP POLICY IF EXISTS "imports members read" ON public.imports;
DROP POLICY IF EXISTS "imports staff manage" ON public.imports;
CREATE POLICY "imports members read" ON public.imports FOR SELECT USING (private.is_member(auth.uid()));
CREATE POLICY "imports staff manage" ON public.imports FOR ALL USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

-- import_rows
DROP POLICY IF EXISTS "import_rows members read" ON public.import_rows;
DROP POLICY IF EXISTS "import_rows staff manage" ON public.import_rows;
CREATE POLICY "import_rows members read" ON public.import_rows FOR SELECT USING (private.is_member(auth.uid()));
CREATE POLICY "import_rows staff manage" ON public.import_rows FOR ALL USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

-- whatsapp_instances
DROP POLICY IF EXISTS "instances members read" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "instances admin manage" ON public.whatsapp_instances;
CREATE POLICY "instances members read" ON public.whatsapp_instances FOR SELECT USING (private.is_member(auth.uid()));
CREATE POLICY "instances admin manage" ON public.whatsapp_instances FOR ALL
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

-- campaigns
DROP POLICY IF EXISTS "campaigns members read" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns staff manage" ON public.campaigns;
CREATE POLICY "campaigns members read" ON public.campaigns FOR SELECT USING (private.is_member(auth.uid()));
CREATE POLICY "campaigns staff manage" ON public.campaigns FOR ALL USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

-- campaign_recipients
DROP POLICY IF EXISTS "recipients members read" ON public.campaign_recipients;
DROP POLICY IF EXISTS "recipients staff manage" ON public.campaign_recipients;
CREATE POLICY "recipients members read" ON public.campaign_recipients FOR SELECT USING (private.is_member(auth.uid()));
CREATE POLICY "recipients staff manage" ON public.campaign_recipients FOR ALL USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

-- message_events
DROP POLICY IF EXISTS "events members read" ON public.message_events;
DROP POLICY IF EXISTS "events staff insert" ON public.message_events;
CREATE POLICY "events members read" ON public.message_events FOR SELECT USING (private.is_member(auth.uid()));
CREATE POLICY "events staff insert" ON public.message_events FOR INSERT WITH CHECK (private.is_staff(auth.uid()));

-- inbound_messages
DROP POLICY IF EXISTS "inbound members read" ON public.inbound_messages;
CREATE POLICY "inbound members read" ON public.inbound_messages FOR SELECT USING (private.is_member(auth.uid()));

-- webhook_log
DROP POLICY IF EXISTS "webhook_log admin read" ON public.webhook_log;
CREATE POLICY "webhook_log admin read" ON public.webhook_log FOR SELECT USING (private.has_role(auth.uid(), 'admin'::public.app_role));

-- storage.objects policies for imports bucket
DROP POLICY IF EXISTS "Staff read imports bucket" ON storage.objects;
DROP POLICY IF EXISTS "Staff upload imports bucket" ON storage.objects;
DROP POLICY IF EXISTS "Staff delete imports bucket" ON storage.objects;
CREATE POLICY "Staff read imports bucket" ON storage.objects FOR SELECT
  USING (bucket_id = 'imports' AND private.is_staff(auth.uid()));
CREATE POLICY "Staff upload imports bucket" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'imports' AND private.is_staff(auth.uid()));
CREATE POLICY "Staff delete imports bucket" ON storage.objects FOR DELETE
  USING (bucket_id = 'imports' AND private.is_staff(auth.uid()));

-- Now safe to drop the public-schema versions
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.is_staff(uuid);
DROP FUNCTION IF EXISTS public.is_member(uuid);
