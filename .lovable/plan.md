## Objetivo

Impedir que um agitador acumule contatos pegando várias levas seguidas sem concluir a anterior.

## 1. Banco — `claim_mission_batch`

Nova migration que recria a função com uma checagem adicional, logo após as validações de missão/elegibilidade e antes do cálculo de cooldown:

- Se existir `agitation_mission_claims` com `mission_id`, `user_id = auth.uid()` e `completed_at IS NULL`, interromper com mensagem clara:
  "Você já tem uma leva em aberto nesta missão — conclua ou avise que concluiu antes de pegar mais."
- Com isso, o trecho que reaproveitava a leva aberta deixa de ser alcançável: a função sempre cria uma leva nova (após cooldown respeitado).
- Nada mais muda: elegibilidade, pausa, arquivamento, cooldown e a seleção `FOR UPDATE SKIP LOCKED` continuam iguais.
- `assign_mission_direct` e `assign_mission_tasks_to_user` (atribuição feita pelo coordenador) **não** mudam — o admin continua podendo somar tarefas.

## 2. Servidor — `getMissionCooldownStatus`

Em `src/lib/agitation-missions.functions.ts`:

- Consultar também se há leva aberta (`completed_at is null`) do usuário na missão.
- Incluir no retorno `has_open_claim: boolean` e um `block_reason` (`"leva_aberta" | "cooldown" | "sem_contatos" | null`).
- `can_claim` passa a ser falso quando há leva aberta.

## 3. Interface — Minhas Missões

Em `src/routes/_authenticated/minhas-missoes.tsx`, quando o motivo do bloqueio for leva aberta, mostrar aviso próprio ("Você tem uma leva em aberto — conclua antes de pegar mais") em vez da mensagem de cooldown ou de "sem contatos disponíveis".

## Verificação

- Typecheck do projeto.
- Cenário: pegar uma leva → tentar pegar de novo sem concluir → recusa com mensagem clara e botão bloqueado na tela; após "Avisar que concluí", o cooldown normal volta a valer.
