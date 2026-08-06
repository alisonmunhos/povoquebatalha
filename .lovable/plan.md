# Relatório de investigação — tudo que depende da Z-API hoje

Somente diagnóstico, conforme pedido. Nenhuma mudança proposta ou aplicada.

## 1. Envio de mensagens

Existe **um único ponto real de chamada à Z-API para envio**:

- `src/integrations/zapi/client.server.ts` — cliente REST (base `https://api.z-api.io/instances/{ZAPI_INSTANCE_ID}/token/{ZAPI_TOKEN}`, header `Client-Token`). Métodos: `status`, `qrCodeImage`, `disconnect`, `sendText`, `sendImage`, `sendDocument/{ext}`, `sendAudio`, `sendLink`, `phoneExists`, `phoneExistsBatch`.
- `src/lib/wa-send.server.ts` → função `sendMessage()` é o motor único: renderiza variáveis, decide o endpoint (`planEndpoint`), aplica bloqueios (opt-out/arquivado/consentimento/telefone), tem fallback `send-link → send-text`, detecta shadowban (`isShadowbanError`) e retorna `message_id` / `zaap_id` / `endpoint_used` / `preview_status`.

Quem chama `sendMessage()` (todos os pontos de disparo):

| Fluxo | Arquivo |
|---|---|
| Campanhas em massa (lote) | `src/lib/campaign-batch.server.ts` (via `src/lib/campaigns.server.ts` e o cron `src/routes/api/public/jobs/process-campaign-queue.ts`) |
| Automações por evento (ex. pós-formulário público) | `src/lib/automations.server.ts` (`triggerAutomationsForEvent`) |
| Inbox — resposta manual do operador | `src/lib/inbox.functions.ts` |
| Envio direto / teste de template | `src/lib/messages.functions.ts` |
| Teste de envio na tela de conexão | `src/lib/zapi.functions.ts` (`testSendWhatsApp`) |
| Cadastro público de usuário/agitador | `src/lib/public-user-signup.server.ts` |
| Resposta automática por palavra-gatilho (mensagem recebida) | `src/routes/api/public/zapi/$evento.ts` (evento `on-receive`) |

Chamadas à Z-API **sem** ser envio de texto:
- `src/lib/contacts-phone.functions.ts` → `phoneExistsBatch` (verificar se número tem WhatsApp).
- `src/lib/agitation-missions.functions.ts` → `phoneExistsBatch` (validar números ao montar missão).
- `src/lib/zapi.functions.ts` → `status`, `qr-code/image`, `disconnect` (pareamento por QR).

Importante para a migração: **missões de agitação não enviam pela API**. O agitador abre link `wa.me` no próprio celular (`origin: "territory_wa_me"` em `wa-send.server.ts`, mais links `wa.me` em `minhas-missoes.tsx`, `agitacao.tsx`, `territorio.tsx`, `contatos.index.tsx`, `contatos.$id.tsx`, `TerritoryMapView.tsx`, `SendJourneyDialog.tsx`, `UserSignupForm.tsx`, `PublicFormRenderer.tsx`, `AddContactButton.tsx`, `entrada-dados.index.tsx`). Esse caminho é independente de provedor.

Também independentes da Z-API: notificação semanal de sábado (`src/routes/api/public/jobs/weekly-impact.ts` → `weekly-impact.server.ts`) e liberação de contatos parados (`jobs/release-stalled-missions.ts` → `mission-release.server.ts`). Ambos usam apenas `notifications` + Web Push (`web-push.server.ts`), não WhatsApp.

## 2. Recebimento (webhook)

- Rota única: `src/routes/api/public/zapi/$evento.ts` (TanStack server route, **não** Edge Function do Supabase — não existe Edge Function envolvida).
- URL configurada no painel Z-API: `/api/public/zapi/{evento}?token=ZAPI_WEBHOOK_SECRET`, validado com `timingSafeEqual`. Eventos aceitos: `on-send`, `on-delivery`, `on-read`, `on-receive`, `on-connect`, `on-disconnect`, `on-message-status`, `on-test`.
- Formato do payload que o código espera hoje (todo em `snake`/camel da Z-API):
  - telefone: `senderPhone` / `participantPhone` / `chatPhone` / `authorPhone` / `sender.phone` / `phone` / `from` — com tratamento especial de valores `@lid` (WhatsApp esconde o número real).
  - identificadores: `zaapId`, `id`, `messageId`, `ids`.
  - texto: `text.message` / `message.text` / `text` / `message`.
  - mídia: objetos `image.imageUrl`, `document.documentUrl`+`fileName`, `audio.audioUrl`, `video.videoUrl`, com `mimeType` e `size`.
  - nome: `senderName` / `chatName` / `notifyName`.
  - status/erro: `status` (`sent`, `sent-by-server`, `received`, `delivered`, `read`, `failed`), `errorCode` (inclusive `SHADOW_BAN`), `error`, `errorMessage`.
