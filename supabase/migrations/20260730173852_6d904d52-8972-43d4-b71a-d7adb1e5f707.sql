CREATE TABLE public.segment_triage_shares (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  segment_id uuid NOT NULL REFERENCES public.segments(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  label text,
  created_by uuid,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  use_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX segment_triage_shares_segment_idx ON public.segment_triage_shares(segment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.segment_triage_shares TO authenticated;
GRANT ALL ON public.segment_triage_shares TO service_role;

ALTER TABLE public.segment_triage_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "triage_shares_select_authenticated"
  ON public.segment_triage_shares FOR SELECT TO authenticated USING (true);

CREATE POLICY "triage_shares_insert_authenticated"
  ON public.segment_triage_shares FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "triage_shares_update_owner_or_admin"
  ON public.segment_triage_shares FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (created_by = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "triage_shares_delete_owner_or_admin"
  ON public.segment_triage_shares FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER segment_triage_shares_updated_at
  BEFORE UPDATE ON public.segment_triage_shares
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();