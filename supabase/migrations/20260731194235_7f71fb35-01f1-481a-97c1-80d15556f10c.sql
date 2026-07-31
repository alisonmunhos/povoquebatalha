CREATE TABLE IF NOT EXISTS public.segment_triage_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id uuid NOT NULL REFERENCES public.segments(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('manter','arquivar','pular')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (segment_id, contact_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.segment_triage_decisions TO authenticated;
GRANT ALL ON public.segment_triage_decisions TO service_role;

ALTER TABLE public.segment_triage_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "triage_decisions_staff_manage"
  ON public.segment_triage_decisions FOR ALL TO authenticated
  USING (private.is_member(auth.uid()))
  WITH CHECK (private.is_member(auth.uid()));

CREATE POLICY "triage_decisions_own_select"
  ON public.segment_triage_decisions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "triage_decisions_own_insert"
  ON public.segment_triage_decisions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "triage_decisions_own_update"
  ON public.segment_triage_decisions FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "triage_decisions_own_delete"
  ON public.segment_triage_decisions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS segment_triage_decisions_seg_user_idx
  ON public.segment_triage_decisions (segment_id, user_id);

CREATE TRIGGER segment_triage_decisions_updated_at
  BEFORE UPDATE ON public.segment_triage_decisions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();