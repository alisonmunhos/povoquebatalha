
# Central de Mobilização da Campanha — Plano de Arquitetura

> Stack: **TanStack Start (Lovable)** + **Lovable Cloud** (Postgres/Auth/Storage + server functions) + **Z-API** (WhatsApp). Sem Edge Functions Supabase — toda a lógica server vive em `createServerFn` e em rotas públicas `/api/public/*` para webhooks.

---

## 1. Arquitetura geral

```text
┌──────────────────────────────────────────────────────────────┐
│  PÚBLICO (sem login)                                         │
│  /recadastro     → form de recadastramento de apoiador       │
│  /inscrever      → form curto "quero receber informações"    │
└──────────────────────────────────────────────────────────────┘
                       │ insere em contacts (anon, RLS estrita)
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  PAINEL (login, /_authenticated/*)                           │
│  Dashboard · CRM · Importação · Tags · Segmentos             │
│  Campanhas · Calendário · Histórico · Conexão Z-API          │
└──────────────────────────────────────────────────────────────┘
                       │ createServerFn (RLS como usuário)
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  Lovable Cloud (Postgres + Storage + Auth)                   │
│  Tabelas + views + funções SQL (normaliza fone, dedup hash)  │
│  pg_cron → dispara worker de fila a cada minuto              │
└──────────────────────────────────────────────────────────────┘
                       │ worker chama Z-API REST
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  Z-API  (instância + token + client-token)                   │
│  Webhooks → /api/public/zapi/{evento}  (HMAC/secret check)   │
└──────────────────────────────────────────────────────────────┘
```

Princípios:
- **Idempotência**: toda operação de envio e cada webhook usam chave única (`message_id`, `zaap_id`).
- **Fila no banco**, não em memória — workers são stateless.
- **Telefone normalizado E.164** + `phone_last8` é a chave de dedup.
- **Roles** em tabela separada (`user_roles` + `has_role()`), nunca no profile.

---

## 2. Tabelas (Lovable Cloud / Postgres)

Núcleo:
- `profiles` (id=auth.uid, nome, criado_em)
- `user_roles` (user_id, role: admin|operador|leitor)
- `contacts` — id, nome, phone_e164, phone_last8, email, cpf_hash, cep, endereco, bairro, cidade, uf, lat, lng, origem (recadastro|inscricao|import|manual), consentimento_whatsapp bool, opt_out_at, criado_em, atualizado_em, dedup_key
- `contact_custom_fields` (chave/valor opcional por contato)
- `tags` — id, nome, cor (hex), categoria (perfil|territorio|acao|interno)
- `contact_tags` (contact_id, tag_id) — N:N
- `segments` — id, nome, descricao, filtro_jsonb (DSL de filtros), criado_por, atualizado_em
- `imports` — id, arquivo_url (Storage), status (pending|processing|done|error), total, criados, atualizados, duplicados, erros_jsonb, criado_por
- `import_rows` — id, import_id, linha_raw_jsonb, status, contact_id, motivo_erro

Campanhas:
- `campaigns` — id, nome, mensagem_template (com `{{nome}}` etc.), midia_url, tipo (text|image|document), segmento_id|filtro_jsonb, agendado_para, status (draft|scheduled|running|paused|done|canceled), delay_min_ms, delay_max_ms, janela_inicio, janela_fim, criado_por
- `campaign_recipients` — id, campaign_id, contact_id, status (queued|sending|sent|delivered|read|failed|opted_out), zaap_id, message_id, erro, enviado_em, entregue_em, lido_em, tentativas — UNIQUE(campaign_id, contact_id)
- `message_events` — id, recipient_id, tipo (sent|delivered|read|failed|received|status), payload_jsonb, recebido_em

WhatsApp / Z-API:
- `whatsapp_instances` — id, nome, instance_id, token (cifrado/secret ref), client_token_ref, status (disconnected|qr|connected), numero_conectado, ultimo_ping
- `inbound_messages` — id, instance_id, contact_id?, from_phone, conteudo, tipo, payload_jsonb, recebido_em
- `webhook_log` — id, evento, payload, recebido_em, processado bool (debug/auditoria)

