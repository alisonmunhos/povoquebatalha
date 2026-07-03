ALTER TABLE public.campaign_recipients
  ADD COLUMN IF NOT EXISTS link_url text,
  ADD COLUMN IF NOT EXISTS link_title text,
  ADD COLUMN IF NOT EXISTS link_description text,
  ADD COLUMN IF NOT EXISTS link_image text,
  ADD COLUMN IF NOT EXISTS preview_status text;