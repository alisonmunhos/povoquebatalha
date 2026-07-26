## Escopo

Unificar Missões de Agitação + Notificações usando os campos que já existem em `agitation_missions` (`batch_size`, `cooldown_minutes`, `is_open`, `coordinator_phone`, `whatsapp_message_template`, `instructions`), adicionar auto-atribuição atômica, atribuição direta, notificação automática, painel de visibilidade e cancelamento/interrupção.

## 1. Migration (banco)

Adicionar a `public.agitation_tasks`:
- `assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL`
- `claim_id uuid REFERENCES agitation_mission_claims(id) ON DELETE SET NULL`
- `assigned_to_user_at timestamptz`
- `completed_at timestamptz`
- índices em `(mission_id, assigned_user_id)` e `(mission_id, status) WHERE assigned_user_id IS NULL`
- policy adicional: `assigned_user_id = auth.uid()` pode SELECT/UPDATE suas próprias tasks

Adicionar a `public.notifications`:
- `cancelled_at timestamptz`
- `cancelled_by uuid REFERENCES auth.users(id)`
- índice parcial `WHERE cancelled_at IS NULL`

Nova função SQL `claim_mission_batch(_mission_id uuid, _user_id uuid)`:
- SECURITY DEFINER, checa `is_open=true`, `paused_at IS NULL`
- valida cooldown (última claim completa do usuário + `cooldown_minutes` já passou)
- faz `UPDATE agitation_tasks SET assigned_user_id=_user_id, claim_id=_new_claim, assigned_to_user_at=now() WHERE id IN (SELECT id FROM agitation_tasks WHERE mission_id=_mission_id AND assigned_user_id IS NULL AND status='pending' ORDER BY created_at LIMIT batch_size FOR UPDATE SKIP LOCKED)` (evita corrida)
- retorna claim_id + task_ids

Nova função `assign_mission_direct(_mission_id, _user_id, _count)` — mesma lógica sem checar is_open/cooldown, usada pelo modo pessoa-específica.

Nova função `release_mission_pending(_mission_id)` — usada por `pauseMission`: zera `assigned_user_id/claim_id` em tasks não concluídas + marca notifications da missão como canceladas + fecha claims abertas.

## 2. `src/lib/agitation-missions.functions.ts`

Estender `createAgitationMission` inputSchema com: `mode` ('open'|'direct'), `assignee_user_id` (quando direct), `batch_size`, `instructions`, `coordinator_phone`, `whatsapp_message_template`, `cooldown_minutes`. Salvar tudo. Se `mode='direct'`: chamar `assign_mission_direct` e criar notificação. Se `mode='open'`: criar notificação `kind='mission'` pra todos agitadores do público-alvo.

Novas server fns:
- `claimMissionBatch({ missionId })` → chama SQL, retorna tarefas atribuídas
- `completeMissionClaim({ claimId })` → marca claim.completed_at + tasks.completed_at
- `listMyActiveMissionTasks()` → tasks atribuídas ao user atual não concluídas
- `getMissionCooldownStatus({ missionId })` → retorna se pode pegar mais e quando libera
- `getMissionRecipientsPanel({ missionId })` → admin, lista destinatários das notificações da missão com read_at/cancelled_at
- Estender `pauseMission` → chama `release_mission_pending`

## 3. `src/lib/notifications.functions.ts`

- Filtrar `cancelled_at IS NULL` em `listMyNotifications` e `countMyUnread`
- Nova `cancelNotification({ id })` (staff-only): seta `cancelled_at`
- Nova `getNotificationRecipients({ ...criteria })` admin (usada pelo painel)

## 4. UI — `CreateMissionModal`

Adicionar seções:
- Radio "Aberta pra agitação" vs "Atribuir a pessoa específica" (reutiliza `listAgitadorCandidates`)
- Campo `batch_size` (default 10)
- Textarea `instructions`
- Bloco "Ao concluir": input telefone `coordinator_phone` + textarea `whatsapp_message_template`
- Number `cooldown_minutes` (default 60)

## 5. UI — Tela do agitador

Nova rota `/_authenticated/minhas-missoes` (ou reuso do detalhe existente) que:
- Lista missões em que o user tem claim aberta OU tasks atribuídas
- Mostra `instructions`, lista de contatos daquela leva com link pra tela de envio existente
- Botão "Avisar que concluí" → `wa.me/<coordinator_phone>?text=<template>` + marca claim como completa
- Se missão aberta: botão "Pegar mais X contatos" (respeita cooldown, mostra aviso "confira sua taxa de resposta antes de pegar mais" acima do botão)

Notificação `kind='mission'` no sino → CTA leva pra essa tela.

## 6. Painel admin de visibilidade

Dentro de `/_authenticated/missoes-agitacao/$missionId`, aba/seção "Destinatários":
- Tabela: nome do agitador · notificado em · abriu em (`read_at`) · status (pendente/aberta/cancelada) · tasks atribuídas · concluídas
- Também acessível na tela de admin de notificações para notificações avulsas

## 7. Interrupção

`pauseMission` estendida chama `release_mission_pending(mission_id)` que: (a) cancela notifications pendentes da missão (não abertas OU abertas mas claim não concluída), (b) fecha claims abertas com nota, (c) libera tasks não concluídas (`assigned_user_id=NULL, claim_id=NULL`). Painel admin passa a mostrar essas como "canceladas".

## Detalhes técnicos

- Concorrência: `FOR UPDATE SKIP LOCKED` no CTE de seleção de tasks, tudo dentro de uma função plpgsql (uma transação).
- Notificações são criadas em bloco direto pela server fn de missão (sem passar por `createNotification`); web push é disparado no mesmo bloco reusando `sendWebPush` + `push_subscriptions`.
- Aba admin de visibilidade também respeita `cancelled_at` mostrando ainda a linha, com badge "cancelada".
- Não altera fluxo `/missao/$missionId/contato/$contactId` (link público antigo) — segue em paralelo.

## Entrega

10 arquivos afetados aprox.: 1 migration, `agitation-missions.functions.ts`, `notifications.functions.ts`, `CreateMissionModal.tsx`, nova página do agitador, `missoes-agitacao.$missionId.tsx` (aba destinatários), `NotificationBell.tsx` (CTA mission), 1 componente de painel de destinatários, ajustes menores no auth/tipos.