Futuro (v2):
- `addresses_geo` (já deixar lat/lng em `contacts` para o mapa)
- `events` (eventos de mobilização), `event_rsvps`

**SQL utilitário (a criar nas migrations):**
- `normalize_phone_br(text) returns text` — limpa, força DDI 55, valida 12/13 dígitos.
- `phone_last8(text) returns text`.
- `unaccent_lower(text)` + trigram (`pg_trgm`) para nome parecido.
- `dedup_key` = `coalesce(phone_e164, 'name:'||unaccent_lower(nome)||'|'||cep)`.
- View `v_contacts_dedup_candidates` agrupando por `phone_last8` e `similarity(nome) > 0.7`.
- `has_role(uuid, app_role)` SECURITY DEFINER.

**RLS resumida:**
- `contacts` INSERT permitido a `anon` só via server function pública (não policy aberta); SELECT/UPDATE/DELETE só `authenticated` com role.
- Todas as tabelas administrativas: somente `authenticated` + `has_role`.
- `GRANT`s explícitos por tabela (Data API exige).

---

## 3. Telas

Públicas:
- `/recadastro` — form completo (nome, CPF opcional, telefone, endereço, bairro, cidade/UF, consentimento WhatsApp, como conheceu).
- `/inscrever` — form curto (nome, telefone, cidade, consentimento). Confirma com mensagem de obrigado.
- `/opt-out/:token` — descadastro 1-clique para conformidade.

Painel (`/_authenticated`):
- `/dashboard` — KPIs (total contatos, novos hoje, envios na semana, taxa de entrega).
- `/contatos` — CRM: tabela filtrável (nome, telefone, cidade, tags, origem), busca, paginação, ação em lote (adicionar tag, exportar, opt-out).
- `/contatos/:id` — ficha completa, histórico de mensagens, tags, edição.
- `/importar` — upload CSV/XLSX, mapeamento de colunas, prévia das primeiras 20 linhas, relatório pós-processamento.
- `/duplicados` — fila de candidatos a merge com ação manual "mesclar/ignorar".
- `/tags` — CRUD com cor e categoria.
- `/segmentos` — builder visual de filtros (AND/OR sobre cidade, tag, origem, data) salvo como JSONB.
- `/campanhas` — lista + criação.
- `/campanhas/nova` — wizard: 1) Mensagem (template + variáveis + mídia) → 2) Público (segmento ou filtro ad-hoc, mostra contagem) → 3) Prévia (renderiza para 3 contatos amostrais) → 4) Agendamento (data/hora, janela de envio, delay min/max) → 5) Confirmar.
- `/campanhas/:id` — status em tempo real, contadores (enviadas/entregues/lidas/falhas), pausar/retomar/cancelar, reenviar falhas.
- `/calendario` — vista mensal/semanal com campanhas agendadas.
- `/whatsapp` — gerenciar instância Z-API: status, QR Code (img da Z-API), botão desconectar, log de webhooks recentes.
- `/historico` — busca global de mensagens enviadas.
- `/configuracoes` — usuários e roles.

v2: `/mapa` com pins (Leaflet/MapLibre).

---

## 4. Backend (server functions + rotas)

**`createServerFn` (autenticadas, em `src/lib/*.functions.ts`):**
- `contacts.create / update / delete / merge / bulkTag / exportCsv`
- `contacts.searchPaginated(filtro)`
- `imports.startUpload` → assina URL Storage
- `imports.process(importId)` → roda parsing + normalização + dedup (chunked)
- `imports.getReport(importId)`
- `tags.crud`, `segments.crud`, `segments.preview(filtro)` (retorna contagem + sample)
- `campaigns.create / update / schedule / pause / resume / cancel`
- `campaigns.enqueue(campaignId)` → expande público em `campaign_recipients`
- `campaigns.preview(campaignId, sampleSize)` → renderiza template
- `whatsapp.getInstanceStatus`, `whatsapp.getQrCode`, `whatsapp.disconnect`, `whatsapp.testSend(phone)`

