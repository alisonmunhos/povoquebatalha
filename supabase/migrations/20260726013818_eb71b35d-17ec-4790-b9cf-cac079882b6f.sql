-- ============ agitation_tasks: agitador dono + leva + timestamps ============
ALTER TABLE public.agitation_tasks
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claim_id uuid REFERENCES public.agitation_mission_claims(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to_user_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_agitation_tasks_assigned_user
  ON public.agitation_tasks(mission_id, assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_agitation_tasks_unclaimed
  ON public.agitation_tasks(mission_id) WHERE assigned_user_id IS NULL AND status = 'pending';
CREATE INDEX IF NOT EXISTS idx_agitation_tasks_claim ON public.agitation_tasks(claim_id);

-- Agitador dono da task pode ler/atualizar a própria (RLS)
DROP POLICY IF EXISTS "assignee_read_own_tasks" ON public.agitation_tasks;
CREATE POLICY "assignee_read_own_tasks" ON public.agitation_tasks
  FOR SELECT TO authenticated
  USING (assigned_user_id = auth.uid());
DROP POLICY IF EXISTS "assignee_update_own_tasks" ON public.agitation_tasks;
CREATE POLICY "assignee_update_own_tasks" ON public.agitation_tasks
  FOR UPDATE TO authenticated
  USING (assigned_user_id = auth.uid())
  WITH CHECK (assigned_user_id = auth.uid());

-- ============ notifications: cancelamento ============
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_notifications_active
  ON public.notifications(user_id, created_at DESC) WHERE cancelled_at IS NULL;

-- ============ claim_mission_batch: pega lote atomicamente ============
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
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT * INTO v_mission FROM public.agitation_missions WHERE id = _mission_id;
  IF v_mission.id IS NULL THEN RAISE EXCEPTION 'Missão não encontrada'; END IF;
  IF v_mission.paused_at IS NOT NULL THEN RAISE EXCEPTION 'Missão está pausada'; END IF;
  IF NOT v_mission.is_open THEN RAISE EXCEPTION 'Missão não é aberta para auto-atribuição'; END IF;

  -- checa cooldown com base na última claim concluída do usuário
  SELECT MAX(completed_at) INTO v_last_completed
  FROM public.agitation_mission_claims
  WHERE mission_id = _mission_id AND user_id = v_user_id AND completed_at IS NOT NULL;

  IF v_last_completed IS NOT NULL
     AND now() < v_last_completed + make_interval(mins => v_mission.cooldown_minutes) THEN
    RAISE EXCEPTION 'Aguarde o cooldown (% min) antes de pegar mais.', v_mission.cooldown_minutes;
  END IF;

  -- se já existe claim aberta, retorna ela em vez de abrir outra
  SELECT id INTO v_new_claim
  FROM public.agitation_mission_claims
  WHERE mission_id = _mission_id AND user_id = v_user_id AND completed_at IS NULL
  LIMIT 1;

  IF v_new_claim IS NULL THEN
    INSERT INTO public.agitation_mission_claims (mission_id, user_id, task_count)
    VALUES (_mission_id, v_user_id, 0)
    RETURNING id INTO v_new_claim;
  END IF;

  -- pega batch_size tasks sem dono, com SKIP LOCKED para evitar corrida
  WITH picked AS (
    SELECT id FROM public.agitation_tasks
    WHERE mission_id = _mission_id
      AND assigned_user_id IS NULL
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
  SET task_count = task_count + array_length(v_task_ids, 1)
  WHERE id = v_new_claim AND array_length(v_task_ids, 1) IS NOT NULL;

  claim_id := v_new_claim;
  task_ids := v_task_ids;
  RETURN NEXT;
END $$;

GRANT EXECUTE ON FUNCTION public.claim_mission_batch(uuid) TO authenticated;

-- ============ assign_mission_direct: admin atribui a uma pessoa específica ============
CREATE OR REPLACE FUNCTION public.assign_mission_direct(_mission_id uuid, _user_id uuid, _count int)
RETURNS TABLE(claim_id uuid, task_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_claim uuid;
  v_task_ids uuid[];
BEGIN
  IF NOT private.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

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

GRANT EXECUTE ON FUNCTION public.assign_mission_direct(uuid, uuid, int) TO authenticated;

-- ============ complete_mission_claim: agitador marca leva concluída ============
CREATE OR REPLACE FUNCTION public.complete_mission_claim(_claim_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_claim public.agitation_mission_claims;
BEGIN
  SELECT * INTO v_claim FROM public.agitation_mission_claims WHERE id = _claim_id;
  IF v_claim.id IS NULL THEN RAISE EXCEPTION 'Leva não encontrada'; END IF;
  IF v_claim.user_id <> v_user_id AND NOT private.is_staff(v_user_id) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  UPDATE public.agitation_mission_claims
  SET completed_at = COALESCE(completed_at, now())
  WHERE id = _claim_id;

  UPDATE public.agitation_tasks
  SET completed_at = COALESCE(completed_at, now()),
      status = CASE WHEN status = 'pending' THEN 'concluido' ELSE status END
  WHERE claim_id = _claim_id;
END $$;

GRANT EXECUTE ON FUNCTION public.complete_mission_claim(uuid) TO authenticated;

-- ============ release_mission_pending: interrupção da missão ============
CREATE OR REPLACE FUNCTION public.release_mission_pending(_mission_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT private.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  -- Cancela notificações da missão que ainda não foram lidas ou cuja claim não foi concluída
  UPDATE public.notifications n
  SET cancelled_at = now(), cancelled_by = auth.uid()
  WHERE n.mission_id = _mission_id
    AND n.cancelled_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.agitation_mission_claims c
      WHERE c.mission_id = _mission_id AND c.user_id = n.user_id AND c.completed_at IS NOT NULL
    );

  -- Libera tasks não concluídas (voltam pra "sem atribuição")
  UPDATE public.agitation_tasks
  SET assigned_user_id = NULL, claim_id = NULL, assigned_to_user_at = NULL
  WHERE mission_id = _mission_id
    AND completed_at IS NULL
    AND status = 'pending';

  -- Fecha claims abertas (marca como concluída para não bloquear cooldown de retomada)
  UPDATE public.agitation_mission_claims
  SET completed_at = now()
  WHERE mission_id = _mission_id AND completed_at IS NULL;
END $$;

GRANT EXECUTE ON FUNCTION public.release_mission_pending(uuid) TO authenticated;

-- ============ notify_mission_targets: cria linhas em notifications em bloco ============
CREATE OR REPLACE FUNCTION public.notify_mission_targets(
  _mission_id uuid,
  _user_ids uuid[],
  _title text,
  _body text
) RETURNS SETOF public.notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT private.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  RETURN QUERY
  INSERT INTO public.notifications
    (user_id, title, body, kind, cta_label, cta_kind, cta_payload, mission_id, created_by)
  SELECT
    uid, _title, _body, 'mission',
    'Abrir missão', 'mission',
    jsonb_build_object('mission_id', _mission_id),
    _mission_id, auth.uid()
  FROM unnest(_user_ids) uid
  RETURNING *;
END $$;

GRANT EXECUTE ON FUNCTION public.notify_mission_targets(uuid, uuid[], text, text) TO authenticated;