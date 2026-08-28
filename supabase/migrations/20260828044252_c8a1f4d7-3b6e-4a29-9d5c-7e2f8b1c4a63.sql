-- automation_deliveries.status só aceitava queued/sent/error/skipped. O
-- webhook do WhatsApp Cloud API passa a reportar, de forma assíncrona,
-- quando um envio marcado "sent" (a Meta aceitou na hora, devolveu wamid)
-- falhou de verdade na entrega (ex.: erro 131047, janela de 24h fechada) —
-- precisa de um status novo, "failed", pra não confundir com "error"
-- (falha síncrona no próprio disparo).
alter table public.automation_deliveries
  drop constraint automation_deliveries_status_check;

alter table public.automation_deliveries
  add constraint automation_deliveries_status_check
  check (status = any (array['queued', 'sent', 'error', 'skipped', 'failed']));
