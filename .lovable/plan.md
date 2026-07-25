# Plano — Agitação v2: Missões, Notificações e Web Push

Nota importante sobre push no celular: com **Web Push** funciona bem em Android (Chrome, Edge, Firefox) mesmo com o app fechado. No **iPhone** só funciona se o usuário **instalar o app na tela de início** (PWA) — Safari não permite push em aba comum. Isso será explicado na UI (banner "Instale o app para receber avisos no iPhone").

---

## Parte 1 — Refatorar a tela `/agitacao`

### 1.1 Cards de estatística
Substituir os 6 cards genéricos por um cabeçalho contextual:

- **Admin** vê: `Total base`, `Meus captados`, `Missões ativas`, `Aguardando resposta` (contatos abordados sem retorno).
- **Agitador** vê: `Meus contatos`, `Missões pendentes`, `Concluídos hoje`, `Aguardando resposta`.

Cada card é clicável e aplica o filtro correspondente à lista (não é só decorativo).

### 1.2 Filtros funcionais + botão "Limpar"
- Consertar o botão **Limpar filtros** (hoje não zera todos os estados).
- Filtros: **status de abordagem** (Ainda não abordado / Confirmado / Sem resposta / Com observação / Pediu atualização), **cidade**, **bairro**, **tag**, **origem/captação**, **período de captação**.
- Contagens dos chips vêm do backend (facet real sobre o conjunto visível ao usuário atual), não hardcoded.
- Filtros persistidos na URL (mesmo padrão já usado em `/contatos`), para não sumirem ao voltar da ficha.

### 1.3 Escopo por papel (mantém regra atual)
Agitador vê só quem ele captou/atribuiu; admin vê tudo. Já funciona — só documentar no cabeçalho da tela ("Você está vendo N contatos: os que você captou + os atribuídos").

---

## Parte 2 — Central de Notificações (ícone do punho pulsando)

Novo componente global no `AppShell`, ao lado do "+ Adicionar":

- Ícone do **punho** (BrandMark) com badge numérico e animação `animate-pulse` quando há item não lido.
- Ao clicar abre **painel/modal** com a lista de notificações do usuário, mais recentes primeiro.
- Cada item mostra tipo (Missão / Aviso / Lembrete), título, prévia e "há X min".
- Ao abrir uma notificação, abre o **pop-up de detalhe** correspondente ao tipo.

### 2.1 Tipos de notificação (v1)
1. **Missão disponível** — pop-up com título, instruções, público-alvo, tamanho do lote sugerido, botões **Aceitar missão** / **Recusar** / **Depois**.
2. **Aviso / lembrete** — pop-up com título, corpo formatado (**negrito**, *itálico*, sublinhado, emojis via editor simples), imagem opcional, e blocos de ação opcionais:
   - Botão **WhatsApp** (`wa.me/<numero>?text=<msg pré-preenchida>`)
   - Botão **Link externo** (label + URL)
   - Botão **Adicionar à agenda** (gera `.ics` para download com título/data/hora/local/descrição)

### 2.2 Modelo de dados

```text
notifications
  id, recipient_user_id (nullable — null = broadcast por role),
  recipient_role (nullable — 'agitador' | 'admin' | null),
  kind ('mission' | 'notice'),
  mission_id (nullable, FK agitation_missions),
  title, body_html (sanitizado), image_url (nullable),
  wa_phone, wa_message, link_label, link_url,
  ics_title, ics_starts_at, ics_ends_at, ics_location, ics_description,
  created_by, created_at

notification_reads
  notification_id, user_id, read_at, dismissed_at
  PK(notification_id, user_id)
```

Contagem de "não lidas" = notificações elegíveis ao usuário sem linha em `notification_reads`.

---

## Parte 3 — Missões com autoatribuição

Estender `agitation_missions` (não criar do zero) e reaproveitar `agitation_tasks`:

### 3.1 Novos campos em `agitation_missions`
```text
mode:                    'manual' | 'self_assign'      -- default 'manual'
briefing_html            -- instruções ricas exibidas no pop-up
audience_summary         -- texto curto ("Mulheres de POA, região sul") mostrado ao agitador
batch_size               -- quantos contatos por autoatribuição (ex.: 10)
max_batches_per_user     -- limite total por agitador (nullable = ilimitado)
cooldown_minutes         -- padrão 60
completion_wa_phone      -- número wa.me para avisar conclusão
completion_wa_message    -- template da mensagem de "concluí a missão"
target_user_ids[]        -- opcional, restringe autoatribuição a agitadores específicos
```

Todos configurados no **CreateMissionModal** (adicionar seções: Briefing, Autoatribuição, Aviso de conclusão).

### 3.2 Nova tabela `mission_batches`
Registra cada autoatribuição concedida (para cooldown, histórico e limite):
```text
id, mission_id, agitador_user_id, task_ids[], assigned_at, completed_at
```

