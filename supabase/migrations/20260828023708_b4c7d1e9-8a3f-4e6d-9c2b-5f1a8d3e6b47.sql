-- Confiabilidade do webhook do WhatsApp: a Meta reenvia o mesmo webhook em
-- caso de timeout, e hoje inbound_messages só tem um índice comum (não
-- único) em wa_message_id — o reenvio duplica a mensagem no Inbox.
--
-- Antes de criar a constraint, zera o wa_message_id (mantém a linha e todo
-- o resto do conteúdo — nada é apagado) das cópias duplicadas mais recentes
-- de cada grupo. Na prática isso só afetou dados históricos de um formato
-- de webhook já removido do código (tipo "ReceivedCallback", que não existe
-- mais em nenhuma rota atual) — sem isso a constraint não consegue ser
-- criada, porque duplicatas já existentes bloqueiam um UNIQUE novo.
with dups as (
  select id, row_number() over (
    partition by wa_message_id order by received_at asc, id asc
  ) as rn
  from public.inbound_messages
  where wa_message_id is not null
)
update public.inbound_messages m
set wa_message_id = null
from dups
where dups.id = m.id and dups.rn > 1;

-- wa_message_id passa a ser único (NULLs continuam permitidos e não contam
-- como duplicata entre si — mensagens sem id, se houver, não são afetadas).
alter table public.inbound_messages
  add constraint inbound_messages_wa_message_id_key unique (wa_message_id);

-- O índice comum antigo fica redundante: a constraint acima já cria um
-- índice único equivalente, que serve pras mesmas buscas.
drop index if exists public.inbound_messages_wa_message_id_idx;