**Server functions internas / privilegiadas:**
- `queue.tick()` — chamada pelo cron; busca N `campaign_recipients` `queued` respeitando janela e delay, envia via Z-API REST, atualiza status, registra `message_events`. Implementa jitter, retry exponencial, opt-out check, rate-limit por instância.

**Rotas públicas (`src/routes/api/public/`):**
- `POST /api/public/forms/recadastro` — valida com Zod, insere contato, anti-spam (rate-limit por IP + hCaptcha opcional).
- `POST /api/public/forms/inscrever` — idem.
- `POST /api/public/zapi/on-send` — webhook: status `sent`.
- `POST /api/public/zapi/on-delivery` — `delivered`.
- `POST /api/public/zapi/on-read` — `read`.
- `POST /api/public/zapi/on-receive` — mensagens recebidas → `inbound_messages`, marca opt-out se conteúdo for "SAIR/PARAR".
- `POST /api/public/zapi/on-connect` / `on-disconnect` — atualiza `whatsapp_instances.status`.
- `POST /api/public/cron/queue-tick` — chamado por pg_cron (header `x-cron-secret`).

Todos os webhooks: validam **segredo** (`?token=` ou header) com `timingSafeEqual`, gravam em `webhook_log`, são **idempotentes** por `zaap_id`/`messageId`.

---

## 5. Secrets necessários

Runtime (via `add_secret`):
- `ZAPI_INSTANCE_ID`
- `ZAPI_TOKEN` (token da instância)
- `ZAPI_CLIENT_TOKEN` (Account Security Token — header `Client-Token`)
- `ZAPI_WEBHOOK_SECRET` (gerado, usado no querystring/header dos webhooks)
- `CRON_SECRET` (gerado, para `/api/public/cron/*`)
- `HCAPTCHA_SECRET` (opcional, anti-spam nos forms públicos)

`SUPABASE_*` já vêm com Lovable Cloud.

---

## 6. Configuração dos webhooks Z-API

1. Após criar a instância na Z-API, copiar `Instance ID`, `Token` e `Client-Token` → salvar como secrets.
2. No painel Z-API, em **Webhooks**, configurar cada evento apontando para:
   - Ao enviar:   `https://<projeto>.lovable.app/api/public/zapi/on-send?token=ZAPI_WEBHOOK_SECRET`
   - Ao entregar: `.../on-delivery?token=...`
   - Ao ler:      `.../on-read?token=...`
   - Ao receber:  `.../on-receive?token=...`
   - Conectado:   `.../on-connect?token=...`
   - Desconect.:  `.../on-disconnect?token=...`
3. Marcar **"Notificar enviadas pela API"** para receber status dos próprios envios.
4. Cada handler: confere `token` com `timingSafeEqual`, faz upsert idempotente por `zaap_id`/`messageId`, devolve `200` rápido (processamento pesado em background quando necessário).

---

## 7. Fluxo de importação e recadastramento

**Importação CSV/XLSX:**
1. Upload do arquivo para Storage (`imports/{userId}/{uuid}.xlsx`).
2. `imports.process` lê via SheetJS, detecta colunas, pede mapeamento na UI (nome, telefone, cidade, etc.).
3. Para cada linha:
   - `normalize_phone_br()` → se inválido, marca erro.
   - Gera `phone_last8` e busca colisão.
   - Match por (a) `phone_e164`, (b) `phone_last8` + similaridade de nome > 0.7, (c) email exato.
   - Match → UPDATE (não sobrescreve campos preenchidos sem confirmação) e marca como **duplicado**.
   - Sem match → INSERT com `origem='import'`.
4. Relatório final em `imports`: criados / atualizados / duplicados / erros + CSV de erros.

**Recadastramento / inscrição:**
1. Form público envia para rota `/api/public/forms/*` (Zod + rate-limit).
2. Normaliza telefone, calcula dedup_key, faz upsert.
3. Se já existia: atualiza campos novos + adiciona tag `recadastrado-2026`.
4. Dispara mensagem de boas-vindas (enfileira em uma "campanha sistêmica" ou envio direto).
5. Resposta: tela de obrigado + opção de compartilhar link.

---

## 8. Fluxo de campanha e fila de envio

