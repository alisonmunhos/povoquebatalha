
# Fase 1 — Módulo Comunicação (Inbox estilo WhatsApp Web)

Escopo desta fase: reorganizar o menu, criar o **app Comunicação** com shell próprio na rota `/comunicacao`, entregar o **Inbox unificado** (estilo WhatsApp Web) com atribuição de conversas, e responder a pergunta do Z-API. Envio em massa, campanhas e templates permanecem funcionando — apenas mudam de lugar no menu. Fases seguintes (recursos avançados de mídia no inbox, respostas rápidas com atalhos, relatórios de atendimento) ficam para depois.

## Resposta rápida sobre o Z-API

Com **uma instância Z-API compartilhada** (sua escolha): você lê o QR Code **uma única vez** como admin em `/comunicacao/whatsapp`. A partir daí, **qualquer usuário autorizado** que entrar no módulo Comunicação já usa essa conexão automaticamente — **não precisa ler QR novamente**. O QR só reaparece se o WhatsApp cair (celular sem internet por muitas horas, sessão expirada). A tela de conexão fica dentro do próprio módulo, visível só para admin.

## Reorganização do menu lateral

O menu principal do sistema (Gestão de Base) fica assim:

```text
Dashboard
Contatos          (gestão/normalização — sem envio em massa aqui)
Importar
Duplicidades
Tags
Segmentos
Território
Mapa
─────────────
Comunicação  →   abre o app /comunicacao (shell próprio)
─────────────
Usuários (admin)
```

Dentro de `/comunicacao` há um shell próprio (estilo WhatsApp Web) com sub-navegação:

```text
Inbox              (padrão)
Contatos           (lista só-leitura, apenas WhatsApp validado)
Campanhas
Mensagens          (templates)
Calendário
Relacionamento
WhatsApp (QR)      (admin)
```

O botão "Comunicação" no menu lateral do sistema principal leva para `/comunicacao/inbox`. Botão de voltar volta pro Dashboard.

## Layout do Inbox (estilo WhatsApp Web)

Três colunas no desktop, uma coluna com navegação no mobile (PWA):

```text
┌──────────────────┬──────────────────────────────┬──────────────────┐
│ Busca 🔍         │  Contato: João — (11)9...    │ Ficha do contato │
│ [Todas][Minhas]  │  Cidade/UF · tags            │ ────────────     │
│ [Não lidas][⚑]   │                              │ Atribuído a:     │
│                  │  ┌──────────────────────┐    │  Você ▼          │
│ Ana Silva  2m 🔵 │  │ Oi, gostaria de...   │    │                  │
│ "obrigada..."    │  └──────────────────────┘    │ Status: Aberto ▼ │
│                  │       ┌─────────────────┐    │                  │
│ João Souza 1h    │       │ Bom dia! Aqui é │    │ Notas internas   │
│ "confirmado"     │       │ da campanha...  │    │ ────────────     │
│                  │       │       enviado ✓✓│    │ + Nova nota      │
│ Maria (campanha) │       └─────────────────┘    │                  │
│                  │                              │ Timeline:        │
│                  │  [Digitar mensagem...   ➤]   │ • Ana atribuiu   │
│                  │  [📎] [📋 Template]          │   a você (10:22) │
└──────────────────┴──────────────────────────────┴──────────────────┘
```

Detalhes de cada coluna:

**Coluna 1 — Conversas**
- Busca única: digitar nome/telefone. Se o termo bate com contato **sem conversa**, aparece uma seção "Iniciar conversa" abaixo da lista (não polui a lista principal — só contatos que já trocaram mensagem aparecem por padrão).
- Filtros topo: `Todas` / `Minhas` (atribuídas ao usuário logado) / `Não lidas` / `Sinalizadas`.
- Cada item mostra: nome, prévia da última mensagem, tempo relativo, badge de não lidas, avatar do responsável (se atribuída), ícone de flag/tarefa.
- Ordenação: última mensagem desc.
- Fonte de dados: união de `inbound_messages` + `direct_messages` + `campaign_recipients` (enviados) agrupada por `contact_id`. Já existe parcialmente em `listInboxConversations` — será estendida.

