## Passo 1 — Auditoria completa das checagens de papel

### Já usam `authz.ts` (manter como está)

| Arquivo | Helper | Papéis exigidos |
|---|---|---|
| `src/lib/campaigns.functions.ts:176` | `requireStaff` | admin, vrm, operador |
| `src/lib/messages.functions.ts:121,174,205` | `requireStaff` | admin, vrm, operador |
| `src/lib/link-preview.functions.ts:143` | `requireStaff` | admin, vrm, operador |
| `src/lib/geocoding.functions.ts:47,138` | `requireStaff` | admin, vrm, operador |

### Checagens inline a migrar

| Arquivo:linha | Contexto | Papéis exigidos hoje | Helper alvo |
|---|---|---|---|
| `src/lib/zapi.functions.ts:43-49` | desconectar instância Z-API | admin | `requireAdmin` |
| `src/lib/zapi.functions.ts:90-93` | salvar configuração de instância | admin | `requireAdmin` |
| `src/lib/zapi.functions.ts:118-121` | ver token de webhook | admin | `requireAdmin` |
| `src/lib/users.functions.ts:6-15` (`assertAdmin`) | usado em várias ações de gestão de usuários | admin | `requireAdmin` |
| `src/lib/territory.functions.ts:12-14` (`assertAdmin`) | CRUD de escopos territoriais | admin | `requireAdmin` |
| `src/lib/duplicates.functions.ts:89-94` | mesclar contatos | admin | `requireAdmin` |
| `src/lib/imports.functions.ts:576-582` | flag `isAdmin` para exibir/ocultar dados de import | admin (soft — só afeta visão) | `hasRole` (variante que retorna boolean, não throw) |
| `src/lib/imports-undo.functions.ts:24-30` | desfazer importação | admin | `requireAdmin` |
| `src/lib/contacts.functions.ts:226-233` | excluir contato definitivamente | admin | `requireAdmin` |
| `src/lib/communication.functions.ts:262-264` | vincular conversa a contato | admin, vrm | `requireRole([admin, vrm])` |
| `src/lib/communication.functions.ts:323-325` | criar contato rápido de conversa | admin, vrm, operador | `requireStaff` |
| `src/lib/communication.functions.ts:488-491` | listar staff atribuíveis a conversa | admin, operador, vrm, comunicacao | `requireRole` inverso — é uma **query de lista**, não uma checagem do caller; permanece como consulta direta (não é checagem de permissão do usuário) |
| `src/lib/inbox.functions.ts:206-209` | enviar mensagem inbox | admin, vrm, operador | `requireStaff` |

### Usos legítimos que NÃO são checagem de permissão (não mexer)

- `src/lib/users.functions.ts:43,146,254,288,290` — **escritas/leituras da tabela** `user_roles` (gestão de papéis, não checagem do caller).
- `src/routes/api/public/bootstrap-admin.ts:20,87` — bootstrap inicial (roda com service role + secret, não valida caller autenticado).
- `src/hooks/use-auth.ts:42`, `src/hooks/use-current-role.ts:30`, `src/routes/auth.tsx:73` — **client-side**, lendo papéis do próprio usuário para UI. Só `use-current-role.ts` importará o tipo canônico (Passo 5); os demais continuam usando `AppRole` local mas passando a importar do mesmo lugar.

### Possíveis inconsistências detectadas (a discutir, NÃO alterar)

1. **`communication.functions.ts:488-491`** lista `admin, operador, vrm, comunicacao` como staff atribuível, mas `authz.ts:requireStaff` só considera `admin, vrm, operador` (sem `comunicacao`). Duas definições de "staff" convivem. Vou preservar ambas na refatoração e sinalizar no resumo final.
2. **Papéis `territorio` e `agitador`** nunca aparecem em nenhuma checagem de escrita no backend — só têm efeito via RLS + UI. Fora de escopo, apenas registrado.

---

## Passo 2 — Tipo canônico de papel

Criar `src/lib/roles.ts` (client-safe, sem imports de servidor) exportando:

```ts
import type { Database } from "@/integrations/supabase/types";
export type AppRole = Database["public"]["Enums"]["app_role"];
// = "admin" | "operador" | "leitor" | "vrm" | "territorio" | "comunicacao" | "agitador"
```

