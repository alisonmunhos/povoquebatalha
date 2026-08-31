-- Etapa 6: envio de template avulso direto do Inbox (sem criar campanha).
-- direct_messages já grava o conteúdo final de tudo que é enviado por essa
-- via — header_type/header_text seguem o mesmo padrão: guardam o cabeçalho
-- do template JÁ renderizado (com as variáveis substituídas), não uma
-- referência a whatsapp_templates. `buttons` (adicionada na Etapa 4) passa a
-- também ser usada aqui, com os botões do próprio template aprovado.
ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS header_type text,
  ADD COLUMN IF NOT EXISTS header_text text;
