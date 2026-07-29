-- Fase 2: botão "Ativar notificações" na tela de sucesso do formulário.

ALTER TABLE public.form_definitions
  ADD COLUMN IF NOT EXISTS push_button_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.form_sections
  ADD COLUMN IF NOT EXISTS push_button_enabled boolean;
