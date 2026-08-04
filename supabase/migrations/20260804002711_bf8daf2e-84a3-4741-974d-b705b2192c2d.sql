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

  -- Auto-cura: levas em aberto que ficaram sem nenhum contato vinculado
  -- (ex.: contatos devolvidos para a fila) não devem travar a pessoa.
  UPDATE public.agitation_mission_claims c
  SET completed_at = now(), task_count = 0
  WHERE c.mission_id = _mission_id
    AND c.user_id = v_user_id
    AND c.completed_at IS NULL
    AND c.cancelled_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.agitation_tasks t WHERE t.claim_id = c.id);

  IF EXISTS (
    SELECT 1 FROM public.agitation_mission_claims
    WHERE mission_id = _mission_id AND user_id = v_user_id
      AND completed_at IS NULL AND cancelled_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Você já tem uma leva em aberto nesta missão — abra sua missão para continuar.';
  END IF;

  -- Cooldown: ignora levas vazias que acabaram de ser auto-concluídas.
  SELECT MAX(c.completed_at) INTO v_last_completed
  FROM public.agitation_mission_claims c
  WHERE c.mission_id = _mission_id AND c.user_id = v_user_id
    AND c.completed_at IS NOT NULL AND c.cancelled_at IS NULL
    AND EXISTS (SELECT 1 FROM public.agitation_tasks t WHERE t.claim_id = c.id);

  IF v_last_completed IS NOT NULL
     AND now() < v_last_completed + make_interval(mins => v_mission.cooldown_minutes) THEN
    RAISE EXCEPTION 'Aguarde o cooldown (% min) antes de pegar mais.', v_mission.cooldown_minutes;
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_task_ids
  FROM (
    SELECT id
    FROM public.agitation_tasks
    WHERE mission_id = _mission_id
      AND assigned_user_id IS NULL
      AND assigned_contact_id IS NULL
      AND status = 'sem_acao'
    ORDER BY created_at
    LIMIT v_mission.batch_size
    FOR UPDATE SKIP LOCKED
  ) available;

  IF COALESCE(array_length(v_task_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Não há contatos disponíveis nesta missão agora.';
  END IF;

  INSERT INTO public.agitation_mission_claims (mission_id, user_id, task_count)
  VALUES (_mission_id, v_user_id, array_length(v_task_ids, 1))
  RETURNING id INTO v_new_claim;

  UPDATE public.agitation_tasks
  SET assigned_user_id = v_user_id,
      claim_id = v_new_claim,
      assigned_to_user_at = now()
  WHERE id = ANY(v_task_ids);

  claim_id := v_new_claim;
  task_ids := v_task_ids;
  RETURN NEXT;
END $function$;