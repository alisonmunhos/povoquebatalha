-- Motivo de pausa automática de campanha (ex.: shadowban suspeito), mesmo padrão de canceled_motivo.
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS paused_motivo text;