### 3.3 Server function `selfAssignMissionBatch`
- Verifica se usuário está em `target_user_ids` (se definido).
- Verifica cooldown: `now() - last_batch.completed_at >= cooldown_minutes` (retorna aviso, **não bloqueia** — conforme escolha).
- Verifica `max_batches_per_user`.
- Seleciona `batch_size` `agitation_tasks` da missão com `assigned_contact_id IS NULL`, faz UPDATE atômico com `RETURNING`, marca `assigned_contact_id = <contato-espelho do usuário>` e cria `mission_batches`.
- Retorna link `/missao/$missionId/contato/$contactId` (reaproveita fluxo público existente).

### 3.4 Botão "Concluir missão"
No fim da tela do agitador (`/missao/...`), gera link `wa.me/<completion_wa_phone>?text=<completion_wa_message renderizado>` e marca `mission_batches.completed_at`. Dispara aviso pra próximo cooldown.

### 3.5 Menu "Minhas missões" para o agitador
Nova rota `/_authenticated/minhas-missoes` — lista das missões que o agitador aceitou (via `mission_batches`), com status (em andamento / concluída) e link pra tela de envio.

### 3.6 Trigger de notificação
Quando uma missão em modo `self_assign` é publicada, insere `notifications` de tipo `mission` para todos os `target_user_ids` (ou broadcast pra role `agitador` se vazio). O `AppShell` faz `useQuery` com refetch a cada 30s + realtime (`postgres_changes` na tabela `notifications`) para atualizar o badge sem reload.

---

## Parte 4 — Web Push (celular)

### 4.1 Backend
- Tabela `push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, created_at)`.
- Secret novo `VAPID_PRIVATE_KEY` (gerado com `generate_secret`) + `VAPID_PUBLIC_KEY` (pública, vai pro frontend via `VITE_`).
- Server function `savePushSubscription` (agitador se inscreve) e `sendPushToUsers` (usada internamente ao criar notificação).
- Envio via `web-push` protocol direto de um server function (fetch HTTPS assinado; sem dependência de FCM key server).

### 4.2 Service worker de messaging
Arquivo dedicado `public/push-sw.js` (fora do escopo do PWA app-shell, seguindo a knowledge do skill/pwa). Recebe `push`, mostra `Notification` com ícone do punho, e no `notificationclick` abre `/notificacoes/<id>`.

### 4.3 UI de opt-in
Banner "Ative notificações do celular" na primeira visita autenticada:
- **Android / desktop**: pede permissão, registra subscription.
- **iPhone não-instalado**: mostra texto "No iPhone, toque em compartilhar → Adicionar à Tela de Início. Depois ative aqui."
- **Já concedido**: some.

### 4.4 Gatilho
Sempre que uma nova linha entra em `notifications` para um usuário, dispara Web Push para todas as subscriptions daquele usuário (+ fallback silencioso se `endpoint` retornar 410/404 → remove subscription).

---

## Parte 5 — Editor de conteúdo rico

Componente `RichTextEditor` leve (reutilizável no CreateMissionModal e no criador de notificação avulsa):
- Baseado em `contenteditable` + comandos `document.execCommand('bold'/'italic'/'underline')`.
- Suporte a emojis nativos (colar do teclado do sistema).
- Sanitização server-side com allowlist restrita (`<b>`, `<i>`, `<u>`, `<br>`, `<p>`, `<a href>`, `<img src>`) antes de gravar.

---

## Ordem de entrega sugerida

1. **Fase A (1 sprint)** — Refatorar cards e filtros de `/agitacao`, consertar "Limpar filtros".
2. **Fase B** — Modelo `notifications` + Central de Notificações in-app (sem push ainda) + notificação avulsa admin.
3. **Fase C** — Missões `self_assign` (schema + modal + autoatribuição + cooldown + botão concluir + menu "Minhas missões").
4. **Fase D** — Web Push (VAPID + subscription + push-sw.js + banner opt-in + envio no insert de notificação).
5. **Fase E** — Editor rico + `.ics` + botões de link/WhatsApp em notificações avulsas.

Cada fase pode ir pra produção independentemente e você já colhe valor sem esperar a próxima.

## Detalhes técnicos

- **Realtime**: habilitar `supabase_realtime` publication para `notifications` e `mission_batches` — o AppShell escuta insert para o próprio user.
- **RLS**: `notifications` — `select` where `recipient_user_id = auth.uid()` OR `has_role(auth.uid(), recipient_role)`. `notification_reads` — usuário só vê/insere as próprias. `mission_batches` — usuário só vê os próprios, admin vê tudo. Todas com GRANTs autenticated + service_role.
- **Sanitização HTML**: usar `sanitize-html` no server antes de gravar `body_html` e `briefing_html`.
- **iOS PWA**: já temos manifest instalável; validar que `display: standalone` está preservado e que ícones PNG estão publicados (feito no handoff anterior).
- **Compatibilidade**: fluxo antigo de atribuição manual (`assignMissionTaskResponsible`) continua funcionando — o `mode = 'manual'` mantém a UI atual, só o modo `self_assign` é novo.
