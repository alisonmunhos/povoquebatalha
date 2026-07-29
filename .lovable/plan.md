## Objetivo

Executar de uma vez as Etapas 2, 3 e 4 do relatório final: cada regra de negócio passa a existir em **um único lugar**, os indicadores passam a bater entre si, e as telas param de oferecer opções que não significam nada.

Decisões já tomadas por você e que valem para tudo abaixo:
- **Arquivado não entra no "Total da base".** Vira indicador próprio.
- **Usuário do sistema não conta como apoiador.** Continua na base de contatos, com marcação.

---

## Etapa 2 — Centralizar as regras

Um módulo único de regras (`src/lib/contact-rules.ts`) passa a ser a fonte da verdade. Nada de banco muda; nada de tela é redesenhado.

**C4 — Acesso por lista de IDs**
Toda consulta que recebe uma lista grande de IDs passa a usar a busca em lotes que já existe (`fetchContactsBatched`). Hoje várias consultas mandam a lista inteira de uma vez e podem falhar em silêncio quando a lista é grande.

**C3 — "Tem telefone"**
Uma única regra de precedência: candidato de WhatsApp → número formatado → número bruto. É a regra que o motor de envio já usa corretamente; passa a valer também para exibição em lista, planilha, exportação e contagem.

**C1 — "Contato ativo"**
Um único filtro base, com `crm-filters.ts` como referência. Todas as telas passam a assumir o mesmo padrão (não arquivado), e quem quiser incluir arquivados precisa pedir explicitamente.

**C2 — "Apto a receber"**
Uma única função, extraída do motor de envio, usada pela prévia de campanha, pelo painel de relacionamento, pelo lote de envio e pelas automações. Inclui os bloqueios já corrigidos na Etapa 1 (arquivado, "não enviar", opt-out, consentimento, telefone).

**C6 — Contagem de público**
Painel, prévia e envio passam a chamar a mesma contagem (`buildAudienceIds`). Deixa de existir número de prévia diferente do número enviado.

**C5 — Busca textual**
A busca por nome passa a usar a coluna já existente e já normalizada (`nome_normalizado`, sem acento e em minúsculas), com o termo digitado normalizado do mesmo jeito. Buscar "jose" passa a encontrar "José". Os demais campos (cidade, e-mail, telefone) continuam como estão.

---

## Etapa 3 — Corrigir os indicadores

- **"Sem resposta"** passa a contar pessoas que não responderam, e não "aptos menos mensagens recebidas" (hoje mistura duas dimensões e mostra um número menor do que o real).
- **Todo cartão declara seu escopo.** Cada indicador do painel passa a excluir arquivados por padrão, com "Arquivados" como cartão separado.
- **Apoiadores** passa a excluir usuários do sistema; a base de contatos continua contando todo mundo.
- **Prévia de campanha = envio.** Mesma função, mesmo número, e a prévia passa a discriminar quantos foram descartados e por qual motivo.

---

## Etapa 4 — Limpar significado

- **Filtros vazios:** as opções de filtro que nunca retornam nada (por exemplo, os status de WhatsApp que não existem na base e os estados de ciclo de vida nunca gravados) passam a aparecer com contagem, e as de contagem zero ficam desabilitadas com explicação, em vez de sumirem sem aviso.
- **Arquivado ≠ opt-out:** passam a ser dois selos visuais distintos na lista e na ficha, com texto claro ("Fora da base" x "Pediu para não receber").
- **Fila de duplicidades:** os 166 pares pendentes ganham contador visível e acesso direto a partir da Gestão da Base.

---

## Detalhes técnicos

Arquivos principais:
- **Novo:** `src/lib/contact-rules.ts` — `isActiveContact`, `bestPhone`, `canReceiveMessage`, `normalizeSearchTerm`.
- `src/lib/crm-filters.ts` — busca por `nome_normalizado`; filtro base único.
- `src/lib/wa-send.server.ts`, `src/lib/campaign-batch.server.ts`, `src/lib/automations.server.ts` — passam a importar `canReceiveMessage`.
- `src/lib/campaigns.functions.ts` — prévia, criação e preparo compartilhando `buildAudienceIds` + `canReceiveMessage`, com motivos de descarte.
- `src/lib/crm-bulk.functions.ts`, `src/lib/contacts-sheet.functions.ts`, `src/lib/map.functions.ts`, `src/lib/agitation-missions.functions.ts`, `src/lib/segments.functions.ts` — consumo do módulo central e uso de `fetchContactsBatched`.
- `src/lib/dashboard.functions.ts`, `src/lib/relacionamento.functions.ts` — indicadores recalculados.
- `src/routes/_authenticated/contatos.index.tsx`, `src/components/ContactFiltersPanel.tsx`, `src/components/contacts-sheet/*` — selos, contagens nos filtros, atalho de duplicidades.

Sem migration. Sem alteração de modelo de dados. Typecheck do projeto inteiro ao final.

## Riscos e cuidados

- É uma refatoração transversal: o comportamento visível deve mudar **apenas** onde o relatório apontou erro. Vou manter os nomes e a aparência das telas.
- Números do painel vão mudar (ficam corretos). Vou listar no final o antes/depois de cada indicador afetado para você conferir.
- Nenhum dado é apagado ou reescrito no banco.
