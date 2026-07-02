# Fase — Consolidação do Inbox

Objetivo: tornar `/comunicacao/inbox` a única experiência de Inbox, com permissões corretas, diagnóstico de webhooks útil, status real das mensagens avulsas, tratamento de conversas não vinculadas, filtros e painel do contato completos, anexos recebidos, e atribuição simples.

Vou executar em blocos pequenos, sem tocar em Campanhas, CRM, Importação, Território ou VRM além do necessário para expor indicadores.

---

## Bloco 1 — Rota canônica e menu

- `/inbox` (`src/routes/_authenticated/inbox.tsx`) vira redirect para `/comunicacao/inbox` via `beforeLoad`.
- Remover link antigo do menu lateral (`AppShell`) e manter apenas o item "Inbox" apontando para `/comunicacao/inbox`.
- Marcar `listInboxConversations` / `getInboxConversation` / `markInboxRead` / `resolveInbox` como legado; se não houver mais uso, remover do bundle. `sendDirectMessage` fica (é usado pelo Wizard e pelo Inbox novo).

## Bloco 2 — Permissões

Fonte da verdade: `user_roles`.

- Guard no route file `/comunicacao/inbox` e `/comunicacao/*`: apenas `admin` e `vrm` entram. `territorio`/`leitor`/sem papel → redirect para `/` com toast "Acesso não permitido".
- Reforço server-side em toda função de escrita do Inbox (`sendDirectMessage`, `assignConversation`, `resolveConversation`, `addConversationNote`, `flagConversation`): checar papel do `context.userId` e recusar se não for `admin`/`vrm`.

## Bloco 3 — Diagnóstico de webhooks (/whatsapp)

Ampliar `getWebhookDiagnostics` + `WebhookDiagnosticsSection`:

- Banner vermelho quando `webhook_log` está vazio: "Nenhum webhook recebido. Verifique se as URLs foram coladas no painel da Z-API com `?token=…` incluso."
- Para cada evento (`on-send`, `on-receive`, `on-message-status`, `on-connect`, `on-disconnect`, `on-delivery`, `on-read`): URL completa + botão "Copiar URL completa".
- Mostrar: domínio atual, último evento recebido (data + tipo), último `on-receive`, último `on-message-status`, último erro (`processado=false` com `erro`), contador total nas últimas 24h.
- Botão "Testar endpoint": chama `POST /api/public/zapi/on-test?token=…` no próprio domínio, insere `webhook_log` marcado como teste (`evento='on-test'`), sem criar inbound. Handler novo adicionado à rota.

## Bloco 4 — Status de `direct_messages` via webhook

No handler `/api/public/zapi/$evento.ts`, além do update em `campaign_recipients`, tentar mesmo patch em `direct_messages` por `zaap_id` ou `message_id`:

- `on-send` → `status='enviado'`, `sent_at`
- `on-delivery` → `status='entregue'`, `delivered_at`
- `on-read` → `status='lido'`, `read_at`
- status `failed`/`error` → `status='erro'`, `erro`

Adicionar colunas em `direct_messages`: `delivered_at timestamptz`, `read_at timestamptz`, `failed_at timestamptz` (via migration). `zaap_id` e `message_id` já existem.

Timeline do chat mostra ✓/✓✓/✓✓ azul via status.

## Bloco 5 — Conversas não vinculadas

Migration:
- `inbound_messages.contact_id` já é nullable — confirmar.
- `conversations`: adicionar `from_phone text` para conversas sem contato, tornar `contact_id` nullable, unique parcial em (`contact_id`) onde não nulo e em (`from_phone`) onde `contact_id` nulo.

Webhook `on-receive`:
- Se acha contato pelo `phone_last8` → vincula normalmente (mantém comportamento).
- Se não acha → NÃO cria contato. Insere `inbound_messages` com `contact_id=null` e cria/atualiza `conversations` por `from_phone`.

Trigger `conv_sync_from_inbound`: aceitar `NEW.contact_id IS NULL` e usar `from_phone` como chave.

UI:
- Filtro "Não vinculadas" (mostra conversations sem `contact_id`).
- Cabeçalho mostra telefone destacado + badge "Não vinculada".
- Ações: "Criar contato rápido" (modal com nome + cidade → cria contato e liga ao thread), "Vincular a contato existente" (busca contato e faz update em `inbound_messages` + `conversations`).

## Bloco 6 — Filtros extra na coluna esquerda

Além dos existentes, adicionar em `listConversations`:
- "Em atendimento" → `assigned_to IS NOT NULL AND status='aberta'`.
- "Não vinculadas" → `contact_id IS NULL`.
- "Com erro de envio" → contact tem `direct_messages.status='erro'` recente.
- "Opt-out" → `contacts.opt_out_at IS NOT NULL`.

## Bloco 7 — Painel direito

