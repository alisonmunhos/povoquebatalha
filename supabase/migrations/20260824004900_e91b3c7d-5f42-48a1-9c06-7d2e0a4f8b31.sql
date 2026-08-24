-- A migration 20260822231900 trocou (ALTER POLICY, substituindo) a condição
-- de leitura de inbound_messages/campaign_recipients de is_member() para
-- has_inbox_access() — sem perceber, isso tirou o acesso de quem tinha papel
-- (ex.: agitador) mas não tem has_inbox_access. Aqui SOMAMOS uma policy nova
-- com is_member(), sem tocar na policy existente com has_inbox_access():
-- políticas permissivas do mesmo comando são combinadas com OR pelo Postgres,
-- então o resultado final é is_member() OR has_inbox_access() — ninguém que
-- já lia essas tabelas perde acesso, e quem ganhou acesso pela flag de perfil
-- continua tendo.
CREATE POLICY "inbound members read (is_member)" ON public.inbound_messages
  FOR SELECT
  USING (private.is_member(auth.uid()));

CREATE POLICY "recipients members read (is_member)" ON public.campaign_recipients
  FOR SELECT
  USING (private.is_member(auth.uid()));
