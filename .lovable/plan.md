## Diagnóstico (verificado agora no banco e no código)

**1. Alicerce — o problema é real e é de dado, não de filtro**
Na base ativa: 97 contatos marcados "Sim", 222 marcados "Não" e **2.930 sem resposta** (coluna vazia). Ou seja: filtrar "Não" hoje traz 222 pessoas, porque a esmagadora maioria nunca respondeu. O motor já sabe filtrar vazio (existe a opção "(Vazio) — sem valor preenchido" no menu da coluna, com contagem), mas o rótulo é técnico e não deixa claro que "não é do Alicerce" ≠ "não respondeu". Falta também um atalho para "Não + não informado" de uma vez.

**2. Filtros de exclusão (NÃO) não existem**
Hoje todo filtro de lista é "tem pelo menos uma das opções marcadas" (OU). Não há nenhuma forma de dizer "todos, exceto quem tem a tag X". O motor já tem a infraestrutura pronta para isso: existe uma lista interna de IDs a excluir (usada em "não recebeu campanha", "não recebeu missão"), que só precisa ser alimentada por tags/valores escolhidos.

**3. Filtrar usuários do sistema não está disponível na tela**
O filtro `is_system_user` já existe e funciona no motor (e há 30 usuários na base), mas **não tem nenhum controle na interface** — nem no painel de filtros, nem no menu de coluna. Por isso é impossível hoje pedir "quem marcou uma forma de ajuda, exceto usuários".

Nada disso exige mudança de banco nem de dados existentes.

## O que será feito

### Passo 1 — Alicerce e outros campos Sim/Não mais claros (baixo risco, só apresentação)
- Renomear a opção vazia nesses campos para **"Não informado / não respondeu"**, com a contagem real ao lado (2.930).
- Adicionar, no menu da coluna, um atalho **"Marcar Não + Não informado"** para o caso mais comum ("quem não é do Alicerce").
- Mesmo tratamento em: participa de movimento social, consentimentos e demais campos Sim/Não.

### Passo 2 — Filtros de exclusão ("exceto")
No menu de cada coluna de lista, um seletor de modo com duas opções:
- **Contém alguma das marcadas** (comportamento atual, padrão);
- **Não contém nenhuma das marcadas** (novo).

Aplicado a: **tags** (prioridade), cidades, bairros, UF, profissão, instituição, formas de ajuda, disponibilidade, origem, status do ciclo, movimento social, como conheceu.

Comportamentos definidos para não gerar resultado confuso:
- Exclusão é aplicada **depois** dos filtros de inclusão (ex.: "tem tag Apoiador" + "exceto tag Descadastrado").
- Excluir uma tag remove o contato mesmo que ele tenha outras tags marcadas na inclusão — é isso que resolve o caso que você descreveu.
- Marcar "Não informado" no modo excluir significa "só quem tem algum valor preenchido".
- Os chips de filtros ativos no topo mostram exclusões em cor/prefixo diferente (ex.: "sem tag: Descadastrado") e podem ser removidos individualmente.

### Passo 3 — Filtro de usuários do sistema
- Novo filtro visível **"Usuários do sistema"** com três estados: *Todos (padrão)* · *Somente usuários* · *Esconder usuários*.
- Fica no painel de filtros (bloco Origem/Cadastro) e também como chip rápido no topo da Gestão da Base, para combinar com qualquer outro filtro ("forma de ajuda X, escondendo usuários").
- Padrão continua **Todos**, para não mudar silenciosamente nenhuma contagem que você já usa hoje.

### Passo 4 — Consistência em todos os consumidores dos filtros
Os novos parâmetros entram no mesmo motor central de filtros, então valem automaticamente para: lista da Gestão da Base, contadores/facetas, exportação CSV, seleção em massa (tags, edição de campo em comum, arquivar), criação de segmentos e a planilha de BI. Assim não aparece divergência entre "o que a tela mostra" e "o que a ação em massa afeta".

## Segurança e não-regressão
- Somente **adição** de parâmetros opcionais de filtro; nenhum filtro atual muda de comportamento ou de valor padrão.
- Sem migration, sem alteração de dados, sem mexer em RLS.
- Links e visões salvas antigas continuam válidos (parâmetros novos ausentes = comportamento atual).
- Validação ao final: conferir na tela que "Não + Não informado" em Alicerce soma 3.152, que excluir uma tag reduz o total esperado, e que "esconder usuários" reduz exatamente 30 contatos na base ativa.

## Detalhes técnicos
- `src/lib/crm-filters.ts`: novas chaves `*_excluir` (arrays) e `tag_ids_excluir`; aplicação via `.not(col,'in',...)` para colunas escalares e via `excludeIds` para tags; `is_system_user` já suportado.
- `src/lib/column-filter-mapping.ts`: mapear coluna → chave de exclusão; leitura/limpeza dos dois modos.
- `src/components/contacts-sheet/CheckboxListFilterPanel.tsx` e `ColumnFilterPopover.tsx`: seletor incluir/excluir + atalho Sim/Não/Não informado.
- `src/components/ContactFiltersPanel.tsx` + `ActiveFiltersChips.tsx` / `sheet-filter-chips.ts`: controle de usuários do sistema e chips de exclusão.
- `src/lib/crm-filter-options.functions.ts`: contagem de usuários do sistema para exibir no controle.
