-- Número de destino do botão "Avisar no WhatsApp" fica configurável por formulário
-- (antes era sempre numero_conectado, o número da instância Z-API conectada).
-- O DEFAULT também faz o backfill dos formulários já existentes (incluindo os fixos).
ALTER TABLE public.form_definitions
  ADD COLUMN IF NOT EXISTS whatsapp_button_phone text NOT NULL DEFAULT '+5551981951545';
