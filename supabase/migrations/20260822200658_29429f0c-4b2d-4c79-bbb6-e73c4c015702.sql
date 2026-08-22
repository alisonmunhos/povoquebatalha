ALTER TABLE public.direct_messages ALTER COLUMN contact_id DROP NOT NULL;
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS to_phone text;
CREATE INDEX IF NOT EXISTS direct_messages_to_phone_idx ON public.direct_messages (to_phone) WHERE to_phone IS NOT NULL;