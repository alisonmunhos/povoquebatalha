-- Controla, na tela de sucesso pública, qual bloco aparece primeiro quando a
-- mensagem de confirmação automática e o botão "Avisar no WhatsApp" estão os dois
-- ativos ao mesmo tempo (as duas coisas continuam tecnicamente independentes — isso
-- é só sobre a narrativa da ordem de exibição, não cria nenhuma dependência real).
ALTER TABLE public.form_definitions
  ADD COLUMN IF NOT EXISTS success_screen_order text NOT NULL DEFAULT 'whatsapp_first'
    CHECK (success_screen_order IN ('whatsapp_first', 'confirmation_first'));
