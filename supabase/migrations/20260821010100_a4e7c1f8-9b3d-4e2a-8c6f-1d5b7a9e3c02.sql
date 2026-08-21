-- Liga campanhas em massa a um Template Oficial (Meta) — usado só pra
-- contatos fora da janela de 24h de atendimento, onde texto livre não é mais
-- aceito pela Meta e é preciso reabrir a conversa com um template aprovado.
-- Não confundir com campaigns.template_id (message_templates — biblioteca de
-- texto livre, tabela e finalidade diferentes).
ALTER TABLE public.campaigns
  ADD COLUMN whatsapp_template_id uuid REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL;
