CREATE TABLE public.story_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL CHECK (event IN ('abriu','foto_escolhida','compartilhou','baixou')),
  device text NOT NULL CHECK (device IN ('mobile','desktop')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.story_events TO anon;
GRANT INSERT, SELECT ON public.story_events TO authenticated;
GRANT ALL ON public.story_events TO service_role;
ALTER TABLE public.story_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Qualquer um registra evento de story" ON public.story_events FOR INSERT TO anon, authenticated
  WITH CHECK (event IN ('abriu','foto_escolhida','compartilhou','baixou') AND device IN ('mobile','desktop'));
CREATE POLICY "Autenticados leem eventos de story" ON public.story_events FOR SELECT TO authenticated USING (true);
CREATE INDEX story_events_created_at_idx ON public.story_events (created_at);