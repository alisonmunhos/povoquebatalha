-- Permite vincular um Fluxo de WhatsApp a um template aprovado pela Meta, usado
-- para a mensagem de abertura (Etapa 5 da Central de Mensagens). Dentro da
-- janela de 24h o texto do template é replicado como mensagem livre; fora da
-- janela é enviado de fato via template aprovado (só ele reabre a conversa
-- nesse caso). Sem template configurado, a abertura é pulada. Nullable e sem
-- default: fluxos existentes ficam sem template até alguém escolher um.
alter table public.whatsapp_flows
  add column whatsapp_template_id uuid references public.whatsapp_templates(id) on delete set null;
