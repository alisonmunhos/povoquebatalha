
DROP POLICY IF EXISTS campaign_media_read_auth ON storage.objects;
DROP POLICY IF EXISTS campaign_media_write_auth ON storage.objects;
DROP POLICY IF EXISTS campaign_media_update_auth ON storage.objects;
DROP POLICY IF EXISTS campaign_media_delete_auth ON storage.objects;

CREATE POLICY campaign_media_read_staff ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'campaign-media' AND private.is_staff(auth.uid()));
CREATE POLICY campaign_media_write_staff ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'campaign-media' AND private.is_staff(auth.uid()));
CREATE POLICY campaign_media_update_staff ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'campaign-media' AND private.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'campaign-media' AND private.is_staff(auth.uid()));
CREATE POLICY campaign_media_delete_staff ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'campaign-media' AND private.is_staff(auth.uid()));