1. **Criar** campanha (wizard) → `status=draft`.
2. **Agendar** → `status=scheduled`, `agendado_para=...`.
3. **Expandir público** (no momento do agendamento ou no início): insere uma linha em `campaign_recipients` por contato elegível (consentimento_whatsapp=true, sem opt_out, dentro do segmento). UNIQUE evita duplicar.
4. **pg_cron** roda `queue-tick` a cada minuto.
5. Worker:
   - Verifica janela (`janela_inicio`/`fim`), status `running`, instância `connected`.
   - Pega lote (ex.: 30 destinatários) com `FOR UPDATE SKIP LOCKED`.
   - Para cada um: renderiza template, chama Z-API (`/send-text` ou `/send-image`), salva `zaap_id` + `message_id`, marca `sending→sent`.
   - Aplica `delay = random(delay_min, delay_max)` entre mensagens; respeita limite (ex.: 60/min por instância).
   - Em erro: incrementa tentativas, backoff, depois `failed`.
6. Webhooks atualizam `delivered/read/failed` em `campaign_recipients` e gravam `message_events`.
7. UI da campanha faz polling (ou Realtime) das contagens.
8. Pausar/retomar muda `campaigns.status`; cancelar marca pendentes como `canceled`.

Opt-out: qualquer inbound com "SAIR/PARAR/CANCELAR" seta `contacts.opt_out_at` e remove pendentes futuras.

---

## 9. MVP desta semana

Foco: tirar contatos do papel, recadastrar e disparar uma campanha simples.

1. Lovable Cloud habilitado, auth e roles (admin/operador).
2. Migrations: `contacts`, `tags`, `contact_tags`, `imports`, `campaigns`, `campaign_recipients`, `message_events`, `whatsapp_instances`, `webhook_log` + funções `normalize_phone_br`, `phone_last8`, `has_role`.
3. Secrets Z-API + tela `/whatsapp` (status, QR, teste de envio).
4. Webhooks: `on-send`, `on-delivery`, `on-read`, `on-receive`, `on-connect`, `on-disconnect`.
5. Landing `/recadastro` + `/inscrever` com Zod + rate-limit.
6. Importação CSV/XLSX com mapeamento + normalização + dedup básica (telefone + last8).
7. CRM `/contatos` (tabela filtrável + tags + opt-out manual).
8. Campanhas: criar → segmento simples (por tag/cidade) → prévia → agendar → fila com delay → histórico básico.
9. Calendário simples (lista por dia).
10. Opt-out automático por palavra-chave.

## 10. Versão 2

- Builder visual avançado de segmentos (AND/OR aninhado, datas relativas).
- Tela `/duplicados` com merge assistido (fuzzy por nome+CEP).
- Templates reutilizáveis, A/B test de mensagem, variáveis dinâmicas avançadas.
- Múltiplas instâncias Z-API com balanceamento e rate-limit por número.
- Inbox de respostas (atendimento 1-a-1) com atribuição a operador.
- Mapa com pins (geocoding em batch, clusterização, filtros por bairro).
- Relatórios/exports avançados, dashboards por região.
- Integração com eventos presenciais (RSVP + check-in).
- Auditoria completa + LGPD self-service (exportar/excluir dados do titular).

---

## Perguntas antes de implementar

1. **Z-API**: você já tem uma instância criada (Instance ID + Token + Client-Token)? Vai ser **uma única instância** no MVP ou já precisamos suportar várias?
2. **Login do painel**: e-mail/senha basta, ou quer Google também?
3. **Recadastramento**: campos exatos que você quer no form (CPF é obrigatório? endereço completo ou só cidade/bairro? "como conheceu a campanha"?). Tem alguma LGPD/consentimento específico para exibir?
4. **Volume esperado**: quantos contatos na base inicial (importação) e quantos envios/dia você pretende fazer? Isso define o rate-limit e se precisamos já de múltiplas instâncias.
5. **Anti-spam nos forms públicos**: pode usar hCaptcha (grátis) ou prefere sem captcha confiando só em rate-limit?
6. **Mensagem de boas-vindas** no recadastro: envia automaticamente via WhatsApp ao se cadastrar, ou só entra na base?