**Coluna 2 — Thread**
- Balões unificados por contato: entrada (esquerda) e saída (direita), independente da origem (disparo em massa, resposta manual, template automático). Cada balão de saída mostra pequeno rodapé com "via campanha X" / "por Alison" / "automação: boas-vindas".
- Campo de envio: texto livre, botão anexo (usa bucket `campaign-media` já existente), botão "Template" (abre popover com templates do módulo Mensagens, insere renderizado com variáveis do contato).
- Enter envia, Shift+Enter quebra linha.
- Envio usa `sendDirectMessage` (já existe) com `origem: "inbox"`.

**Coluna 3 — Painel do contato**
- Cabeçalho: nome, telefone, cidade/UF, tags, botão "Ver ficha completa" (abre `/contatos/$id` em nova aba — no módulo de gestão).
- **Atribuição**: select "Atribuído a" com lista de usuários com acesso ao módulo. Trocar dispara notificação in-app pro novo dono.
- **Status da conversa**: `Aberta` / `Aguardando` / `Resolvida`. Resolvida some da lista padrão (fica no filtro "Resolvidas").
- **Notas internas**: textarea + histórico. Não sai pro WhatsApp. Suporta `@usuario` para menção (badge notifica o mencionado).
- **Timeline de atendimento**: quem abriu, quem respondeu, quem atribuiu, quem resolveu. Registrada em `conversation_events`.

## Atribuição + dashboard de tarefas (badge no menu)

- Botão "Comunicação" no menu lateral mostra **badge com número de conversas atribuídas a mim que estão não lidas + tarefas pendentes**.
- Dentro do módulo, filtro "Minhas" já dá a visão de tarefas. Sem tela separada nesta fase — mantém simples.
- Ao atribuir/mencionar, o destinatário vê badge atualizar em tempo real (Realtime na tabela `conversations`).

## Contatos dentro de /comunicacao

Aba "Contatos" idêntica visualmente à `/contatos` (mesmos filtros já refinados), **porém**:
- Read-only: sem ações de edição, sem merge, sem tags em massa.
- Filtro fixo: apenas contatos com `whatsapp_status = 'valido'` e sem `opt_out_at`.
- Ações disponíveis por linha: "Abrir conversa" (vai pro Inbox) e "Adicionar à seleção" (para envio em massa).
- Barra superior: "Selecionados: N" + botão "Enviar em massa" que abre o `SendWhatsAppWizard` existente.
- Envio em massa fica **exclusivamente** neste módulo. Na `/contatos` do sistema principal, remove-se o botão de envio em massa (fica apenas gestão/normalização).

## Aba "Contatos" no /relacionamento

Adicionar aba `Contatos` ao lado das existentes (Visão geral | Por mensagem | Por campanha | Recuperação | Engajados | Opt-out / problemas). Nesta aba: lista de contatos com estatísticas de relacionamento (última interação, respondeu?, atribuído a quem, nº de mensagens trocadas), com filtros e link para abrir no Inbox.

## Login e convites (já existe — só reafirmar fluxo)

O fluxo já implementado em `/usuarios` (convite por e-mail, aceite em `/aceitar-convite`, papéis) atende. Para o módulo Comunicação precisamos apenas de um novo papel/permissão **`comunicacao`** (pode conviver com `admin`, `operador`, `vrm`). Admin marca isso ao criar/editar o usuário.

## PWA / multi-dispositivo

- `public/manifest.webmanifest` já existe. Adicionar entry point `/comunicacao` como `start_url` alternativo (ou um segundo manifest para o app de comunicação com ícone próprio).
- Shell `/comunicacao/*` responsivo: 3 colunas em desktop, colapsa em drawer no mobile (lista de conversas → thread → painel deslizante).
- Instalável no celular. Usa a mesma sessão Supabase que o sistema principal.

## Detalhes técnicos

**Novas tabelas**

```sql
-- Uma linha por (contato) — estado da conversa no inbox
public.conversations (
  id uuid pk,
  contact_id uuid unique references contacts,
  status text check in ('aberta','aguardando','resolvida') default 'aberta',
  assigned_to uuid references auth.users null,
  last_message_at timestamptz,
  last_message_preview text,
  unread_count int default 0,
  updated_at timestamptz
)

-- Eventos de atendimento (atribuição, resolução, notas, menções)
public.conversation_events (
  id uuid pk,
  conversation_id uuid references conversations,
  actor_id uuid references auth.users,
  event_type text, -- 'assigned','unassigned','status_changed','note','mention','opened','closed'
  payload jsonb,   -- { to_user_id, from_status, to_status, note_text, mentioned_user_id, ... }
  created_at timestamptz
)
```

