# Agitação v2 — Fases B a E

Antes de codar tudo, quero confirmar o escopo de cada fase pra não gastar créditos com algo fora do que você imagina.

## Fase B — Central de Notificações (punho pulsante)

- Novo componente `NotificationBell` no header (`AppShell`) com o ícone do punho da marca. Pulsa em amarelo quando há notificação não lida.
- Nova tabela `notifications` (por usuário) com: título, corpo, ícone/imagem opcional, tipo (`mission`, `info`, `custom`), CTA principal (`{label, kind: 'wa_me' | 'link' | 'calendar' | 'mission', payload}`), `read_at`, `expires_at`.
- Popover ao clicar: lista as notificações mais recentes, com botão de ação (`wa.me` com mensagem pré-preenchida, link externo, "adicionar à agenda" via arquivo `.ics`, ou "abrir missão").
- Realtime: subscribe em `notifications` filtrado por `user_id` pra pulsar sem refresh.
- Painel admin simples em `/agitacao/notificacoes` (só staff) pra criar notificação manual: escolher destinatários (todos agitadores / papel / usuários específicos), preencher CTA, agendar envio.

## Fase C — Missões autoatribuíveis

Reaproveita as tabelas existentes `agitation_missions` e `agitation_tasks`.

- Adicionar em `agitation_missions`: `instructions` (texto rico curto), `batch_size` (default 10), `cooldown_minutes` (default 60), `whatsapp_message_template`, `is_open` (bool — se autoatribuível ou apenas via atribuição direta), `starts_at`, `ends_at`.
- Novo endpoint `claimMissionBatch(missionId)`: pega N tasks `pending` sem `assigned_contact_id` (ou reservadas para o usuário), marca como reservadas pro agitador atual, respeita cooldown por usuário.
- Novo endpoint `completeMissionBatch(taskIds[])`: marca `concluido`, dispara notificação de agradecimento, aplica cooldown.
- Tela do agitador: modal "Missão disponível" com instruções + botão "Aceitar missão" → mostra os N contatos com botão `wa.me` já preenchido com o template + botão "Avisar que concluí no WhatsApp" (abre `wa.me` do admin/coordenador com mensagem pré-pronta).
- Quando admin cria atribuição direta (fluxo já existente), o mesmo modal aparece pro agitador designado — só muda que as tasks já vêm com `assigned_contact_id` = ele.
- Trigger: ao inserir tasks numa missão, cria automaticamente uma `notification` do tipo `mission` pros agitadores elegíveis (ou pro designado).

## Fase D — Painel admin de missões

- Em `/agitacao` (aba admin), botão "Nova missão" abre wizard:
  1. Nome + instruções (o que o agitador vai ver na tela de aceitar).
  2. Filtros de origem dos contatos (reusa `crm-filters`) OU seleção manual.
  3. Template de mensagem (mesmo motor de placeholders das campanhas).
  4. Configurações: tamanho do lote, cooldown, aberta/direcionada, período de vigência.
  5. Preview + confirmação.
- Lista de missões ativas com progresso (X de Y concluídas), botão pausar/retomar, exportar não respondidos.

## Fase E — Web Push (notificação no celular)

- Service worker dedicado `public/firebase-messaging-sw.js` NÃO — usar Web Push nativo com VAPID via `web-push` no server + `PushManager` no cliente. Sem Firebase.
- Nova tabela `push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, created_at)`.
- Componente `EnablePushButton` na Central de Notificações: pede permissão, registra subscription, salva no banco.
- Server function `sendPushToUser(userId, payload)` que, quando uma `notification` é criada, envia pra todos os endpoints daquele usuário.
- Requer 2 secrets novos: `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` (gero e peço pra você adicionar).
- iOS: só funciona se o app for instalado como PWA (já suportamos). Mostrar aviso claro pra usuários iOS.

## Ordem de entrega

Vou entregar em duas rodadas de commits pra você poder testar entre elas:

1. **Rodada 1 (Fases B + parte de C):** tabela `notifications`, sino no header, popover, realtime, painel admin básico de notificações, migração das colunas novas em `agitation_missions`.
2. **Rodada 2 (Fases C+D+E):** fluxos completos de missão (claim/complete), painel admin de missões, Web Push com VAPID.

## Confirmações que preciso antes de começar

1. **Web Push sem Firebase** (VAPID puro) tá ok? É mais simples e não depende de conta Google.
2. **Cooldown de 1h** entre lotes por agitador é o valor certo, ou você quer configurável por missão (default 1h)?
3. **Botão "avisar que concluí"** vai pra um número fixo (do coordenador) ou você quer configurar por missão?
4. **Notificações "custom"** (link, imagem, agenda) — quem cria? Só admin, ou também coordenadores/staff?

Se estiver tudo ok e sem preferência específica, sigo com os defaults acima.
