## Objetivo

Criar uma tela mobile de **Triagem por Swipe** disponível automaticamente em todo segmento (novo ou já existente), mais dois gatilhos no card de cada segmento: **Abrir Swipe** e **Compartilhar tarefa de triagem**.

Nada de novo no backend de negócio: reaproveitamos o que já existe — arquivar (`archiveContact`, que também desarquiva), observações (`logTerritoryAction` / timeline `listContactLogsUnified`) e a ficha completa (`/contatos/$id`).

---

## 1. Estrutura de componentes

**Tela de Segmentos (`/segmentos`)** — só ganha ações no card existente:
- `SegmentCardActions` — botões "Abrir Swipe" (vai para `/segmentos/$id/swipe`) e ícone "Compartilhar".
- `ShareTriageDialog` — cria/lista o link da tarefa, copia e oferece envio por WhatsApp.

**Tela de swipe (`/_authenticated/segmentos/$id/swipe`)**, mobile-first:
```text
SwipeTriagePage            fila, undo, atalhos de teclado no desktop
├─ TriageProgressBar       "12 de 240 revisados" + nome do segmento
├─ SwipeDeck               card atual + próximo (pré-render atrás)
│  └─ ContactSwipeCard     nome, profissão, local de trabalho,
│                          chips de tags, selo Alicerce,
│                          bloco "Observação atual" (obrigatório ler),
│                          gatilho "Nova observação"
├─ SwipeActionCluster      4 botões redondos (amarelo topo / vermelho,
│                          roxo, verde na linha do polegar)
├─ AddNoteSheet            bottom sheet (vaul, já instalado) → salva log
├─ ContactFullSheet        ficha completa em tela cheia + "Fechar"
└─ UndoSnackbar            "Desfazer" com contagem regressiva
```

A ficha completa é aberta **sem sair da tela de swipe** (sheet full-screen reaproveitando o formulário da ficha), então o card atual permanece intacto ao fechar.

---

## 2. Estado da fila, segmentos dinâmicos, pular e desfazer

**Fonte da fila:** nova server fn `listSegmentTriageQueue` em `src/lib/segments.functions.ts`:
- segmento **estático** → `member_ids`;
- segmento **dinâmico** → mesma `applyCrmFilters` já usada em `countSegment` (garante que a fila reflete quem entrou depois);
- sempre filtra arquivados e usuários do sistema (`contact-rules.ts`), ordena estável por `created_at,id` e pagina de 40 em 40 com cursor.

**Estado no cliente** (um `useReducer` em `useTriageQueue`):
- `queue` (ids pendentes), `deferred` (pulados), `decided` (Set de ids já tratados nesta sessão), `history` (pilha de ações).
- Ao esvaziar `queue`, busca a próxima página; quando não há mais páginas, reinjeta `deferred` (é aí que o "pular" reaparece) e faz um **refetch** da primeira página para capturar novas entradas do segmento dinâmico, ignorando ids em `decided`.
- Ações: direita = só remove da fila; esquerda = `archiveContact({archived:true})` otimista; baixo = move para o fim de `deferred`; amarelo = abre a ficha.

**Desfazer:** cada ação empilha `{ contactId, tipo, posiçãoAnterior }`. O botão desfaz a última: recoloca o card na frente, tira de `decided` e, se era arquivar, chama `archiveContact({archived:false})`. O snackbar fica ~8s; a pilha guarda as últimas 20 (dá para desfazer em sequência).

---

## 3. Link de compartilhamento seguro

Uma migration cria `segment_triage_shares` (`id`, `segment_id`, `token` único, `created_by`, `label`, `is_active`, `expires_at`, `use_count`), com GRANTs e RLS: leitura/escrita só para staff autenticado (nada exposto a `anon`).

- Rota `/triagem/$token` (pública apenas para *resolver*): se não houver sessão, redireciona para `/auth?next=/triagem/<token>`; com sessão válida, resolve o token via server fn autenticada e redireciona para a tela de swipe do segmento.
- O token identifica a **tarefa**, nunca autoriza dados: os contatos continuam vindo pelo cliente autenticado, sob RLS do usuário que entrou. Quem não tem permissão de ver contatos vê um aviso claro em vez de dados.
- Revogar link = `is_active = false` no diálogo de compartilhamento.

---

## 4. Fluidez do gesto sem conflito com a rolagem

- O card usa **Pointer Events** (`setPointerCapture`) com `touch-action: none` só no card; a página de swipe não rola (`h-[100dvh]`, cluster fixo, conteúdo longo rola dentro do bloco de observação, que trava a propagação do gesto).
- Detecção de eixo: nos primeiros ~10px decide horizontal vs. vertical e ignora o outro eixo, evitando arrasto ambíguo.
- Animação por `transform`/`opacity` com `requestAnimationFrame` (sem nova dependência), limiar de ~30% da largura ou velocidade > 0.5px/ms; abaixo disso o card volta com mola curta.
- Feedback ao vivo: rótulo colorido (Arquivar / Manter / Pular) surge conforme a direção; leve `navigator.vibrate(10)` ao confirmar, quando suportado.
- Acessibilidade: os botões fazem exatamente o mesmo que o gesto e têm `aria-label`; o gesto é um extra, nunca o único caminho.

---

## Detalhes técnicos

- Novos arquivos: `src/routes/_authenticated/segmentos.$id.swipe.tsx`, `src/routes/triagem.$token.tsx`, `src/components/swipe/*`, `src/hooks/use-triage-queue.ts`, `src/hooks/use-swipe-gesture.ts`.
- Alterações: `src/routes/_authenticated/segmentos.tsx` (dois gatilhos por card), `src/lib/segments.functions.ts` (`listSegmentTriageQueue`, `createSegmentTriageShare`, `listSegmentTriageShares`, `resolveSegmentTriageShare`).
- Migration nova apenas para `segment_triage_shares` — nenhuma alteração destrutiva, nenhum dado existente tocado.
- Todas as chamadas usam `useServerFn` + React Query, com invalidação de `["segments"]` e do cache da fila.
- Fecho com `tsgo` (typecheck) e um teste manual no viewport mobile.
