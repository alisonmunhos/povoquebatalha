## Objetivo

Criar uma tela de acompanhamento (somente leitura) para o admin ver como as Missões de Agitação estão andando: quem está enviando, quem travou, e a taxa de conclusão por missão. Nada nessa tela altera tarefas, levas, atribuições ou status — risco zero para o que já funciona hoje.

## O que o admin vai ver

Nova tela **Desempenho** dentro de Missões de Agitação (`/missoes-agitacao/desempenho`), com link no topo da lista de missões.

1. **Resumo geral** (cards): total de contatos em missões, enviados, "vou enviar depois", não enviados, arquivados, e taxa de conclusão em %.
2. **Ranking de agitadores**: uma linha por responsável (agitador com conta ou link avulso), com atribuídos, enviados, vou enviar depois, não enviados, arquivados, % de conclusão e data da última ação. Ordenável por enviados ou por % de conclusão.
3. **Por missão**: uma linha por missão com os mesmos números, barra de progresso, marcadores de Pausada / Arquivada / Auto-atribuição e link para o detalhe da missão já existente.
4. **Filtros**: período (7 / 30 / 90 dias / tudo), e missões ativas / arquivadas / todas — reusando o mesmo vocabulário de status já centralizado.

Estados claros: "Carregando…", "Nenhuma missão neste período" e explicação curta de cada coluna via tooltip.

## Detalhes técnicos

- Novo arquivo `src/lib/agitation-performance.functions.ts` com um único server fn `getMissionsPerformance` (`createServerFn({ method: "GET" })` + `.middleware([requireSupabaseAuth])`), validado com Zod (`{ visibility, days }`).
  - Lê `agitation_missions` (id, title, created_at, paused_at, archived_at, is_open) e `agitation_tasks` (mission_id, status, assigned_user_id, assigned_contact_id, assigned_at, created_at) via `context.supabase` (RLS aplicada).
  - Nomes: `contacts.nome` para links avulsos; `profiles.full_name` para agitadores com conta, carregado com `supabaseAdmin` importado **dentro** do handler, apenas para resolver nomes — mesmo padrão já usado em `getMissionDetail`.
  - Agregação em memória usando `TASK_STATUS` / `taskStatusFilterKey` de `src/lib/agitation-task-status.ts`, sem criar um segundo dicionário de status.
- Nova rota `src/routes/_authenticated/missoes-agitacao.desempenho.tsx` → `createFileRoute("/_authenticated/missoes-agitacao/desempenho")`, com `head()` próprio. Dados via `useServerFn` + `useQuery` (não em loader).
- Componentes de apresentação em `src/components/mission-performance/` (cards de resumo, tabela de ranking, tabela por missão) para manter os arquivos pequenos e reutilizáveis.
- Link "Ver desempenho" no cabeçalho de `missoes-agitacao.index.tsx`; item de menu apenas para `admin` no `AppShell`, seguindo o padrão atual.
- Sem migrations, sem alteração de schema, sem escrita no banco. `tsgo` no final.

## Fora do escopo desta etapa

Desarquivar em lote, contador de duplicidades no painel, liberação dos contatos travados da missão "Convite Plenária PPB" e as decisões pendentes sobre arquivados/usuários no total da base — ficam para um passo seguinte.
