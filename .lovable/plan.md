## Fase 3 — Segurança, login mobile e Território mini-app

Executarei em uma única build, dividido em blocos técnicos abaixo.

### 1. Bloqueio de cadastro público (`/auth`)
- Confirmar que `disable_signup=true` no Auth (já está); remover qualquer link/CTA de "criar conta" na UI.
- Rejeitar login de usuário sem role válida: após `signInWithPassword`, checar `user_roles`; se vazio ou role revogada → `signOut()` + mensagem "Acesso não autorizado. Solicite convite ao administrador."

### 2. Login mobile-friendly
- Refatorar `src/routes/auth.tsx`: container com `min-h-dvh`, scroll interno, sem `overflow-hidden`, campos `h-12 text-base`, botão `w-full h-12`, safe-area padding, teste em 360/390px.
- Suporte a `?next=/rota`: preservar querystring e navegar após login. Rota `_authenticated` passa `next=location.pathname` ao redirecionar.

### 3. Redirect por papel
- Helper `defaultRouteForRoles(roles)`: admin→/dashboard, vrm→/relacionamento, territorio→/territorio, leitor→/dashboard.
- Guard central em `_authenticated/route.tsx`: se role=territorio e path não começa com `/territorio` → redirect `/territorio`.

### 4. `/usuarios` como central de acesso
- Abas: Usuários ativos, Convites pendentes, Escopos territoriais, Auditoria.
- Colunas ampliadas: papel, status, último login, criado, convidado por, escopo, ações (alterar papel, editar escopo, suspender, reativar, revogar, reenviar convite).
- Status via nova coluna `profiles.status` (`ativo|suspenso|revogado`) + convites via `auth.admin.listUsers` filtrando `invited_at & !last_sign_in_at`.

### 5. Convites
- Manter `inviteUser` server-fn. Adicionar: `resendInvite`, `cancelInvite`, `copyInviteLink` (usa `generateLink type=invite`).
- Convites amarrados ao e-mail (Supabase já garante); admin pode editar papel/escopo antes do aceite.

### 6. Papéis e permissões (server-side)
- Middleware helper `requireRole(roles[])` em cada server-fn sensível: contatos edit/exportar, importar, campanhas, mensagens, Z-API, inbox, usuários — bloqueia `territorio` e `leitor`.
- Menu do `AppShell` já filtra por role; reforçar guards de rota.

### 7. Escopo territorial server-side
- Todas as fns usadas por `/territorio` e mapa (quando role=territorio) aplicam filtro por `user_territory_scopes` do próprio caller.
- Se sem escopo → retornar vazio + flag `noScope=true` (UI mostra aviso).
- `getMapContacts` recebe role no server; se territorio, força escopo.

### 8. `/territorio` mini-app mobile-first
- Nova layout route `_territorio` (fora de `_authenticated` AppShell) com header próprio "Modo Território" e sem sidebar.
- Redirect: usuários com role=territorio caem aqui; admin/vrm continuam podendo abrir via menu.
- Abas Lista / Mapa, filtros (cidade, bairro, tag, formas_ajuda, movimento_social, profissão, busca).
- Cards com botões grandes: WhatsApp, Ver no mapa, Marcar realizado, Observação.

### 9. WhatsApp pessoal
- Botão abre `https://wa.me/<phone>?text=<msg>` (encoded); antes registra log `whatsapp_pessoal_aberto`.
- Nunca marca envio; botão manual separado "Marcar contato realizado".

### 10. `territory_contact_logs`
- Migration: tabela com `user_id, contact_id, action, note, created_at`; RLS: territorio vê os próprios, admin/vrm veem todos.
- Actions enum: `whatsapp_aberto|contato_realizado|nao_encontrado|pediu_atualizacao|observacao`.
- Exibir seção "Território" em `/contatos/$id` (admin/vrm).

### 11. PWA básico
- `public/manifest.webmanifest` (nome "Território — Povo que Batalha", start_url `/territorio`, display standalone, theme color, ícone placeholder).
- `<link rel="manifest">` no `__root.tsx`. Sem service worker (per PWA guidance).
- Card em `/territorio` e `/links` com instruções "Adicionar à tela inicial" e link copiável `/territorio`.

### 12. Mapa por escopo
- `/mapa` continua para admin/vrm. Para territorio, esconder do menu e do guard bloquear rota direta; usa apenas mapa dentro de `/territorio`.

### 13. Auditoria
- Reutilizar `contact_audit_log` para eventos de território; nova tabela leve `access_audit_log` (evento, actor_id, target_user_id, meta jsonb) para convites/papel/escopo/suspensão.

### 14. Não fazer
- pg_cron, HSM, heatmap, raio, calendário DnD, chatbot, múltiplas instâncias, redesign global.

---

### Alterações técnicas (arquivos)
- Migrations: `profiles.status`, `territory_contact_logs`, `access_audit_log`, RLS.
- `src/routes/auth.tsx` (mobile + next + role gate).
- `src/routes/_authenticated/route.tsx` (role guard, redirect territorio).
- Novo `src/routes/_territorio/route.tsx` + mover `/territorio` para dentro (ou wrapper condicional).
- `src/lib/users.functions.ts`, `src/lib/territory.functions.ts`, `src/lib/map.functions.ts` (escopo server-side, novas fns).
- `src/routes/_authenticated/usuarios.tsx` (abas).
- `src/components/AppShell.tsx` (filtro por role reforçado).
- `public/manifest.webmanifest` + `__root.tsx`.

### Riscos / limitações
- Detectar role no client para escolher layout do `/territorio` causa flash — usarei `ssr:false` + loader que aguarda role.
- Sem service worker (por diretriz PWA): "adicionar à tela inicial" funciona, offline não.
- Auditoria mínima; sem UI complexa de filtro.

Confirma para eu executar tudo em uma build?
