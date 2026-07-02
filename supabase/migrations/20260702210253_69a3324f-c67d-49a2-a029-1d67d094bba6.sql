
-- Bloco 14: consolidação do Inbox

-- 1) direct_messages: colunas de status detalhado
ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_direct_messages_zaap_id ON public.direct_messages(zaap_id) WHERE zaap_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_direct_messages_message_id ON public.direct_messages(message_id) WHERE message_id IS NOT NULL;

-- 2) inbound_messages: campos de mídia recebida
ALTER TABLE public.inbound_messages
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_mime text,
  ADD COLUMN IF NOT EXISTS media_filename text,
  ADD COLUMN IF NOT EXISTS media_size integer;

-- 3) conversations: aceitar conversas sem contato vinculado
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS from_phone text;

ALTER TABLE public.conversations
  ALTER COLUMN contact_id DROP NOT NULL;

-- Remove unique global e cria dois parciais
ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_contact_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_contact_id_uniq
  ON public.conversations(contact_id) WHERE contact_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_from_phone_uniq
  ON public.conversations(from_phone) WHERE contact_id IS NULL AND from_phone IS NOT NULL;

-- 4) Atualiza trigger conv_sync_from_inbound para tratar contact_id NULL
CREATE OR REPLACE FUNCTION public.conv_sync_from_inbound()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    INSERT INTO public.conversations (contact_id, last_message_at, last_message_preview, last_message_direction, unread_count, status)
    VALUES (NEW.contact_id, COALESCE(NEW.received_at, now()), left(COALESCE(NEW.conteudo,''), 200), 'in', 1, 'aberta')
    ON CONFLICT (contact_id) WHERE contact_id IS NOT NULL DO UPDATE SET
      last_message_at = EXCLUDED.last_message_at,
      last_message_preview = EXCLUDED.last_message_preview,
      last_message_direction = 'in',
      unread_count = public.conversations.unread_count + 1,
      status = CASE WHEN public.conversations.status = 'resolvida' THEN 'aberta' ELSE public.conversations.status END,
      updated_at = now();
  ELSIF NEW.from_phone IS NOT NULL THEN
    INSERT INTO public.conversations (from_phone, last_message_at, last_message_preview, last_message_direction, unread_count, status)
    VALUES (NEW.from_phone, COALESCE(NEW.received_at, now()), left(COALESCE(NEW.conteudo,''), 200), 'in', 1, 'aberta')
    ON CONFLICT (from_phone) WHERE contact_id IS NULL AND from_phone IS NOT NULL DO UPDATE SET
      last_message_at = EXCLUDED.last_message_at,
      last_message_preview = EXCLUDED.last_message_preview,
      last_message_direction = 'in',
      unread_count = public.conversations.unread_count + 1,
      status = CASE WHEN public.conversations.status = 'resolvida' THEN 'aberta' ELSE public.conversations.status END,
      updated_at = now();
  END IF;
  RETURN NEW;
END $function$;
