## 1. Por que você não vê os filtros de exclusão

Conferi o código. A funcionalidade existe, mas **só em um lugar** — e não é o lugar onde você está olhando:

- **Backend pronto e completo**: `src/lib/crm-filters.ts` tem 21 chaves `*_excluir` (tags, cidade, bairro, UF, profissão, formas de ajuda, disponibilidade, origem, status de telefone etc.) com a lógica de exclusão aplicada nas consultas.
- **Interface existe apenas na planilha `/contatos-bi`**: o botão "Esconder os marcados" está em `ColumnFilterPopover.tsx`, componente usado só por aquela tela.
- **Gestão da Base (`/contatos`) não tem o botão**: essa tela usa `ContactFiltersPanel` e `ColumnFilterHeader`, e nenhum dos dois oferece o modo "exceto". Ou seja: o motor está lá, mas sem controle na tela onde você trabalha.

O filtro de usuários (Todos / Somente usuários / Esconder usuários) **está** na Gestão da Base — esse já funciona.

### O que fazer
1. Adicionar no painel de filtros da Gestão da Base, em cada filtro de múltipla escolha, o mesmo par de modos já existente na planilha: **"Mostrar os marcados"** / **"Esconder os marcados"**.
2. Mesmo controle nos filtros de cabeçalho de coluna (`ColumnFilterHeader`), reaproveitando `getColumnExcludeKey`.
3. Chips de filtro ativo mostrando "exceto ..." (a lógica de rótulo já existe em `sheet-filter-chips.ts`; usar a mesma na tela de contatos).
4. Como filtros já vivem na URL nessa tela, as chaves `*_excluir` passam a ser compartilháveis e sobrevivem à exportação.

Risco baixo: nada muda no motor de consulta, só se expõe na interface um caminho que já está testado na planilha.

## 2. A Fase D ainda faz sentido? Sim — e não ameaça o que funciona

Depois das atualizações de hoje (vocabulário `sem_acao` / `pendente_envio` / `enviado` / `arquivado_erro` / `arquivado_optout`, levas com cancelamento, etiqueta "Concluída parcialmente"), a Fase D fica **mais fácil**, não mais arriscada: os status que ela precisa ler já estão padronizados em `agitation-task-status.ts`.

Ajustes na Fase D por causa do que mudou:
- Usar exclusivamente os status novos, sem nenhuma tradução própria — o painel lê a mesma fonte que a tela do agitador.
- Considerar levas canceladas/liberadas como não-conclusão, para não repetir o problema de "concluiu sem enviar".
- Nada de escrita: é tela de leitura agregada. Não altera tarefa, leva, arquivamento nem notificação.

**Recomendação de ordem**: fazer o item 1 (filtros "exceto" na Gestão da Base) primeiro, porque é um recurso que você já esperava ter e é isolado; a Fase D depois.

## Detalhes técnicos

- Item 1: `src/components/ContactFiltersPanel.tsx` e `src/components/ColumnFilterHeader.tsx` ganham modo include/exclude por filtro; reaproveitam `getColumnExcludeKey` e `CrmFilters` sem alterar `crm-filters.ts`; rótulos via helper compartilhado de chips. Sem migration.
- Fase D: rota nova de leitura, agregação em `agitation-missions.functions.ts` sobre `agitation_tasks` + `agitation_mission_claims`, reaproveitando `TASK_STATUS` e `share-image.ts`. Sem migration, sem escrita.

## Cuidados

- Consentimentos e campos sensíveis não entram no modo "exceto" de forma diferente do que já existe hoje — o comportamento de leitura é o mesmo.
- A planilha `/contatos-bi` continua exatamente como está; nenhum componente dela é reescrito.
