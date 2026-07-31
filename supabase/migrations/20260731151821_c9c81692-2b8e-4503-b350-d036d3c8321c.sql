ALTER TABLE public.agitation_mission_claims
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid;

CREATE OR REPLACE FUNCTION public.release_mission_pending(_mission_id uuid, _older_than_hours integer DEFAULT 24)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cutoff timestamptz := now() - make_interval(hours => GREATEST(COALESCE(_older_than_hours, 24), 0));
BEGIN
  IF NOT private.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  -- Cancela levas abertas antigas (não inventa conclusão)
  UPDATE public.agitation_mission_claims
  SET cancelled_at = now(), cancelled_by = auth.uid()
  WHERE mission_id = _mission_id
    AND completed_at IS NULL
    AND cancelled_at IS NULL
    AND claimed_at <= v_cutoff;

  -- Libera tasks sem responsável efetivo: sem leva, ou de leva encerrada/cancelada
  UPDATE public.agitation_tasks t
  SET assigned_user_id = NULL, claim_id = NULL, assigned_to_user_at = NULL
  WHERE t.mission_id = _mission_id
    AND t.completed_at IS NULL
    AND t.status = 'pending'
    AND t.assigned_contact_id IS NULL
    AND (
      t.claim_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.agitation_mission_claims c
        WHERE c.id = t.claim_id
          AND (c.cancelled_at IS NOT NULL OR c.completed_at IS NOT NULL)
      )
    );

  -- Cancela notificações de quem não tem leva ativa nem conclusão registrada
  UPDATE public.notifications n
  SET cancelled_at = now(), cancelled_by = auth.uid()
  WHERE n.mission_id = _mission_id
    AND n.cancelled_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.agitation_mission_claims c
      WHERE c.mission_id = _mission_id
        AND c.user_id = n.user_id
        AND (c.completed_at IS NOT NULL OR c.cancelled_at IS NULL)
    );
END $function$;

CREATE OR REPLACE FUNCTION public.claim_mission_batch(_mission_id uuid)
 RETURNS TABLE(claim_id uuid, task_ids uuid[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF EXISTS (
    SELECT 1 FROM public.agitation_mission_claims
    WHERE mission_id = _mission_id AND user_id = v_user_id
      AND completed_at IS NULL AND cancelled_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Você já tem uma leva em aberto nesta missão — conclua ou avise que concluiu antes de pegar mais.';
  END IF;

  SELECT MAX(completed_at) INTO v_last_completed
  FROM public.agitation_mission_claims
  WHERE mission_id = _mission_id AND user_id = v_user_id
    AND completed_at IS NOT NULL AND cancelled_at IS NULL;

  IF v_last_completed IS NOT NULL
     AND now() < v_last_completed + make_interval(mins => v_mission.cooldown_minutes) THEN
    RAISE EXCEPTION 'Aguarde o cooldown (% min) antes de pegar mais.', v_mission.cooldown_minutes;
  END IF;

  INSERT INTO public.agitation_mission_claims (mission_id, user_id, task_count)
  VALUES (_mission_id, v_user_id, 0)
  RETURNING id INTO v_new_claim;

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
END $function$;

CREATE OR REPLACE FUNCTION public.assign_mission_direct(_mission_id uuid, _user_id uuid, _count integer)
 RETURNS TABLE(claim_id uuid, task_ids uuid[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  WHERE mission_id = _mission_id AND user_id = _user_id
    AND completed_at IS NULL AND cancelled_at IS NULL
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
END $function$;

CREATE OR REPLACE FUNCTION public.assign_mission_tasks_to_user(_mission_id uuid, _user_id uuid, _task_ids uuid[])
 RETURNS TABLE(claim_id uuid, task_ids uuid[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  WHERE mission_id = _mission_id AND user_id = _user_id
    AND completed_at IS NULL AND cancelled_at IS NULL
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
END $function$;