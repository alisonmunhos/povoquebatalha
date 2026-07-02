
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vrm';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'territorio';

CREATE TABLE IF NOT EXISTS public.user_territory_scopes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  uf text,
  cidade text,
  bairro text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS user_territory_scopes_uniq
  ON public.user_territory_scopes (user_id, COALESCE(uf,''), COALESCE(cidade,''), COALESCE(bairro,''));
CREATE INDEX IF NOT EXISTS user_territory_scopes_user_idx ON public.user_territory_scopes(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_territory_scopes TO authenticated;
GRANT ALL ON public.user_territory_scopes TO service_role;

ALTER TABLE public.user_territory_scopes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage user territory scopes"
  ON public.user_territory_scopes
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users read own territory scopes"
  ON public.user_territory_scopes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
