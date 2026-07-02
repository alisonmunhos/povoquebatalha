# Fase 2 — Papéis, Escopo Territorial, /territorio e Mapa com painel

Escopo entregue em uma única execução de build. Objetivo: separar responsabilidades por papel, permitir escopo geográfico por usuário, entregar módulo de território mobile-first e enriquecer o mapa com painel lateral e ações rápidas.

## 1. Banco de dados (migration única)

- **Enum `app_role`**: adicionar valores `vrm` e `territorio` (mantendo `admin`, `operador`, `leitor`).
- **Nova tabela `user_territory_scopes`** (escopo geográfico por usuário):
  - `user_id uuid` (FK auth.users)
  - `uf text`, `cidade text`, `bairro text` (qualquer combinação; NULL = "todos")
  - unique parcial para evitar duplicidade exata
  - RLS: admin gerencia; usuário lê o próprio escopo
- **Função `private.user_can_see_contact(contact_row)`**: retorna true se admin/operador/vrm OU se o contato bate com pelo menos um escopo do usuário (territorio/leitor com escopo).
- **Ajuste em policies de leitura** de `contacts` (e `contact_audit_log`, `message_events`) para respeitar escopo territorial quando papel for `territorio` ou `leitor` com escopo.
- **Função RPC `assign_territory_scope(user_id, uf, cidade, bairro)`** e `remove_territory_scope(id)` — admin only.

## 2. Backend (server functions)

- `src/lib/territory.functions.ts`:
  - `listMyScopes()` — escopos do usuário logado.
  - `listUserScopes(userId)` — admin.
  - `addScope`, `removeScope` — admin.
  - `getTerritoryOverview()` — KPIs do escopo do usuário: total de contatos, engajados, opt-outs, últimas interações.
  - `listTerritoryContacts(filters)` — lista mobile-friendly (paginada, com telefone e endereço curto).
- Atualizar `src/lib/map.functions.ts`:
  - `getContactDetailForMap(id)` — dados enxutos para o painel.
  - `sendQuickWhatsApp({contactId, templateId|text})` — envia via Z-API respeitando papel e escopo.
- Atualizar `src/lib/users.functions.ts` para expor escopos ao editar usuário.

## 3. UI — Papéis e escopo (`/usuarios`)

- Dropdown de papel passa a incluir `vrm` e `territorio`.
- Ao selecionar `territorio` ou `leitor`, mostrar painel de **Escopos**: adicionar UF/cidade/bairro com autocomplete a partir de `getContactFilterOptions`.
- Listagem dos escopos com botão remover.

## 4. Nova tela `/territorio` (mobile-first)

- Rota `_authenticated/territorio.tsx`.
- Layout single-column otimizado para celular:
  - Header com nome do território ativo (concatenação dos escopos).
  - Cards de KPI: apoiadores no território, engajados últimos 30d, opt-outs, precisando de atualização.
  - Lista de contatos do escopo com busca, badges (tags), botão "Abrir ficha" e "WhatsApp".
- Item de menu "Território" na sidebar já mostra este link (substitui o placeholder atual do mapa como único item do grupo).

## 5. Mapa com painel lateral (`/mapa`)

- Ao clicar num pin, abre painel lateral (Sheet no mobile, coluna fixa no desktop) com:
  - Nome, telefone, endereço, tags, status de lifecycle.
  - Timeline resumida (últimas 3 interações).
  - Botões: "Abrir ficha", "Enviar WhatsApp" (abre mini-form com template ou texto livre) e "Ver no território".
- Filtros do mapa passam a respeitar escopo do usuário automaticamente (server-side).
- Botão "Voltar ao CRM com este filtro" para exportar o recorte para `/contatos`.

## 6. Menu lateral

- Grupo **Território** agora contém: `Território` (nova) e `Mapa`.
- Papéis `territorio` veem apenas Território, Mapa e Inbox (quando aplicável).

## Detalhes técnicos

- Todas as funções server usam `requireSupabaseAuth`; helpers `assertRole('admin')`, `assertRoleAny(['admin','vrm'])`, `assertHasScopeAccess()`.
- Envio de WhatsApp rápido reutiliza `src/lib/zapi.functions.ts` + registra em `direct_messages` e `contact_audit_log`.
- Mapa: painel lateral usa `Sheet` no mobile e layout flex no desktop; sem mudança na lib de mapa.
- Menu: filtragem por papel feita client-side com base em `useRoles`.

## Limitações aceitas nesta fase

- Escopo territorial baseado em texto exato (UF/cidade/bairro), sem polígonos.
- Sem realtime no mapa nem no /territorio.
- Sem push/notificações mobile — apenas layout responsivo.

Aprovado? Se sim, respondo com "Fase 2" e executo tudo em um único build.
