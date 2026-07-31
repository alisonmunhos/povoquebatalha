## Diagnóstico (confirmado no banco)

Missão afetada: **Convite plenaria** (`f02f228a…`).

Três agitadores pegaram leva hoje:

| Agitador | Pegou leva | "Concluiu" | Contatos marcados |
|---|---|---|---|
| Diego Masiero | 14:28 | 14:50:14.904 | 0 |
| Alison Munhos | 14:44 | 14:50:14.904 | 0 |
| Ezequiel Viapiana | 14:46 | 14:50:14.904 | 0 |

O horário de conclusão é **idêntico ao milissegundo** nos três: nenhum deles clicou em "concluí". Foi uma ação em massa às 14:50 — a função do banco `release_mission_pending` (botão do painel do admin que "libera atribuições paradas").

Essa função faz duas coisas ao mesmo tempo:

1. **Desatribui todas as tarefas pendentes** da missão (`assigned_user_id = NULL`, `claim_id = NULL`) — inclusive as de levas recém-pegas e ainda intactas. Hoje a missão tem 240 tarefas pendentes, todas sem responsável.
2. **Marca todas as levas abertas como concluídas** (`completed_at = now()`).

Consequências exatas do que o usuário relatou:

- **"Ver missão" não abre nada**: a tela do agitador lista as tarefas com `assigned_user_id = eu`. Como a função apagou a atribuição, a leva ficou vazia.
- **Cooldown sem ter enviado**: o cooldown é calculado a partir do último `completed_at` da leva. Como a função marcou 14:50 como conclusão, os três entraram em 1 hora de espera imediatamente.
- **Painel do admin diz que Ezequiel concluiu**: o painel lê exatamente esse `completed_at`, sem olhar se alguma mensagem foi de fato marcada.

Nenhum dado real de envio foi perdido — as 5 marcações "não enviado" da Marina continuam lá. O que existe é registro falso de conclusão.

## Correções propostas

### 1. Reparar a missão atual (sem refazer)

Migration que apaga as três levas fantasma de hoje (Diego, Alison, Ezequiel — conclusão forçada às 14:50 e zero contatos marcados). Efeito: cooldown zerado, os três podem pegar leva na hora, painel do admin deixa de mostrar conclusão falsa. As 240 tarefas seguem disponíveis.

### 2. Corrigir a função de liberação (causa raiz)

Reescrever `release_mission_pending` para:

- **Não** encostar em levas abertas que ainda estão dentro de um prazo razoável de trabalho. Só libera tarefas de levas abertas **antigas** (parâmetro de idade, padrão 24h) ou de levas já concluídas.
- Nunca marcar leva como concluída para "destravar cooldown". Em vez disso, levas liberadas passam a ser **canceladas** (nova coluna `cancelled_at`), o que zera o cooldown sem inventar conclusão.
- Cooldown e contagens passam a considerar apenas levas concluídas de verdade (`completed_at` e não cancelada).

### 3. Confiabilidade do painel do admin

- Coluna de leva mostra três estados distintos: **Em andamento**, **Concluída (N enviados)**, **Liberada pelo admin** — nunca "concluída" sem envio.
- O número exibido passa a vir da contagem real de tarefas com status `concluido`/`nao_enviado`/`erro_numero`, não do `task_count` da leva.
- Botão de liberação com confirmação explícita informando quantos agitadores e quantos contatos serão afetados.

### 4. Confiabilidade da tela do agitador

- Se a leva do agitador foi liberada pelo admin, a tela mostra aviso claro ("Sua leva foi liberada pela organização — pegue uma nova") em vez de tela vazia ou cooldown silencioso.
- "Ver missão" com zero tarefas atribuídas passa a cair na ação "Pegar nova leva" quando há contatos disponíveis, em vez de abrir tela vazia.

## Detalhes técnicos

- Migration: `agitation_mission_claims.cancelled_at timestamptz`; reescrita de `release_mission_pending(_mission_id uuid, _older_than_hours int default 24)`; DELETE pontual das 3 levas fantasma da missão `f02f228a…`.
- `src/lib/agitation-missions.functions.ts`: filtrar `cancelled_at is null` em `getMissionNotificationBriefing`, `getMissionCooldownStatus`, `listMyMissions`; em `getMissionRecipientsPanel` derivar contagens reais por `agitation_tasks`.
- `src/routes/_authenticated/missoes-agitacao.$missionId.tsx` e `minhas-missoes.tsx`: estados e textos novos.
- Nenhum dado de contato é apagado.
