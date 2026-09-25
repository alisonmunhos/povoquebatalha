ALTER TABLE public.legal_pages ADD COLUMN IF NOT EXISTS pdf_url text;

CREATE POLICY "public-docs read" ON storage.objects FOR SELECT USING (bucket_id = 'public-docs');
CREATE POLICY "public-docs insert auth" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'public-docs' AND lower(storage.extension(name)) = 'pdf');
CREATE POLICY "public-docs update auth" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'public-docs') WITH CHECK (bucket_id = 'public-docs' AND lower(storage.extension(name)) = 'pdf');
CREATE POLICY "public-docs delete auth" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'public-docs');