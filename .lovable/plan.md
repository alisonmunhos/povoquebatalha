## Objetivo

Resolver as duas causas do resultado zero no filtro de missões, sem tocar na planilha do BI nem na lógica de tags.

---

## Mudança 1 — Acabar com o conflito silencioso Mostrar × Esconder

Hoje o menu guarda duas listas independentes (`missao_ids` e `missao_ids_excluir`). Marcar a mesma missão nos dois lados sempre resulta em zero, sem aviso.

Correção em duas camadas:

1. **Exclusividade por item (principal):** ao marcar uma opção em uma aba, ela é automaticamente desmarcada na aba oposta. Um item nunca fica nos dois lados. O rótulo "escondido"/"mostrado" que aparece hoje ao lado da opção deixa de ser um estado possível de conflito.
2. **Trava de segurança no "Aplicar":** se, por qualquer caminho (visão salva antiga, URL colada), houver sobreposição entre as duas listas, o botão Aplicar mostra um aviso vermelho no rodapé do menu — "As mesmas opções estão em Mostrar e Esconder; isso sempre traz zero resultados" — com um botão "Corrigir" que remove os itens repetidos do lado Esconder.

Também passa a aparecer, no rodapé do menu, a frase já existente do `describeSelection` de forma mais visível (ex.: "tem qualquer: A, B · não tem: C"), para o usuário conferir a leitura antes de aplicar.

**Risco:** baixo. É um componente compartilhado por todos os filtros de lista, então mexer nele afeta todos os campos — mas a mudança é só de estado local de rascunho (draft), sem alterar o formato gravado nos filtros.

---

## Mudança 2 — Caminho explícito "não recebeu nenhuma destas"

Adicionar um quarto modo de combinação, ao lado de "Qualquer uma / Todas / Somente essas":

- **Nenhuma destas** → grava as opções marcadas apenas no lado de exclusão (`missao_ids_excluir`) e deixa o lado de inclusão vazio. Resultado: mantém todos os outros filtros (ex.: a tag) e remove quem recebeu qualquer uma das missões marcadas.

Assim o caso relatado ("tag terceirizadas E não recebeu nenhuma das 3 missões") é feito numa única aba, marcando as 3 missões e escolhendo "Nenhuma destas" — sem passar pela aba Esconder e sem entender a diferença entre os modos.

Texto de ajuda do modo: "Mostra quem NÃO tem nenhuma das opções marcadas (os outros filtros continuam valendo)."

O modo se aplica aos campos que já suportam combinação: tags, formas de ajuda, disponibilidade, missões e eventos. A aba "Esconder" continua existindo para o caso avançado de misturar inclusão e exclusão no mesmo campo.

**Risco:** médio-baixo. O motor de consulta não muda — "Nenhuma destas" reaproveita o caminho de exclusão que já funciona. O ponto de atenção é o modo não ser gravado em `*_modo` quando a inclusão está vazia (hoje a gravação apaga o modo nesse caso), então o menu precisa reconstituir "Nenhuma destas" ao reabrir; será tratado permitindo persistir o modo quando houver exclusão.

---

## Arquivos tocados

| Arquivo | O que muda |
|---|---|
| `src/lib/filter-match-mode.ts` | novo modo `nenhuma` (rótulo, ajuda, lista de modos, leitura do modo salvo, frase descritiva) |
| `src/lib/filter-exclusion.ts` | `applyFilterSides` passa a aceitar/persistir o modo `nenhuma` (gravar exclusão + manter a chave de modo) |
| `src/components/MultiSelectFilter.tsx` | exclusividade entre abas, aviso + botão "Corrigir" na sobreposição, botão do novo modo, frase de leitura no rodapé |
| `src/components/ContactFiltersPanel.tsx` | ajuste do texto de ajuda do campo "Missões específicas" explicando o novo modo |
| `src/lib/crm-filters.ts` | apenas ampliar o enum de `*_modo` para aceitar `nenhuma` (validação); a lógica de query não muda |

## Fora deste plano

- Unificação do motor de filtros com a planilha do BI.
- Assimetria interna do filtro de tags (`intersect` vs atribuição).
- Modo de combinação no lado Esconder (hoje sempre "qualquer uma").

## Como testar depois

1. Tag "Grupo Terceirizadas" + Missões específicas → marcar as 3 plenárias → modo "Nenhuma destas" → deve retornar ~203 contatos.
2. Marcar uma missão em Mostrar e tentar marcá-la em Esconder → ela sai automaticamente do primeiro lado.
3. Abrir uma visão salva com sobreposição → aviso vermelho e botão "Corrigir" no menu.
