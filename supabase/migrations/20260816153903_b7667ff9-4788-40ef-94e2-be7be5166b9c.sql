ALTER TABLE public.form_definitions
  ADD COLUMN IF NOT EXISTS header_image_path text NULL,
  ADD COLUMN IF NOT EXISTS header_image_mime text NULL;