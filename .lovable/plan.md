
## Objetivo

Deixar a tabela `/contatos` operacional direto pelo cabeçalho, sem precisar abrir o painel lateral de filtros para tarefas do dia a dia.

## Mudanças

### 1. Nova estrutura de colunas
Separar `Cidade/Bairro` em duas colunas independentes:

```text
[ ✓ ]  Nome ↕  |  WhatsApp  |  Cidade ▾  |  Bairro ▾  |  Tags ▾  |  Status ▾  |  Ações
```

- **Nome**: título clicável para ordenar (A→Z padrão, clique alterna Z→A, e depois "mais recentes").
- **WhatsApp**: sem filtro no header (já tem busca geral e filtros de status).
- **Cidade / Bairro / Tags / Status**: cada um vira um botão-dropdown no header com multi-seleção.

### 2. Ordenação por nome como padrão
- `sort` inicial passa de `"recent"` → `"name"` (o backend já suporta ambos em `listContactsRich`).
- Indicador visual `↑ / ↓` na coluna ativa; clique alterna asc/desc/recent.

### 3. Filtros direto no cabeçalho (multi-seleção)

Criar componente `ColumnFilterHeader` reutilizável — dropdown com:
- Busca interna (para cidades longas / muitas tags)
- Lista com checkboxes
- Contador ao lado do título quando filtro ativo: `Cidade (3)`
- Ações "Selecionar todos" / "Limpar"
- Aplica no `filters` do CRM (`cidades[]`, `bairros[]`, `tag_ids[]`, `lifecycle_statuses[]` + estados derivados)

Fontes de opções (já existem em `getContactFilterOptions`):
- Cidades: lista distinta com contagem
- Bairros: lista distinta com contagem — quando houver cidades selecionadas, filtra bairros por elas
- Tags: catálogo completo com cor
- Status: composto — Ativo / Arquivado / Opt-out / Telefone inválido / cada `lifecycle_status`

### 4. Sincronização com painel lateral e chips
- O painel `ContactFiltersPanel` (botão "Filtros") continua funcionando e reflete/edita o mesmo estado.
- Os `ActiveFiltersChips` continuam mostrando o resumo, com "×" para remover individual.
- Selecionar no header adiciona ao mesmo `filters`; nada duplica.

### 5. Detalhes de UX
- Cabeçalho fica sticky ao rolar (`sticky top-0`).
- Popover fecha ao clicar fora ou ao pressionar Esc.
- Se a coluna não tem opções (ex.: base sem bairros), o botão exibe "Sem opções" desabilitado.
- Mobile: cabeçalho vira acordeão simples (mantém dropdowns funcionando com touch).

## Detalhes técnicos

**Arquivos alterados**
- `src/routes/_authenticated/contatos.index.tsx`
  - Trocar `<thead>` por cabeçalho com o novo componente
  - Trocar `<td>` de "Cidade/Bairro" por duas células
  - `useState<"name-asc" | "name-desc" | "recent">("name-asc")` e mandar para `listFn`
  - Handler que faz merge `setFilters((f) => ({ ...f, cidades: novo }))`
- `src/components/ColumnFilterHeader.tsx` **(novo)**
  - Props: `label`, `options: {value, label, count?, color?}[]`, `selected: string[]`, `onChange`, `searchable?`
  - Baseado em `Popover` + `Command` do shadcn (já usado em `MultiSelectFilter`) — pode reaproveitar/estender o existente
- `src/lib/crm-bulk.functions.ts`
  - Suportar `sort: "recent" | "name" | "name-desc"` (adicionar o desc)

**Sem mudanças em**: schema do banco, RLS, `crm-filters.ts` (multi-select já existe), painel lateral, chips, envio em massa.

## Fora de escopo (para próximas iterações, se quiser)
- Reordenar / esconder colunas por usuário
- Salvar a ordenação/filtros no URL (`?sort=name-asc&cidades=…`)
- Ordenar por outras colunas (Cidade, Status)

## Cuidados
- Preservar comportamento atual do painel "Filtros" e dos chips.
- Não quebrar contagem `129 resultado(s)` — continua vindo do `count: "exact"`.
- Não afetar seleção em massa: `idsByFilter` já usa o mesmo `filters`.
