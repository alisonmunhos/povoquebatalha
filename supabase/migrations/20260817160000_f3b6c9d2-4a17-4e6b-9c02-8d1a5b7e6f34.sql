-- Suporte a botões (componente BUTTONS da Meta) nos templates oficiais.
-- Formato: array de objetos { type: "URL"|"QUICK_REPLY"|"PHONE_NUMBER", text,
-- url?, phone_number? }, mesmo shape usado no componente BUTTONS que a Meta
-- devolve/aceita em POST e GET .../message_templates.
ALTER TABLE public.whatsapp_templates
  ADD COLUMN buttons jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.whatsapp_templates
  ADD CONSTRAINT whatsapp_templates_buttons_max_chk
    CHECK (jsonb_typeof(buttons) = 'array' AND jsonb_array_length(buttons) <= 3);
