## O que está errado hoje (confirmado no banco)

1. **"Ignorar por enquanto" nunca funciona.** O banco só aceita os valores `pendente`, `mesclado`, `separados` e `ignorado` para a situação de um par. O código grava `ignorar` — valor que não existe — então a gravação é recusada e nada muda. Conferido: existem 166 pares pendentes, 23 unificados, 57 marcados como pessoas diferentes e **zero** ignorados.
2. **Ignorar seria definitivo.** Mesmo que gravasse, a verificação automática não recria pares já registrados — o par sumiria para sempre, sem data de volta. Não existe hoje um "me lembre depois".
3. **Sem volta atrás.** Marcou "são pessoas diferentes" por engano? Não há como reverter pela tela.
4. **Sem visão do que já foi decidido.** A tela só mostra pendências; não dá para auditar decisões anteriores.

## O que será feito

### 1. Correção imediata
Gravar a situação com o valor correto aceito pelo banco, e mostrar erro na tela quando a gravação falhar (hoje falha em silêncio). Isso já faz o botão funcionar.

### 2. "Ignorar por enquanto" vira adiamento de verdade
- Nova coluna de data de reaparecimento no registro de duplicidades (migration).
- O botão passa a oferecer prazos: **7 dias**, **30 dias** ou **arquivar de vez**.
- Pares adiados somem da fila e voltam sozinhos quando a data chega, sem depender de rodar a verificação.
- Contador no topo: "3 adiados voltam em breve", com atalho para ver a lista.

### 3. Poder desfazer
- Cada decisão (pessoas diferentes / adiado / arquivado) pode ser revertida para pendente.
- Aviso curto após a ação com botão **Desfazer**.

### 4. Fila organizada e navegável
- Abas: **Para revisar** · **Adiados** · **Já decididos**.
- Ordenação por confiança (forte → possível) e filtro por tipo de coincidência (telefone, e-mail, nome).
- Barra de progresso: "X de Y revisados hoje".
- Ações em massa na aba de revisão: unificar automaticamente todos os blocos de confiança **forte** cujo sobrevivente é óbvio (com resumo de quantos serão afetados e confirmação antes).

### 5. Transparência do que aconteceu
- Depois de unificar, mostrar um resumo curto: o que foi transferido (mensagens, tags, histórico, acesso) e qual cadastro foi arquivado.
- Se a unificação falhar, o motivo aparece na própria tela em linguagem simples, sem fechar o bloco.

## Detalhes técnicos

- Migration: `snoozed_until timestamptz` em `contact_duplicates` + índice parcial para a fila; nenhum dado apagado.
- `listDuplicateGroups`: passa a filtrar `status='pendente' AND (snoozed_until IS NULL OR snoozed_until <= now())`, com variantes para as abas de adiados e decididos.
- `resolveDuplicateGroup`: aceita `separados | arquivar | adiar(dias) | reabrir`, sempre gravando valores válidos pelo CHECK, e retorna a contagem de linhas afetadas para o frontend detectar no-op por permissão.
- Permissão: alterar duplicidades exige papel de administrador (RLS). A tela passa a esconder/desabilitar as ações para quem não é admin, em vez de deixar o clique falhar sem aviso.
- Frontend concentrado em `src/routes/_authenticated/duplicidades.tsx` + `src/lib/duplicates.functions.ts`; `MergeContactsModal` só ganha o resumo pós-unificação.
