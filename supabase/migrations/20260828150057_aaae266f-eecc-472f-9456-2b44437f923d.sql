-- Permite vincular uma automação (usada hoje pela mensagem de confirmação de
-- formulário) a um template aprovado pela Meta. Fora da janela de 24h a Meta só
-- aceita reabrir a conversa com um template aprovado — hoje a automação apenas
-- pula o envio nesse caso (ver automations.server.ts). Nullable e sem default:
-- automações existentes continuam se comportando exatamente como hoje até
-- alguém escolher um template explicitamente. Mesmo padrão já usado em
-- campaigns.whatsapp_template_id.
alter table public.automations
  add column whatsapp_template_id uuid references public.whatsapp_templates(id) on delete set null;