Consumidores:
- `src/lib/authz.ts` — substitui o `type Role` local por `AppRole`.
- `src/hooks/use-current-role.ts` — importa `AppRole` (mantém a ordem de prioridade local, apenas tipada).
- `src/hooks/use-auth.ts` — importa `AppRole` (remove definição local duplicada).

## Passo 3 — Novos helpers em `authz.ts`

Manter `requireStaff` e `requireAdmin` inalterados na assinatura/semântica. Adicionar:

```ts
export async function hasRole(supabase, userId, roles: AppRole[]): Promise<boolean>
export async function requireRole(supabase, userId, roles: AppRole[], errorMsg?: string): Promise<void>
```

`requireStaff` e `requireAdmin` passam a delegar internamente para `hasRole` (para não duplicar a query).

## Passo 4 — Migrar checagens inline

Substituições conforme tabela do Passo 1:

- `zapi.functions.ts` (3 pontos) → `requireAdmin`
- `users.functions.ts` `assertAdmin` local → deletado, chamadas passam a usar `requireAdmin` de `authz.ts`
- `territory.functions.ts` `assertAdmin` local → deletado; substituir por `requireAdmin`. `getRoles(ctx)` (usada em `me()` e outra função que RETORNA a lista de papéis para o cliente) permanece como está — não é checagem, é leitura para retornar ao UI
- `duplicates.functions.ts` → `requireAdmin`
- `imports.functions.ts:576-582` → `hasRole(sb, userId, ["admin"])` (mantém como boolean, comportamento inalterado)
- `imports-undo.functions.ts` `requireAdmin` local → substituído por import de `authz.ts`
- `contacts.functions.ts:226-233` → `requireAdmin`
- `communication.functions.ts:262-264` → `requireRole(..., ["admin","vrm"], "Apenas admin/vrm podem vincular conversas.")`
- `communication.functions.ts:323-325` → `requireStaff` (mesma combinação admin/vrm/operador)
- `communication.functions.ts:488-491` → **não alterar** (é query de lista, não checagem do caller)
- `inbox.functions.ts:206-209` → `requireStaff`

Mensagens de erro preservadas nas migrações onde diferem do default de `requireStaff`/`requireAdmin`.

## Passo 5 — Client (fora de escopo além do tipo)

- `use-current-role.ts`: só troca o tipo `AppRole` local por import de `src/lib/roles.ts`. Ordem de prioridade permanece intocada.
- `use-auth.ts`: idem.

## Passo 6 — Typecheck

Rodar `bunx tsgo --noEmit` ao final.

---

## Detalhes técnicos

- Sem migration, sem mudança de RLS, sem mudança de comportamento de acesso.
- Não incluir `communication.functions.ts:488-491` na migração (é uma query, não uma checagem do caller autenticado).
- `users.functions.ts:6-15` define `async function assertAdmin(ctx)` local — remover essa função e substituir todas as chamadas dela por `requireAdmin(ctx.supabase, ctx.userId)`.
- `territory.functions.ts:12-14` mesma coisa (`assertAdmin` local).
- `imports-undo.functions.ts` também tem um `requireAdmin` local — remover em favor do de `authz.ts`.
- `authz.ts` continua sem `middleware` porque cada handler já usa `requireSupabaseAuth`; helpers apenas checam papel.

## Entregáveis finais

(a) Lista de arquivos alterados.
(b) Lista consolidada de "possíveis inconsistências não alteradas" (mínimo: item 1 do Passo 1 sobre `staff` divergente em `communication.functions.ts:488`; e observação sobre `territorio`/`agitador` sem uso backend).
(c) Checklist manual sugerido:
- Login como **admin**: desconectar/configurar Z-API, mesclar duplicidades, excluir contato, desfazer import, gerenciar usuários e territórios — tudo deve funcionar.
- Login como **operador**: enviar mensagem no inbox, criar contato rápido de conversa, iniciar campanha — funcionar; desconectar Z-API / mesclar duplicidades — bloqueado.
- Login como **vrm**: vincular conversa a contato — funcionar; ações admin — bloqueadas.
- Login como **comunicacao**: aparecer na lista de staff atribuível a conversas; NÃO conseguir vincular conversa nem criar contato de conversa (mantém comportamento atual, é a "inconsistência 1").
- Login como **leitor / territorio / agitador**: painéis abrem, escritas privilegiadas bloqueadas com mensagens em pt-BR.

Aguardando confirmação da tabela de auditoria (Passo 1) antes de prosseguir com Passos 2-6.
