-- Novos campos de ficha para suportar o construtor de formulários personalizados.
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS quem_indicou text,
  ADD COLUMN IF NOT EXISTS rede_social text,
  ADD COLUMN IF NOT EXISTS zona_eleitoral text,
  ADD COLUMN IF NOT EXISTS faixa_etaria text,
  ADD COLUMN IF NOT EXISTS disponibilidade jsonb NOT NULL DEFAULT '[]'::jsonb;
