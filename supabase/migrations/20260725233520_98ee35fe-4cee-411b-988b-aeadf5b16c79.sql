-- 1) notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  image_url text,
  kind text NOT NULL DEFAULT 'info' CHECK (kind IN ('info','mission','custom','wa_me','link','calendar')),
  cta_label text,
  cta_kind text CHECK (cta_kind IS NULL OR cta_kind IN ('wa_me','link','calendar','mission','none')),
  cta_payload jsonb DEFAULT '{}'::jsonb,
  mission_id uuid REFERENCES public.agitation_missions(id) ON DELETE SET NULL,
  read_at timestamptz,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- User can read own
CREATE POLICY "users_read_own_notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- User can update own (mark as read)
CREATE POLICY "users_update_own_notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Staff can insert / update / delete anything
CREATE POLICY "staff_insert_notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()));

CREATE POLICY "staff_manage_all_notifications" ON public.notifications
  FOR ALL TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));

CREATE TRIGGER trg_notifications_updated
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- 2) Ampliar agitation_missions
ALTER TABLE public.agitation_missions
  ADD COLUMN IF NOT EXISTS instructions text,
  ADD COLUMN IF NOT EXISTS batch_size integer NOT NULL DEFAULT 10 CHECK (batch_size > 0 AND batch_size <= 100),
  ADD COLUMN IF NOT EXISTS cooldown_minutes integer NOT NULL DEFAULT 60 CHECK (cooldown_minutes >= 0),
  ADD COLUMN IF NOT EXISTS whatsapp_message_template text,
  ADD COLUMN IF NOT EXISTS coordinator_phone text,
  ADD COLUMN IF NOT EXISTS is_open boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz;

-- Track cooldown per user
CREATE TABLE IF NOT EXISTS public.agitation_mission_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.agitation_missions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  task_count integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_mission_claims_user ON public.agitation_mission_claims(user_id, claimed_at DESC);
CREATE INDEX IF NOT EXISTS idx_mission_claims_mission ON public.agitation_mission_claims(mission_id);

GRANT SELECT, INSERT, UPDATE ON public.agitation_mission_claims TO authenticated;
GRANT ALL ON public.agitation_mission_claims TO service_role;

ALTER TABLE public.agitation_mission_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_claims" ON public.agitation_mission_claims
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_staff(auth.uid()));

CREATE POLICY "users_insert_own_claims" ON public.agitation_mission_claims
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_update_own_claims" ON public.agitation_mission_claims
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "staff_manage_all_claims" ON public.agitation_mission_claims
  FOR ALL TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));

-- 3) push_subscriptions
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX idx_push_subscriptions_user ON public.push_subscriptions(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_push" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "staff_read_all_push" ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));