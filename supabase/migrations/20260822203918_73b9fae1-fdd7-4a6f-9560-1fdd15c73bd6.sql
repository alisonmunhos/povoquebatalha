ALTER TABLE public.whatsapp_flow_steps
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'question',
  ADD COLUMN IF NOT EXISTS path_key text NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS option_routes jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.whatsapp_flow_sessions
  ADD COLUMN IF NOT EXISTS path_key text NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_whatsapp_flow_steps_path
  ON public.whatsapp_flow_steps (flow_id, path_key, order_index);