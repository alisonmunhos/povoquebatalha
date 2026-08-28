-- Correção retroativa da janela de 24h (auditoria pontual, 28/08).
--
-- Investigação: o trigger conv_sync_from_inbound (migration 20260824100547,
-- que introduziu a coluna conversations.last_inbound_at) já ancora a janela
-- SEMPRE no timestamp da mensagem inbound mais recente, via
-- GREATEST(last_inbound_at atual, novo received_at) a cada INSERT em
-- inbound_messages — nunca no horário de uma resposta da equipe (outbound
-- não toca essa coluna em nenhum trigger). Auditoria completa na tabela
-- conversations (28/08) não encontrou nenhuma divergência entre
-- last_inbound_at e o real último inbound por contato/telefone, em nenhuma
-- linha — ou seja, o mecanismo já está correto hoje.
--
-- Esta migration roda mesmo assim a correção retroativa pedida, de forma
-- idempotente e escopada exatamente como especificado (só contatos com
-- mensagem inbound recebida nas últimas 24h) — serve como evidência
-- auditável da checagem e como rede de segurança caso surja alguma
-- divergência pontual no futuro (nenhuma linha deve ser afetada hoje).
UPDATE public.conversations c
SET last_inbound_at = s.real_last, updated_at = now()
FROM (
  SELECT contact_id, from_phone, MAX(received_at) AS real_last
  FROM public.inbound_messages
  WHERE contact_id IS NOT NULL OR from_phone IS NOT NULL
  GROUP BY contact_id, from_phone
) s
WHERE c.contact_id IS NOT DISTINCT FROM s.contact_id
  AND c.from_phone IS NOT DISTINCT FROM s.from_phone
  AND s.real_last > now() - interval '24 hours'
  AND c.last_inbound_at IS DISTINCT FROM s.real_last;
