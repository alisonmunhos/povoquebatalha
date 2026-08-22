ALTER TABLE public.inbound_messages
  ADD COLUMN IF NOT EXISTS media_path text,
  ADD COLUMN IF NOT EXISTS wa_message_id text,
  ADD COLUMN IF NOT EXISTS reaction_emoji text,
  ADD COLUMN IF NOT EXISTS reaction_target_wa_id text,
  ADD COLUMN IF NOT EXISTS reply_to_wa_id text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS location_name text,
  ADD COLUMN IF NOT EXISTS shared_contacts jsonb,
  ADD COLUMN IF NOT EXISTS is_system_event boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS inbound_messages_wa_message_id_idx ON public.inbound_messages (wa_message_id);
CREATE INDEX IF NOT EXISTS inbound_messages_reaction_target_idx ON public.inbound_messages (reaction_target_wa_id);

-- Backfill: identificador da mensagem no WhatsApp
UPDATE public.inbound_messages
   SET wa_message_id = COALESCE(payload->>'messageId', payload->>'id')
 WHERE wa_message_id IS NULL
   AND COALESCE(payload->>'messageId', payload->>'id') IS NOT NULL;

-- Backfill: reações (Z-API antiga gravou como ReceivedCallback)
UPDATE public.inbound_messages
   SET tipo = 'reaction',
       reaction_emoji = payload->'reaction'->>'value',
       reaction_target_wa_id = payload->'reaction'->'referencedMessage'->>'messageId'
 WHERE payload ? 'reaction'
   AND (reaction_emoji IS NULL OR tipo <> 'reaction');

-- Backfill: avisos de grupo/sistema (sem texto e sem mídia)
UPDATE public.inbound_messages
   SET is_system_event = true
 WHERE COALESCE(conteudo, '') = ''
   AND media_url IS NULL
   AND NOT (payload ? 'reaction')
   AND (payload ? 'notification' OR payload->>'type' = 'system' OR payload ? 'callId');