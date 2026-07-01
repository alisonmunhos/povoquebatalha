
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.message_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS midia_path text,
  ADD COLUMN IF NOT EXISTS midia_filename text,
  ADD COLUMN IF NOT EXISTS midia_mime text,
  ADD COLUMN IF NOT EXISTS audience_ids jsonb;

CREATE POLICY "campaign_media_read_auth"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'campaign-media');

CREATE POLICY "campaign_media_write_auth"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'campaign-media');

CREATE POLICY "campaign_media_update_auth"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'campaign-media');

CREATE POLICY "campaign_media_delete_auth"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'campaign-media');
