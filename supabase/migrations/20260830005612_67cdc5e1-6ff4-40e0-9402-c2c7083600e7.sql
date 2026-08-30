ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS reaction_emoji text,
  ADD COLUMN IF NOT EXISTS reaction_target_wa_id text;

CREATE INDEX IF NOT EXISTS direct_messages_reaction_target_idx
  ON public.direct_messages (reaction_target_wa_id)
  WHERE reaction_target_wa_id IS NOT NULL;