- RLS: `conversations` e `conversation_events` acessíveis apenas por usuários com papel `admin`, `operador`, `vrm` ou `comunicacao` (helper `private.is_communication_staff`).
- Trigger: ao inserir em `inbound_messages`, upsert em `conversations` (cria se não existir, atualiza `last_message_at`, `unread_count++`, `status='aberta'` se estava resolvida). Ao inserir em `direct_messages`/`campaign_recipients.sent_at`, mesma coisa mas sem incrementar `unread_count`.
- Realtime habilitado em `conversations` e `conversation_events` para atualizar UI ao vivo.
- `sendDirectMessage` estendido para aceitar `assigned_to` e registrar evento.

**Novos server functions em `src/lib/communication.functions.ts`**
- `listConversations({ filter, search, mine })` — substitui parte de `listInboxConversations`, agrupa por conversa.
- `getConversation({ id })` — retorna thread unificada (inbound + direct + campaign) + eventos + notas.
- `assignConversation({ id, user_id })`
- `setConversationStatus({ id, status })`
- `addConversationNote({ id, body, mentions })`
- `searchContactsForNewChat({ q })` — só contatos com WhatsApp válido, para iniciar nova conversa da busca.
- `listStaffUsers()` — pra dropdown de atribuição.

**Rotas novas**
```
src/routes/_authenticated/comunicacao.tsx                (shell/layout com <Outlet/>)
src/routes/_authenticated/comunicacao.index.tsx          (redirect -> /comunicacao/inbox)
src/routes/_authenticated/comunicacao.inbox.tsx          (Inbox 3 colunas)
src/routes/_authenticated/comunicacao.inbox.$conversationId.tsx (opcional — thread por URL)
src/routes/_authenticated/comunicacao.contatos.tsx       (lista read-only + seleção massa)
src/routes/_authenticated/comunicacao.campanhas.tsx      (redireciona/embute /campanhas)
src/routes/_authenticated/comunicacao.mensagens.tsx      (embute /mensagens)
src/routes/_authenticated/comunicacao.calendario.tsx     (embute /calendario)
src/routes/_authenticated/comunicacao.relacionamento.tsx (embute /relacionamento com nova aba Contatos)
src/routes/_authenticated/comunicacao.whatsapp.tsx       (QR + status, só admin)
```
Rotas antigas (`/inbox`, `/campanhas`, etc.) permanecem funcionando como aliases por 1 versão, para não quebrar links.

**Componentes novos principais**
- `CommunicationShell` (top bar com abas + badge, drawer mobile).
- `InboxConversationList`, `InboxThread`, `InboxContactPanel`.
- `AssignConversationSelect`, `ConversationStatusBadge`, `ConversationNotes`.
- `ComposerBar` (textarea + anexo + template picker + envio).

## O que NÃO entra na Fase 1

- Áudio/vídeo/stickers no inbox (só texto, imagem, PDF).
- Push notifications nativas (badge in-app já cobre).
- Atalhos `/comando` no composer.
- Relatórios de produtividade por atendente.
- Múltiplas instâncias Z-API (arquitetura fica com `instance_id` opcional para preparar).

## Onde testar quando pronto

1. Menu lateral: clicar "Comunicação" → abre `/comunicacao/inbox`.
2. Buscar por nome no topo → conversas existentes filtram; contato sem conversa aparece em "Iniciar conversa".
3. Abrir conversa → responder, anexar imagem, usar template.
4. Atribuir a outro usuário → logar com esse usuário em outro dispositivo/aba → ver badge atualizar em tempo real.
5. Marcar resolvida → sai da lista padrão, aparece em "Resolvidas".
6. Aba "Contatos" → selecionar 20 → "Enviar em massa" → wizard abre.
7. `/comunicacao/whatsapp` (admin) → QR aparece só se desconectado.
8. Instalar PWA no celular → login → usar inbox.
