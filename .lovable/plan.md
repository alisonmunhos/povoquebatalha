## O que está acontecendo hoje (verificado no código)

1. **Missão e Evento são de escolha única.** Em `src/lib/crm-filters.ts` o esquema tem `missao_id`, `evento_id`, `missao_recebida` e `evento_rsvp` como valor único; na interface (`ContactFiltersPanel.tsx`, linhas 401–422) eles usam `SingleSelectFilter`. Por isso não têm caixinhas de seleção como Tags/Cidade — e não existe hoje nenhuma forma de perguntar "recebeu mensagem de 2 ou mais missões".

2. **Todos os filtros de lista são "QUALQUER um dos marcados" (OU).** Tags (`resolveContactIdsForTagFilter`) e Formas de ajuda (linhas 519–531) montam cláusulas OR. Não existe "tem TODAS as marcadas", nem "tem SOMENTE essas", nem contagem.

3. **"Esconder os marcados" é um modo que substitui a inclusão.** Em `src/lib/filter-exclusion.ts`, `applyFilterSelection` apaga o lado oposto: ao escolher "esconder", a seleção de inclusão é descartada. Logo, "tem as tags 4–13 mas não tem a 2" é impossível em um único campo — e a alternância sem explicação é o que deixa a experiência confusa.

## Plano

### Etapa 1 — Novo vocabulário de combinação (base)
Criar `src/lib/filter-match-mode.ts` com 4 modos por campo de lista, em linguagem simples:

```text
Qualquer um dos marcados   (OU)      → tem pelo menos 1
Todos os marcados          (E)       → tem todos, pode ter outros
Somente os marcados        (exato)   → tem esses e nada além
Nenhum dos marcados        (NÃO)     → exclusão
```

Chaves novas no esquema, por campo: `<campo>_modo` (`qualquer | todos | somente`) mantendo `<campo>_excluir` como o "nenhum". Isso preserva URLs e visões salvas já compartilhadas (padrão = `qualquer`, comportamento atual).

### Etapa 2 — Incluir e excluir ao mesmo tempo
- `applyFilterSelection` deixa de apagar o lado oposto; passa a gravar dois conjuntos independentes por campo: **marcados para mostrar** e **marcados para esconder**.
- Motor: em Tags, resolver os IDs por modo (`todos` = interseção de conjuntos por tag; `somente` = interseção + contagem total de tags igual à seleção) e sempre subtrair o conjunto de exclusão.
- Em colunas jsonb (formas de ajuda, disponibilidade, movimentos sociais): `todos` = `cs` encadeado; `somente` = `cs` da seleção + `jsonb_array_length = n`; `nenhum` = `not.cs` (já existe).
- Resultado: "tem pelo menos as tags 4 a 13, mas não tem a 2" = modo **Todos** com 4–13 marcadas + 2 marcada em **esconder**. "Só tem a tag X" = modo **Somente**.

### Etapa 3 — Interface clara no lugar do alternador atual
No `MultiSelectFilter` (e no popover de coluna da planilha BI):
- Um seletor de 4 botões no topo com rótulo explicativo dinâmico ("Mostra quem tem **todas** as opções marcadas — pode ter outras também").
- Uma segunda aba dentro do mesmo popover: **Esconder** — lista igual, marcações separadas, com contador ("2 escondidos").
- Rodapé mostra a frase final do filtro antes de aplicar, ex.: *"tem todas: Alicerce, Rua… · não tem: Voluntário"*.
- Os chips de filtros ativos (`sheet-filter-chips.ts`, `ActiveFiltersChips.tsx`) passam a mostrar a mesma frase, para o filtro nunca ser opaco.

### Etapa 4 — Missões e Eventos com seleção múltipla + contagem
- Esquema: `missao_ids: string[]`, `evento_ids: string[]` (mantendo `missao_id`/`evento_id` como entrada compatível), com `missao_ids_modo` (qualquer/todos) e `missao_ids_excluir`.
- Novo filtro **"Quantas missões recebeu"**: `missoes_recebidas_min` / `missoes_recebidas_max` (ex.: mínimo 2 = "recebeu mensagem de 2 ou mais missões"), calculado por contagem distinta de `mission_id` em `agitation_tasks` com status `enviado`.
- Mesma estrutura para eventos: seleção múltipla de eventos + situação (confirmou / recusou / não confirmou) e contagem mínima de presenças confirmadas.
- A interface desses dois campos passa a usar o mesmo componente de caixas de seleção dos outros, resolvendo a inconsistência das telas anexadas.

### Etapa 5 — Verificação
- Conferir no banco alguns casos reais (contato com 2+ missões enviadas; contato com só uma tag) e comparar com o resultado do filtro na tela.
- Garantir que listagem, exportação CSV, seleção em massa e a planilha BI usem o mesmo motor (`resolveRelationalFilterIds` / `applyCrmFilters`), sem regressão nos filtros existentes.

## Detalhes técnicos
Arquivos afetados: `src/lib/crm-filters.ts` (esquema + resolvedores), `src/lib/filter-exclusion.ts` → estendido por `src/lib/filter-match-mode.ts`, `src/components/MultiSelectFilter.tsx`, `src/components/ContactFiltersPanel.tsx`, `src/components/contacts-sheet/ColumnFilterPopover.tsx`, `src/lib/column-filter-mapping.ts`, `src/lib/sheet-filter-chips.ts`, `src/lib/crm-filter-options.functions.ts`. Sem migration obrigatória; se a contagem de missões ficar lenta, adiciono uma view/índice em migration separada, sem apagar dados.