Estender `getConversation` para retornar: `profissao`, `tags[]`, `formas_ajuda`, `whatsapp_status`, últimas 5 campanhas recebidas (nome + data), últimas 5 interações agregadas.

`CommunicationInbox` renderiza esses campos, avisos fortes de opt-out e "sem consentimento", botão "Ver ficha completa" → `/contatos/$id`, botão "Aplicar tag" reusa `applyTagToContacts` se já existir (senão, marca como pendência visível).

## Bloco 8 — Avisos pré-envio

Em `submitReply` (client) e `sendDirectMessage` (server):
- Hard block: opt-out, sem telefone, `whatsapp_status ∈ {invalido, erro_envio, opt_out}`, conversa bloqueada.
- Soft confirm: `consentimento_whatsapp != true`, `whatsapp_status='desconhecido'`, `assigned_to` diferente do usuário atual.

Já existe boa parte do hard block; padronizar mensagens em PT-BR e adicionar dialog de confirmação para soft.

## Bloco 9 — Anexos recebidos

Migration: `inbound_messages` ganha `media_url text`, `media_mime text`, `media_filename text`, `media_size int`.

Handler `on-receive`:
- Se `body.image`/`body.document`/`body.audio` presentes, extrair URL/mime/filename e persistir.
- Não fazer download no worker por enquanto (evita explodir bundle). Guardar URL da Z-API como referência; UI marca "link temporário Z-API".

Timeline: renderizar imagem inline, PDF/documento como card clicável, áudio como `<audio controls>`.

## Bloco 10 — Anexos enviados (revisão)

Já funciona. Confirmar TTL da URL assinada = 1h, bucket privado, metadados persistidos. Registrar TODO: bucket `inbox-media` separado (não implementar nesta fase).

## Bloco 11 — Atribuição

Se `assignConversation`/`resolveConversation`/`releaseConversation` não existem, criar. Botões no cabeçalho do chat:
- "Assumir" (grava `assigned_to`).
- "Liberar" (se dono).
- "Resolver" (grava `resolved_at`).
- Badge "Em atendimento por [nome]".
- Soft lock: se outro operador tentar responder, dialog de confirmação. Admin sempre passa.
- Cada ação insere em `conversation_events`.

## Bloco 12 — Histórico

Garantir que `conversation_events` recebe: `mensagem_enviada`, `mensagem_recebida`, `anexo_enviado`, `anexo_recebido`, `assumida`, `liberada`, `resolvida`, `sinalizada`, `erro_envio`, `nota_adicionada`. Maioria já existe via triggers; complementar onde faltar.

Não alterar filtro "Mensagem" do VRM (mensagens avulsas continuam fora).

## Bloco 13 — Mobile

Ajustes CSS no `CommunicationInbox`:
- Em `< md`: mostrar só uma coluna por vez com tabs (Lista / Chat / Info) e botão "Voltar".
- `sticky bottom` no compositor, `min-h-0` nos flex containers, `overflow-hidden` nas colunas, garantir teclado não esconde `Enviar`.
- Testar 360/390/768.

## Bloco 14 — Migrations necessárias

Uma única migration:
1. `ALTER TABLE direct_messages ADD delivered_at/read_at/failed_at`.
2. `ALTER TABLE inbound_messages ADD media_url/media_mime/media_filename/media_size`.
3. `ALTER TABLE conversations ADD from_phone text`, tornar `contact_id` nullable, ajustar unique.
4. Atualizar trigger `conv_sync_from_inbound` para o novo caminho.

## Ordem de execução

1. Migration (Bloco 14).
2. Webhook: status em `direct_messages` + inbound sem criar contato + mídia recebida (Blocos 4, 5, 9).
3. Redirect e menu (Bloco 1).
4. Permissões cliente/servidor (Bloco 2).
5. `getWebhookDiagnostics` + rota `on-test` + UI `/whatsapp` (Bloco 3).
6. Server functions de conversa: filtros novos, `getConversation` enriquecido, vincular/criar-rápido, atribuição (Blocos 5 UI, 6, 7, 11).
7. `CommunicationInbox`: painel, avisos, timeline com status/anexos recebidos, tabs mobile (Blocos 7, 8, 9, 13).

## Riscos e cuidados

- Não quebrar `campaign_recipients` no handler de status: patch em `direct_messages` é aditivo, num `try/catch` isolado.
- Trigger `conv_sync_from_inbound` alterado: rodar backfill se necessário para conversas antigas.
- Não expor `ZAPI_WEBHOOK_SECRET` além das URLs já mostradas.
- `campaign-media` bucket continua servindo Inbox por enquanto — anotado como débito.

## Fora do escopo

Bot/IA, múltiplas instâncias, HSM, grupos, chamadas, refatoração de Campanhas, bucket separado `inbox-media`, atribuição hard-lock, download de mídia para storage próprio.
