
-- 1) status em profiles
DO $$ BEGIN
  CREATE TYPE public.user_access_status AS ENUM ('ativo','suspenso','revogado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status public.user_access_status NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

-- 2) territory_contact_logs
DO $$ BEGIN
  CREATE TYPE public.territory_log_action AS ENUM (
    'whatsapp_aberto','contato_realizado','nao_encontrado','pediu_atualizacao','observacao'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.territory_contact_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  action public.territory_log_action NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tcl_contact ON public.territory_contact_logs(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tcl_user ON public.territory_contact_logs(user_id, created_at DESC);

GRANT SELECT, INSERT ON public.territory_contact_logs TO authenticated;
GRANT ALL ON public.territory_contact_logs TO service_role;

ALTER TABLE public.territory_contact_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tcl_insert_own"
  ON public.territory_contact_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "tcl_select_own_or_staff"
  ON public.territory_contact_logs FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR private.has_role(auth.uid(), 'admin')
    OR private.has_role(auth.uid(), 'operador')
    OR private.has_role(auth.uid(), 'vrm')
  );

-- 3) access_audit_log
CREATE TABLE IF NOT EXISTS public.access_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aal_target ON public.access_audit_log(target_user_id, created_at DESC);

GRANT SELECT, INSERT ON public.access_audit_log TO authenticated;
GRANT ALL ON public.access_audit_log TO service_role;

ALTER TABLE public.access_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aal_select_admin"
  ON public.access_audit_log FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

CREATE POLICY "aal_insert_admin"
  ON public.access_audit_log FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin') AND actor_id = auth.uid());
