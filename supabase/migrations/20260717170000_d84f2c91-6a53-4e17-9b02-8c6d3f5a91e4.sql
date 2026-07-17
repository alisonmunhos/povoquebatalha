-- Melhorias em Missões de Agitação: editar mensagem depois de criada, status
-- de "não enviado" (além de concluído/pendente), pausa de missão/link, e
-- reaproveitar o filtro original pra criar uma missão de continuidade.
ALTER TABLE public.agitation_missions
  ADD COLUMN IF NOT EXISTS source_filters jsonb,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz;

ALTER TABLE public.agitation_tasks
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

ALTER TABLE public.agitation_tasks DROP CONSTRAINT IF EXISTS agitation_tasks_status_check;
ALTER TABLE public.agitation_tasks
  ADD CONSTRAINT agitation_tasks_status_check CHECK (status IN ('pending','concluido','nao_enviado'));

-- Pausa por link (um responsável específico dentro de uma missão), sem
-- precisar reestruturar agitation_tasks — chave é o par (mission_id, contact_id)
-- que já identifica o link público hoje.
CREATE TABLE IF NOT EXISTS public.agitation_link_pauses (
  mission_id uuid NOT NULL REFERENCES public.agitation_missions(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  paused_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mission_id, contact_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agitation_link_pauses TO authenticated;
GRANT ALL ON public.agitation_link_pauses TO service_role;
ALTER TABLE public.agitation_link_pauses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_agitation_link_pauses" ON public.agitation_link_pauses
  FOR ALL TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));
