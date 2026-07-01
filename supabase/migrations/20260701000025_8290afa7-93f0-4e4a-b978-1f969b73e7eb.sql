-- Cancel/pause metadata for campaigns
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS canceled_by uuid,
  ADD COLUMN IF NOT EXISTS canceled_motivo text,
  ADD COLUMN IF NOT EXISTS ultimo_lote_at timestamptz;

-- Geocoding cache table
CREATE TABLE IF NOT EXISTS public.geocode_cache (
  endereco_completo text PRIMARY KEY,
  latitude double precision,
  longitude double precision,
  provider text,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.geocode_cache TO authenticated;
GRANT ALL ON public.geocode_cache TO service_role;
ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read geocode_cache" ON public.geocode_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write geocode_cache" ON public.geocode_cache FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update geocode_cache" ON public.geocode_cache FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS contacts_latlng_idx ON public.contacts (latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_geocoding_status_idx ON public.contacts (geocoding_status);
CREATE INDEX IF NOT EXISTS campaign_recipients_status_idx ON public.campaign_recipients (campaign_id, status);
CREATE INDEX IF NOT EXISTS campaigns_status_idx ON public.campaigns (status);