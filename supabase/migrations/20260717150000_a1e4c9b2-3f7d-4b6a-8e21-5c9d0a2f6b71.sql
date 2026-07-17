-- Atribuição de Missões de Agitação: admin monta uma missão (título + mensagem
-- padronizada) a partir de um grupo de contatos, e atribui manualmente pacotes
-- desse grupo a um responsável (agitador), gerando um link exclusivo pra essa
-- pessoa executar os envios pelo WhatsApp — sem precisar de login no sistema.
CREATE TABLE IF NOT EXISTS public.agitation_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message_template text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agitation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.agitation_missions(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  assigned_user_id uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','concluido')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, contact_id)
);
CREATE INDEX IF NOT EXISTS idx_agitation_tasks_mission ON public.agitation_tasks (mission_id);
CREATE INDEX IF NOT EXISTS idx_agitation_tasks_assigned_user ON public.agitation_tasks (assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_agitation_tasks_contact ON public.agitation_tasks (contact_id);

CREATE TRIGGER trg_agitation_tasks_updated
  BEFORE UPDATE ON public.agitation_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agitation_missions TO authenticated;
GRANT ALL ON public.agitation_missions TO service_role;
ALTER TABLE public.agitation_missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_agitation_missions" ON public.agitation_missions
  FOR ALL TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agitation_tasks TO authenticated;
GRANT ALL ON public.agitation_tasks TO service_role;
ALTER TABLE public.agitation_tasks ENABLE ROW LEVEL SECURITY;

-- A rota pública do executor (sem login) lê/escreve via supabaseAdmin
-- (service_role, ignora RLS) — estas policies cobrem só o uso autenticado
-- (telas de admin em /missoes-agitacao).
CREATE POLICY "staff_manage_agitation_tasks" ON public.agitation_tasks
  FOR ALL TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));
