## Diagnóstico

Conferi o banco agora:

- Tabela de decisões da triagem: **0 registros** (nenhum, em nenhum segmento).
- No segmento "Smed": 3 contatos foram arquivados hoje às 19:53–19:57 (é por isso que "na lista" caiu de 757 para 754).

Ou seja: o arquivar está funcionando, mas nenhuma decisão foi gravada — daí "0 triado(s)". As permissões e a tabela estão corretas (RLS ativa, 5 políticas, função `private.is_member` existe), então a causa mais provável é a aba do preview ainda rodando o pacote antigo (foram exatamente esses os erros de "server function ID" que você recebeu antes). Primeiro passo do plano é confirmar isso com um teste real de gravação antes de mexer em qualquer regra.

## Significado dos números (proposta)

Hoje "triado" mistura conceitos. Proposta de vocabulário explícito, sem jargão:

| Termo na tela | O que conta |
|---|---|
| **Faltam triar** | contatos ativos do segmento que ainda não receberam verde nem vermelho |
| **Mantidos** | cliques no verde |
| **Arquivados** | cliques no vermelho |
| **Pulados** | pulos ainda pendentes (voltam ao fim da fila; não contam como triado) |

O cabeçalho passa a mostrar, em vez de "0 triado(s) · 754 na lista":

```text
Faltam 751 · 2 mantidos · 1 arquivado · 3 pulados
```

E a barra de progresso fina abaixo (mantidos+arquivados sobre o total original) dá a sensação de avanço. "Faltam" sempre diminui a cada verde/vermelho, nunca no pular.

## O que muda

1. **Contagens reais no servidor** (`getSegmentTriageMeta`): devolver `total` (ativos no segmento), `mantidos`, `arquivados` e `pulados` desse usuário — hoje só devolve um `reviewed` agregado.
2. **Cabeçalho da triagem** (`triagem.$segmentId.tsx`): novo texto acima + barra de progresso, somando decisões salvas com as da sessão atual.
3. **Legenda de ajuda**: um toque no cabeçalho abre um texto curto explicando verde = manter na base, vermelho = arquivar (sai da base ativa), pular = decido depois.
4. **Tela de fila concluída**: passa a mostrar o resumo (X mantidos, Y arquivados) em vez de "triou N contatos".
5. **Verificação da gravação**: teste ponta a ponta na tela real (um verde e um vermelho) confirmando que a decisão fica salva e que o contador sobe; se aparecer erro de permissão, corrijo a política na mesma leva.

## Desarquivar: o que acontece hoje

- **Segmento dinâmico**: o contato volta a entrar no segmento assim que deixa de estar arquivado (o filtro exclui arquivados).
- **Segmento estático**: o ID continua na lista do segmento, então também volta.

Em ambos os casos, porém, **ele não reaparece no swipe**, porque a decisão anterior continua gravada e a fila esconde quem já foi decidido. Correção proposta: ao desarquivar um contato, apagar as decisões de triagem dele (em todos os segmentos), para que volte naturalmente à fila. Complemento: botão "Recomeçar triagem deste segmento" no cabeçalho, que limpa suas decisões daquele segmento.

## Detalhes técnicos

- `src/lib/segment-triage.functions.ts`: `getSegmentTriageMeta` agrega decisões por tipo (`manter`/`arquivar`/`pular`); nova função `resetSegmentTriage(segmentId)` que apaga as decisões do usuário.
- `src/lib/contact-archive.server.ts` (usado por Gestão da Base e missões): ao desarquivar, remover linhas de `segment_triage_decisions` daquele contato. Nenhuma alteração no arquivamento em si.
- `src/hooks/use-triage-queue.ts`: expor `keptCount`/`archivedCount` da sessão em vez de um `reviewed` único.
- Sem migração de banco necessária; nada de exclusão de contatos.
