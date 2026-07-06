ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS whatsapp_checked_at timestamptz;
CREATE INDEX IF NOT EXISTS contacts_whatsapp_status_idx ON public.contacts(whatsapp_status);
CREATE INDEX IF NOT EXISTS contacts_phone_status_idx ON public.contacts(phone_status);
CREATE INDEX IF NOT EXISTS contacts_lifecycle_status_idx ON public.contacts(lifecycle_status);