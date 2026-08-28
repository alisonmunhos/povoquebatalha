-- A abertura de fluxo (whatsapp-flow.server.ts::sendFlowOpening, Etapa 5 da
-- Central de Mensagens) grava status "pulado" em direct_messages quando o
-- fluxo não tem template aprovado configurado — mas direct_messages_status_check
-- só permitia enviado/erro/cancelado. O insert falhava a constraint em toda
-- tentativa de "pular e logar" (erro engolido pelo try/catch que protege o
-- fluxo de cair por causa do histórico, então não travava nada — só fazia o
-- registro de skip nunca ser gravado de verdade). Estende a constraint pra
-- aceitar "pulado", mesmo padrão de nome já usado no fluxo de automações
-- (automation_deliveries.status já tem um valor equivalente, "skipped").
alter table public.direct_messages
  drop constraint direct_messages_status_check;

alter table public.direct_messages
  add constraint direct_messages_status_check
  check (status = any (array['enviado', 'erro', 'cancelado', 'pulado']));