- Efeitos do webhook: grava sempre em `webhook_log`; grava recebidas em `inbound_messages`; casa contato por últimos 8 dígitos (`phone_last8` ou `phone_secundario_last8`); opt-out por palavra-chave (`sair`, `parar`, `cancelar`, `remove`, `stop`, `descadastrar`); atualiza `campaign_recipients` e `direct_messages` por `zaap_id`/`message_id`; grava `message_events`; pausa campanha em `SHADOW_BAN`; confirma `whatsapp_status` em entrega/leitura; dispara resposta automática com cooldown de 24h (`auto_reply_triggers` + `auto_reply_log`).

## 3. Campos de banco com informação específica da Z-API

- `campaign_recipients.zaap_id`, `.message_id` (+ `status`, `sent_at`, `delivered_at`, `read_at`, `failed_at`, `erro`).
- `direct_messages.zaap_id`, `.message_id` (+ mesmos timestamps e `status` em português: `enviado`/`entregue`/`lido`/`erro`).
- `automation_deliveries.zapi_message_id`.
- `whatsapp_instances`: `provider` (valor literal `'zapi'`, usado em filtros `.eq("provider","zapi")` em vários arquivos), `numero_conectado`, `status` (enum `instance_status`: `disconnected|qr|connected|error` — o estado `qr` só existe em provedor não oficial), `last_ping`, `rate_per_minute` (coluna existe mas **não é lida por nenhum código**), `inbound_to_inbox_enabled`, `config` (jsonb com `use_send_link`, `shadowban_suspected_at`, número padrão de cadastro).
- `webhook_log.provider = 'zapi'`, `webhook_log.evento` guardando nomes de evento Z-API.
- `message_events.tipo` recebe o nome do evento Z-API (`on-send`, `on-delivery`…).
- `inbound_messages.payload` e `message_events.payload`: JSON bruto no formato Z-API.
- `contacts.whatsapp_status` (enum: `desconhecido|confirmado|invalido|erro_envio|opt_out`) e `whatsapp_checked_at`, alimentados por `phoneExistsBatch` e por resultado de envio.
- `campaigns.delay_min_ms`, `.delay_max_ms`, `.paused_motivo` (texto menciona shadowban explicitamente).

## 4. Retry / fila / rate-limit existentes

- Fila própria: `campaigns.status = 'running'` + `campaign_recipients.status` (`queued|sending|sent|delivered|read|failed|opted_out|canceled`), processada em lotes de 5 pelo cron `process-campaign-queue` (a cada minuto).
- Anti-bloqueio pensado especificamente para número não oficial: delay aleatório entre linhas do lote (`delay_min_ms` 1500 / `delay_max_ms` 4000) e `delayMessage` aleatório de 2–6s enviado no payload da Z-API.
- Pausa automática da campanha por suspeita de shadowban (`pauseCampaignForShadowban`), tanto no caminho síncrono quanto pelo webhook `SHADOW_BAN`.
- Cooldown de 24h por telefone+gatilho nas respostas automáticas.
- **Não existe retry automático** de mensagem falhada (falha vira `failed`/`erro` e para ali), nem rate-limit por minuto de fato aplicado (`rate_per_minute` está órfão).
- Idempotência em automações via `upsert` com `onConflict: automation_id,contact_id`.

## 5. Referências fora do backend / configuração

- Segredos usados: `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`, `ZAPI_WEBHOOK_SECRET`. Nenhum aparece no `.env` do projeto (só chaves do backend Lovable Cloud) — estão em Segredos do projeto. Nenhuma variável `VITE_` de Z-API existe, ou seja, o navegador nunca fala com a Z-API.
- Tela de administração acoplada ao provedor: `src/routes/_authenticated/whatsapp.tsx` (QR Code, pareamento, alerta de shadowban, montagem/diagnóstico das URLs de webhook por evento) e o atalho no `dashboard.tsx`.
- Textos de interface que citam a Z-API: `whatsapp.tsx` (vários), `SendWhatsAppWizard.tsx` ("reduz risco de bloqueio na Z-API"), `CommunicationInbox.tsx` (comentário sobre URL de mídia temporária).
- `src/lib/zapi.functions.ts` — 9 funções de servidor expostas à UI (status, QR, desconectar, teste, ajustes de instância, diagnóstico de webhook, dispensar alerta de shadowban).
- Migrations que criaram/ajustaram essa estrutura: `20260630152118`, `20260701193420`, `20260708200312`.
- `docs/auditoria/06-mapa-de-dependencias.md` documenta a dependência.

## Resumo do impacto da migração

Superfície pequena e bem isolada: um cliente HTTP, um motor de envio, um webhook, cerca de 8 colunas de ID/status e uma tela de administração. Os pontos mais sensíveis são o pareamento por QR (não existe em API oficial), o modelo de janela de 24h + templates aprovados (hoje inexistente no código), a verificação `phoneExists` (sem equivalente direto na API oficial) e toda a lógica anti-shadowban/delays, que deixa de ser necessária.
