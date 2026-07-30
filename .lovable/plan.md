## Diagnóstico (verificado no código)

**Como funcionava antes** (tela pública `/missao/$missionId/contato/$contactId`, ainda existe e funciona assim):
- Lista **todos** os contatos da leva, agrupados por data.
- Cada contato mostra um selo de status ("Concluído" / "Não enviado") e **os botões continuam ativos** — dá pra reenviar ou corrigir a marcação.
- Nada some da tela.

**Como está hoje** (tela logada `/minhas-missoes`, arquivo `src/routes/_authenticated/minhas-missoes.tsx`):
- A lista renderiza apenas `tasks.filter(t => !t.completed_at && t.status === "pending")`.
- O botão "Enviar" abre o WhatsApp e, logo em seguida, chama `markMyMissionTask` com status `concluido` — sem perguntar nada.
- Resultado: assim que você clica em "Enviar" (mesmo sem enviar de fato no WhatsApp), a tarefa vira `concluido` e **desaparece da tela**. O mesmo vale para "Não enviei" (`nao_enviado`), que também some.

Ou seja: não é perda de dados — as tarefas continuam no banco com o novo status; a tela é que esconde tudo que não está `pending`.

## O que vou fazer

Trazer o comportamento antigo para a tela logada, sem mexer no banco nem na auto-atribuição.

1. **Não sumir mais nada**: a leva passa a listar todas as tarefas atribuídas, com selo de status (Pendente / Aguardando confirmação / Enviado / Não enviei).
2. **Clicar em "Enviar" deixa de concluir sozinho**: abrir o WhatsApp muda a tarefa só para "aguardando confirmação" (estado local, sem gravar `concluido`), e o card mostra dois botões claros: **"Enviei"** e **"Não consegui enviar"**. Só o clique em "Enviei" grava `concluido`.
3. **Poder corrigir**: qualquer tarefa já marcada continua com os botões ativos — "Reabrir WhatsApp" e trocar a marcação (de "Não enviei" para "Enviei" e vice-versa).
4. **Contadores coerentes**: o cabeçalho da missão mostra total / enviados / pendentes / não enviados, e o botão "Avisar que concluí" continua alertando sobre pendentes.
5. Mesma lógica aplicada de forma consistente com a tela pública, para as duas se comportarem igual.

## Detalhes técnicos

- Arquivo principal: `src/routes/_authenticated/minhas-missoes.tsx` (remoção do filtro `pendingTasks` na renderização, novo estado local `awaitingConfirm: Set<taskId>`, novos botões).
- `markMyMissionTask` em `src/lib/agitation-missions.functions.ts` já aceita `concluido` e `nao_enviado` e limpa `completed_at` quando não é concluído — serve para desfazer, sem alteração de schema.
- Sem migration, sem mudança em `claim_mission_batch` nem no cooldown.
