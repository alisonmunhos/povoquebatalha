# Unificar o destino das observações do swipe

## Diagnóstico (verificado no banco)

A observação "Teste plenária" do contato **Guilherme Holanda Cavalcante Figueiredo** existe apenas no histórico de território (registro de 08/08 13:41), e o campo **Observações** da ficha dele está **vazio**.

Motivo: a tela de triagem (swipe) grava por um caminho diferente do da Agitação.

- Swipe → grava só o histórico (não toca no campo Observações da ficha).
- Agitação → grava o histórico **e** acrescenta no campo Observações da ficha (com data/hora).
- Ficha → escreve direto no campo Observações.

Resultado: observações feitas no swipe não aparecem na ficha nem na busca geral da Gestão da Base.

## O que vai ser feito

1. Fazer o swipe usar o mesmo caminho da Agitação: ao salvar uma observação, além do histórico, acrescentar no campo **Observações** da ficha, somando ao que já existia, com prefixo de data/hora (`[08/08 13:41] Teste plenária`). Nunca sobrescrever.
2. O mesmo passa a valer para observações registradas na tela de Território (mesma função de log), mantendo comportamento idêntico em todos os pontos.
3. Correção retroativa das observações de hoje (08/08) feitas pelo swipe/território que ficaram fora do campo Observações — incluindo o Guilherme.
4. Teste de verificação: abrir a ficha do Guilherme e confirmar "Teste plenária" no campo Observações, e buscar por "Teste plenária" na Gestão da Base.

## Detalhes técnicos

- `src/lib/territory-logs.functions.ts` → em `logTerritoryAction`, quando `action === "observacao"` e houver `note`, chamar `appendContactObservacao` de `src/lib/contact-observacoes.server.ts` via import dinâmico dentro do handler (mesmo padrão de `src/lib/agitacao.functions.ts`).
- Best-effort: falha ao acrescentar na ficha não deve derrubar o registro do log.
- Backfill retroativo por SQL, só de hoje, usando o mesmo formato de prefixo e sem duplicar linhas já presentes.
- Nenhuma mudança de schema; nada é apagado.
