-- Marca formulários fixos (recadastro/inscrever) na tabela do construtor,
-- pra eles não poderem ser excluídos pela tela "Entrada de Dados".
ALTER TABLE public.form_definitions
  ADD COLUMN IF NOT EXISTS is_fixed boolean NOT NULL DEFAULT false;
