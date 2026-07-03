-- Adiciona valor "pendente_aprovacao" ao enum user_access_status para suportar
-- o fluxo de auto-cadastro de agitadores que aguarda aprovação de um admin.
-- Aditivo: não altera valores existentes nem dados.
ALTER TYPE public.user_access_status ADD VALUE IF NOT EXISTS 'pendente_aprovacao';