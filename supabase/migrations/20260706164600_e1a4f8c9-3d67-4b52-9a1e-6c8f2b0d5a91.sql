-- Guarda o papel sugerido pelo link de auto-cadastro usado (ex.: .../cadastro-usuario?role=vrm),
-- para a tela de aprovação pré-selecionar o papel na hora de um admin aprovar. É só uma
-- sugestão — o admin ainda escolhe o papel de verdade na aprovação. Nulo para cadastros
-- antigos e para contas criadas pelo fluxo de convite por e-mail.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS requested_role public.app_role;
