-- Alinha o acesso de leitura de inbound_messages e campaign_recipients ao
-- mesmo padrão já usado em automation_deliveries e direct_messages: quem tem
-- a flag avulsa "Acesso ao Inbox" (profiles.inbox_access) enxerga essas duas
-- tabelas também, não só cargo de staff. Antes usavam private.is_member(),
-- que não olha a flag — só INSERT/UPDATE/DELETE não são alterados aqui.
ALTER POLICY "inbound members read" ON public.inbound_messages
  USING (private.has_inbox_access(auth.uid()));

ALTER POLICY "recipients members read" ON public.campaign_recipients
  USING (private.has_inbox_access(auth.uid()));
