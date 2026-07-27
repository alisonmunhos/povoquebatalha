-- Agrupa notificações enviadas em lote (1 batch_id por envio).
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS batch_id uuid NULL;

CREATE INDEX IF NOT EXISTS notifications_batch_id_idx
  ON public.notifications (batch_id)
  WHERE batch_id IS NOT NULL;

-- Atualiza notify_mission_targets para aceitar batch_id compartilhado.
CREATE OR REPLACE FUNCTION public.notify_mission_targets(
  _mission_id uuid,
  _user_ids uuid[],
  _title text,
  _body text,
  _batch_id uuid DEFAULT NULL
) RETURNS SETOF public.notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id uuid := COALESCE(_batch_id, gen_random_uuid());
BEGIN
  IF NOT private.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  RETURN QUERY
  INSERT INTO public.notifications
    (user_id, title, body, kind, cta_label, cta_kind, cta_payload, mission_id, created_by, batch_id)
  SELECT
    uid, _title, _body, 'mission',
    'Abrir missão', 'mission',
    jsonb_build_object('mission_id', _mission_id),
    _mission_id, auth.uid(), v_batch_id
  FROM unnest(_user_ids) uid
  RETURNING *;
END $$;

GRANT EXECUTE ON FUNCTION public.notify_mission_targets(uuid, uuid[], text, text, uuid) TO authenticated;