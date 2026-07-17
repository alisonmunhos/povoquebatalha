-- Corrige agitation_tasks.assigned_user_id: o responsável de uma missão não
-- precisa de conta no sistema (o link público /missao/.../contato/... não
-- exige login), então a FK deve apontar pra contacts, não auth.users.
-- Preserva as atribuições já feitas convertendo via profiles.contact_id antes
-- de trocar a constraint.
ALTER TABLE public.agitation_tasks DROP CONSTRAINT IF EXISTS agitation_tasks_assigned_user_id_fkey;

UPDATE public.agitation_tasks t
SET assigned_user_id = p.contact_id
FROM public.profiles p
WHERE p.id = t.assigned_user_id;

ALTER TABLE public.agitation_tasks RENAME COLUMN assigned_user_id TO assigned_contact_id;
ALTER TABLE public.agitation_tasks
  ADD CONSTRAINT agitation_tasks_assigned_contact_id_fkey
  FOREIGN KEY (assigned_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

ALTER INDEX IF EXISTS idx_agitation_tasks_assigned_user RENAME TO idx_agitation_tasks_assigned_contact;
