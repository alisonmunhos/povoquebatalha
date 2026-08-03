# Limpar as notificações de teste antigas

## O que está acontecendo

Na tela de Notificações da Agitação, cada envio aparece como um item só quando as notificações
foram criadas juntas com um mesmo identificador de lote. As notificações antigas
("Notificação de teste!" e "Teste") foram criadas antes desse agrupamento existir, então cada
pessoa que recebeu virou um item separado — por isso só dá para cancelar uma por uma.

Situação real hoje no banco:

- "Notificação de teste!" — 25 notificações, 24 ainda ativas
- "Teste" — 38 notificações, 36 ainda ativas

## O que vou fazer

1. Cancelar em bloco, direto nos dados, todas as notificações ativas com os títulos
   "Notificação de teste!" e "Teste". Elas passam a ficar como "Cancelada", igual ao que
   acontece quando você cancela manualmente — nada é apagado, o histórico continua registrado.
2. Adicionar na tela de Notificações da Agitação uma ação "Cancelar todas com este título",
   para que qualquer grupo antigo sem lote possa ser cancelado de uma vez no futuro.
   A ação mostra quantas notificações serão afetadas antes de confirmar.

## Detalhes técnicos

- Atualização de dados: `notifications` → `cancelled_at = now()` onde `title` está na lista de
  títulos de teste, `kind = 'custom'` e `cancelled_at is null`. Sem DELETE.
- Nova função de servidor em `src/lib/notifications.functions.ts` (ex.: `cancelNotificationsByTitle`),
  protegida por autenticação + checagem de staff, no mesmo padrão de `cancelNotificationBatch`.
- Botão/confirmação em `src/routes/_authenticated/agitacao-notificacoes.tsx`, reaproveitando o
  fluxo de cancelamento já existente e invalidando as consultas da lista.
