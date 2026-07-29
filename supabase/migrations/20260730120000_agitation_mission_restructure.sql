-- Reestruturação: criação desacoplada, arquivamento, elegíveis à auto-atribuição, fix de sobreposição.

ALTER TABLE public.agitation_missions
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS open_notified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_agitation_missions_archived
  ON public.agitation_missions (archived_at)
  WHERE archived_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.agitation_mission_eligible_users (
  mission_id uuid NOT NULL REFERENCES public.agitation_missions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mission_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.agitation_mission_eligible_users TO authenticated;
GRANT ALL ON public.agitation_mission_eligible_users TO service_role;
ALTER TABLE public.agitation_mission_eligible_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_manage_mission_eligible_users" ON public.agitation_mission_eligible_users;
CREATE POLICY "staff_manage_mission_eligible_users" ON public.agitation_mission_eligible_users
  FOR ALL TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));

-- Atribui tasks específicas a um usuário (detalhe da missão).
CREATE OR REPLACE FUNCTION public.assign_mission_tasks_to_user(
  _mission_id uuid,
  _user_id uuid,
  _task_ids uuid[]
)
RETURNS TABLE(claim_id uuid, task_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mission public.agitation_missions;
  v_new_claim uuid;
  v_task_ids uuid[];
BEGIN
  IF NOT private.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  SELECT * INTO v_mission FROM public.agitation_missions WHERE id = _mission_id;
  IF v_mission.id IS NULL THEN RAISE EXCEPTION 'Missão não encontrada'; END IF;
  IF v_mission.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Missão arquivada — novas atribuições bloqueadas'; END IF;

  SELECT id INTO v_new_claim
  FROM public.agitation_mission_claims
  WHERE mission_id = _mission_id AND user_id = _user_id AND completed_at IS NULL
  LIMIT 1;

  IF v_new_claim IS NULL THEN
    INSERT INTO public.agitation_mission_claims (mission_id, user_id, task_count)
    VALUES (_mission_id, _user_id, 0)
    RETURNING id INTO v_new_claim;
  END IF;

  WITH picked AS (
    SELECT id FROM public.agitation_tasks
    WHERE mission_id = _mission_id
      AND id = ANY(_task_ids)
      AND assigned_user_id IS NULL
      AND assigned_contact_id IS NULL
      AND status = 'pending'
    FOR UPDATE
  ), updated AS (
    UPDATE public.agitation_tasks t
    SET assigned_user_id = _user_id,
        claim_id = v_new_claim,
        assigned_to_user_at = now()
    FROM picked
    WHERE t.id = picked.id
    RETURNING t.id
  )
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_task_ids FROM updated;

  UPDATE public.agitation_mission_claims
  SET task_count = task_count + COALESCE(array_length(v_task_ids, 1), 0)
  WHERE id = v_new_claim;

  claim_id := v_new_claim;
  task_ids := v_task_ids;
  RETURN NEXT;
END $$;

GRANT EXECUTE ON FUNCTION public.assign_mission_tasks_to_user(uuid, uuid, uuid[]) TO authenticated;

-- claim_mission_batch: exclui tasks com link + missão arquivada + elegibilidade
CREATE OR REPLACE FUNCTION public.claim_mission_batch(_mission_id uuid)
RETURNS TABLE(claim_id uuid, task_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_mission public.agitation_missions;
  v_last_completed timestamptz;
  v_new_claim uuid;
  v_task_ids uuid[];
  v_has_eligible boolean;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT * INTO v_mission FROM public.agitation_missions WHERE id = _mission_id;
  IF v_mission.id IS NULL THEN RAISE EXCEPTION 'Missão não encontrada'; END IF;
  IF v_mission.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Missão arquivada'; END IF;
  IF v_mission.paused_at IS NOT NULL THEN RAISE EXCEPTION 'Missão está pausada'; END IF;
  IF NOT v_mission.is_open THEN RAISE EXCEPTION 'Missão não é aberta para auto-atribuição'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.agitation_mission_eligible_users WHERE mission_id = _mission_id
  ) INTO v_has_eligible;

  IF v_has_eligible AND NOT EXISTS (
    SELECT 1 FROM public.agitation_mission_eligible_users
    WHERE mission_id = _mission_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Você não está na lista de elegíveis desta missão';
  END IF;

  SELECT MAX(completed_at) INTO v_last_completed
  FROM public.agitation_mission_claims
  WHERE mission_id = _mission_id AND user_id = v_user_id AND completed_at IS NOT NULL;

  IF v_last_completed IS NOT NULL
     AND now() < v_last_completed + make_interval(mins => v_mission.cooldown_minutes) THEN
    RAISE EXCEPTION 'Aguarde o cooldown (% min) antes de pegar mais.', v_mission.cooldown_minutes;
  END IF;

  SELECT id INTO v_new_claim
  FROM public.agitation_mission_claims
  WHERE mission_id = _mission_id AND user_id = v_user_id AND completed_at IS NULL
  LIMIT 1;

  IF v_new_claim IS NULL THEN
    INSERT INTO public.agitation_mission_claims (mission_id, user_id, task_count)
    VALUES (_mission_id, v_user_id, 0)
    RETURNING id INTO v_new_claim;
  END IF;

  WITH picked AS (
    SELECT id FROM public.agitation_tasks
    WHERE mission_id = _mission_id
      AND assigned_user_id IS NULL
      AND assigned_contact_id IS NULL
      AND status = 'pending'
    ORDER BY created_at
    LIMIT v_mission.batch_size
    FOR UPDATE SKIP LOCKED
  ), updated AS (
    UPDATE public.agitation_tasks t
    SET assigned_user_id = v_user_id,
        claim_id = v_new_claim,
        assigned_to_user_at = now()
    FROM picked
    WHERE t.id = picked.id
    RETURNING t.id
  )
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_task_ids FROM updated;

  UPDATE public.agitation_mission_claims
  SET task_count = task_count + COALESCE(array_length(v_task_ids, 1), 0)
  WHERE id = v_new_claim AND array_length(v_task_ids, 1) IS NOT NULL;

  claim_id := v_new_claim;
  task_ids := v_task_ids;
  RETURN NEXT;
END $$;

-- assign_mission_direct: exclui tasks com link + missão arquivada
CREATE OR REPLACE FUNCTION public.assign_mission_direct(_mission_id uuid, _user_id uuid, _count int)
RETURNS TABLE(claim_id uuid, task_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mission public.agitation_missions;
  v_new_claim uuid;
  v_task_ids uuid[];
BEGIN
  IF NOT private.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  SELECT * INTO v_mission FROM public.agitation_missions WHERE id = _mission_id;
  IF v_mission.id IS NULL THEN RAISE EXCEPTION 'Missão não encontrada'; END IF;
  IF v_mission.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Missão arquivada — novas atribuições bloqueadas'; END IF;

  SELECT id INTO v_new_claim
  FROM public.agitation_mission_claims
  WHERE mission_id = _mission_id AND user_id = _user_id AND completed_at IS NULL
  LIMIT 1;

  IF v_new_claim IS NULL THEN
    INSERT INTO public.agitation_mission_claims (mission_id, user_id, task_count)
    VALUES (_mission_id, _user_id, 0)
    RETURNING id INTO v_new_claim;
  END IF;

  WITH picked AS (
    SELECT id FROM public.agitation_tasks
    WHERE mission_id = _mission_id
      AND assigned_user_id IS NULL
      AND assigned_contact_id IS NULL
      AND status = 'pending'
    ORDER BY created_at
    LIMIT _count
    FOR UPDATE SKIP LOCKED
  ), updated AS (
    UPDATE public.agitation_tasks t
    SET assigned_user_id = _user_id,
        claim_id = v_new_claim,
        assigned_to_user_at = now()
    FROM picked
    WHERE t.id = picked.id
    RETURNING t.id
  )
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_task_ids FROM updated;

  UPDATE public.agitation_mission_claims
  SET task_count = task_count + COALESCE(array_length(v_task_ids, 1), 0)
  WHERE id = v_new_claim;

  claim_id := v_new_claim;
  task_ids := v_task_ids;
  RETURN NEXT;
END $$;
