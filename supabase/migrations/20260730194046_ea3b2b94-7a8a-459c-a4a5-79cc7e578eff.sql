ALTER TABLE public.agitation_tasks DROP CONSTRAINT IF EXISTS agitation_tasks_status_check;
ALTER TABLE public.agitation_tasks ADD CONSTRAINT agitation_tasks_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'concluido'::text, 'nao_enviado'::text, 'erro_numero'::text]));