## Etapa 1 — Parar o sangramento

Três correções pontuais, sem migration, sem redesenho de tela e sem mudança no modelo de dados. Cada uma fecha um caminho por onde o sistema hoje faz algo diferente do que promete na interface.

---

### Correção 1 — O envio passa a respeitar arquivado e "não enviar"

**Hoje:** o motor de envio (`src/lib/wa-send.server.ts`) bloqueia opt-out, falta de consentimento, status de WhatsApp inválido e ausência de telefone — mas **não** checa `arquivado_at` nem `lifecycle_status = 'nao_enviar'`. Confirmado na base: 3 contatos arquivados receberiam campanha hoje.

**O que muda:**
- Acrescentar as duas checagens no mesmo bloco de validações comuns, devolvendo motivos legíveis ("arquivado" e "marcado como não enviar"), no mesmo formato dos motivos já existentes.
- Garantir que os campos necessários venham nas consultas que alimentam o envio (campanhas e envio direto), para que a checagem não seja silenciosamente ignorada por campo ausente.
- A prévia de audiência de campanha passa a aplicar os mesmos dois bloqueios, para prévia e disparo darem o mesmo número.

**Efeito visível:** o número da prévia passa a bater com o que é realmente enviado, e contatos arquivados/bloqueados deixam de receber mensagem.

---

### Correção 2 — O formulário público deixa de reativar quem pediu descadastro

**Hoje:** o fluxo de recadastro em `src/routes/api/public/forms/$slug.ts` grava `opt_out_at: null` ao concluir, ou seja, um preenchimento anula um pedido de descadastro anterior. Também não trata o caso de quem está arquivado.

**O que muda:**
- Deixar de limpar `opt_out_at` automaticamente. O descadastro só é revertido por consentimento explícito na própria submissão (quando o formulário tiver o campo de consentimento marcado) — caso contrário permanece.
- Quando a pessoa está arquivada e se recadastra, registrar o recadastro sem desarquivar por conta própria: o contato fica visível para revisão em vez de voltar sozinho ao fluxo de comunicação.
- Preservar todos os dados enviados (nome, telefone, respostas) em qualquer um dos casos — nada é descartado.

**Efeito visível:** descadastro passa a ser respeitado; nenhum dado deixa de ser gravado.

---

### Correção 3 — Seleção em massa avisa em vez de truncar em silêncio

**Hoje:** "Selecionar todos do filtro" pede no máximo 5.000 IDs (`selectAllFiltered` em `src/routes/_authenticated/contatos.index.tsx`), e as funções de lote aceitam no máximo 5.000. Se o filtro tiver mais que isso, a seleção é cortada sem aviso e a ação em massa afeta menos contatos do que o usuário acredita.

**O que muda:**
- A função que devolve os IDs passa a informar também o total real do filtro.
- Quando o total for maior que o limite, mostrar um aviso claro: "Seu filtro tem X contatos; foram selecionados os primeiros Y. Refine o filtro para agir sobre todos."
- Nas confirmações de ação em massa, exibir sempre a quantidade exata que será afetada.

**Efeito visível:** nunca mais uma ação em massa afeta menos do que a tela diz.

---

### O que **não** entra nesta etapa

Centralização das 8 regras (C1–C6), correção dos indicadores, busca com acentos, fila de duplicidades e distinção visual entre arquivado e opt-out. São as etapas 2 a 5 do `08-relatorio-final.md`.

### Duas decisões ainda abertas

Elas não bloqueiam a Etapa 1, mas travam a Etapa 3 (indicadores):
1. Arquivado entra no "Total da base"? (recomendação: não)
2. Usuário do sistema conta como apoiador? (recomendação: não)

---

### Detalhes técnicos

- `src/lib/wa-send.server.ts`: novas checagens no bloco `if (!input.skipValidations)`, com `baseSkip`; ampliar o tipo do contato de entrada com `arquivado_at` e `lifecycle_status`.
- `src/lib/campaigns.functions.ts`: aplicar os mesmos filtros em `buildAudienceIds` e na contagem da prévia; incluir os campos no `select` dos destinatários.
- `src/routes/api/public/forms/$slug.ts`: remover `opt_out_at: null` incondicional (linha ~488) e condicionar ao consentimento explícito; tratar `arquivado_at` sem desarquivar automaticamente.
- `src/lib/crm-bulk.functions.ts`: a função de IDs por filtro passa a retornar `{ ids, total, truncated }` usando `count: "exact"`.
- `src/routes/_authenticated/contatos.index.tsx`: `selectAllFiltered` mostra aviso quando `truncated`; confirmações de ação em massa exibem a contagem.
- Ao final: typecheck do projeto inteiro.
