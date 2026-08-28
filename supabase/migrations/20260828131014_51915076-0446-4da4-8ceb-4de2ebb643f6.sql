-- message_templates (mensagens de texto livre — respostas prontas e mensagens
-- do sistema) ganha suporte a botões, reaproveitando o mesmo formato jsonb já
-- usado em whatsapp_templates.buttons. Só o tipo QUICK_REPLY (resposta rápida)
-- é aceito aqui: a Cloud API só permite enviar botões múltiplos em mensagem de
-- texto livre via mensagem interativa do tipo "reply" — URL/PHONE_NUMBER só
-- existem no componente BUTTONS de um template aprovado pela Meta.
alter table public.message_templates
  add column buttons jsonb not null default '[]'::jsonb;
