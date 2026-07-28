-- Fase 0: fundações para notificações de aprovação, push por contato e eventos.

-- 1) Ampliar kinds de notifications
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_kind_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN (
    'info', 'mission', 'custom', 'wa_me', 'link', 'calendar',
    'user_approval', 'event'
  ));

-- 2) Configuração de notificações automáticas do sistema
CREATE TABLE public.system_notification_settings (
  key text PRIMARY KEY,
  recipient_roles text[] NOT NULL DEFAULT '{admin}'::text[],
  title_template text NOT NULL,
  body_template text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.system_notification_settings TO authenticated;
GRANT ALL ON public.system_notification_settings TO service_role;

ALTER TABLE public.system_notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_system_notification_settings"
  ON public.system_notification_settings
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin_manage_system_notification_settings"
  ON public.system_notification_settings
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

INSERT INTO public.system_notification_settings (key, recipient_roles, title_template, body_template)
VALUES (
  'user_approval',
  ARRAY['admin']::text[],
  'Novo cadastro aguardando aprovação',
  '{{full_name}} ({{email}}) solicitou acesso como {{requested_role}}.'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.system_notification_settings (key, recipient_roles, title_template, body_template)
VALUES (
  'event',
  ARRAY['admin']::text[],
  'Nova confirmação de presença',
  '{{contact_name}} confirmou presença em {{event_title}}.'
)
ON CONFLICT (key) DO NOTHING;

CREATE TRIGGER trg_system_notification_settings_updated
  BEFORE UPDATE ON public.system_notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) push_subscriptions: staff (user_id) ou contato público (contact_id)
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE;

ALTER TABLE public.push_subscriptions
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_endpoint_key;

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);

ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_owner_check;

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_owner_check
  CHECK (
    (user_id IS NOT NULL AND contact_id IS NULL)
    OR (user_id IS NULL AND contact_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_contact
  ON public.push_subscriptions(contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON public.push_subscriptions(user_id)
  WHERE user_id IS NOT NULL;

-- RLS: inscrições de contato são geridas via service_role (API pública na Fase 2).
DROP POLICY IF EXISTS "users_manage_own_push" ON public.push_subscriptions;

CREATE POLICY "users_manage_own_push" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid())
  WITH CHECK (user_id IS NOT NULL AND user_id = auth.uid());