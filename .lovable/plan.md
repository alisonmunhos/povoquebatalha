## Diagnóstico dos dois bugs críticos (confirmado no código)

### Bug 1 — busca + tag = zero

Causa confirmada em `src/lib/crm-filters.ts`, função `resolveContactIdsForTagFilter`:

```
.from("contact_tags").select("contact_id").in("tag_id", tagIds)
```

Essa consulta **não tem paginação e não define range**, então o PostgREST devolve no máximo **1.000 linhas**. A tag "SMS" tem muito mais de 1.000 vínculos. O resultado é uma lista truncada de ~1.000 contatos, que depois é aplicada como `q.in("id", ids)` junto com a busca de texto. A busca "pmpa" quase nunca cai dentro daqueles 1.000 primeiros vínculos (ordem arbitrária do banco) → resultado zero, mesmo com 953 correspondências reais.

Consequências adicionais do mesmo trecho:
- Os fallbacks de "sem tag" (`.limit(50000)` em `contact_tags` e `.limit(20000)` em `contacts`) sofrem do mesmo teto de 1.000: o `limit` pedido não vence o teto do servidor. Hoje o filtro "sem tag" também está silenciosamente errado.
- Mesmo paginando, passar dezenas de milhares de IDs em `.in("id", ...)` gera URL gigante e quebra o request (já tivemos esse erro em `crm-filter-options`).

Correção proposta (duas camadas):
1. Paginar `contact_tags` de verdade com `.range()` em laço até esgotar.
2. Trocar a estratégia de "lista de IDs" por **filtro no banco** quando o conjunto for grande: usar uma função SQL `contact_ids_with_tags(tag_ids uuid[])` ou aplicar o recorte por `id IN (subselect)` via RPC, evitando trafegar IDs. Alternativa mais barata: manter IDs, mas **intersectar do lado certo** — aplicar primeiro os demais filtros (busca) com `select("id")` paginado e cruzar em memória. Ver pergunta 1.

Arquivos afetados pelo mesmo bug (todos consomem o resolver): `src/lib/crm-filters.ts`, `src/lib/contacts.functions.ts`, `src/lib/contacts-sheet.functions.ts`, `src/lib/crm-bulk.functions.ts`.

### Bug 2 — "selecionar todos os filtrados" trava em 1.000

Causa confirmada em `src/lib/crm-bulk.functions.ts`, `idsByFilter`: uma única chamada com `.limit(data.max)`. O teto de 1.000 do PostgREST vence. Correção: laço com `.range(offset, offset + 999)` acumulando até `data.max` ou fim, e `truncated` calculado contra o `count` exato.

---

## Fase 1 — Correção dos dois bugs críticos (sem migration, salvo opção RPC)

Arquivos:
- `src/lib/crm-filters.ts` — paginar `resolveContactIdsForTagFilter` (tags, todos-taggeados e contatos ativos), extrair helper `fetchAllPaged()` reutilizável.
- `src/lib/crm-bulk.functions.ts` — `idsByFilter` paginado em blocos de 1.000; mesma revisão para `idsForCampaign` e `idsForTemplate` (também estão com `.limit(20000)` ilusório).
- `src/lib/contacts.functions.ts` e `src/lib/contacts-sheet.functions.ts` — garantir que o recorte por IDs seja aplicado em blocos quando a lista for grande (ou via RPC, conforme pergunta 1).

Validação: reproduzir "pmpa" + tag "SMS" e conferir 953; filtro de 1.076 selecionando 1.076.

---

## Fase 2 — Imagem em mensagem de missão

Migration (separada): `agitation_missions.media_path`, `media_mime`, `media_filename`.

Storage: **reaproveitar o bucket `campaign-media`** já existente (privado, com fluxo de signed upload URL + signed URL de leitura já implementado em `campaigns.functions.ts` e `wa-send.server.ts`). Não criar bucket novo — o padrão de upload, leitura e envio já está pronto e testado.

Arquivos:
- `src/lib/agitation-missions.functions.ts` — campos no schema de criação/edição + server fn de signed upload URL (espelhando `campaigns.functions.ts`).
- `src/components/CreateMissionModal.tsx`, `src/components/EditMissionModal.tsx` — input de arquivo, preview, remover.
- `src/routes/_authenticated/missoes-agitacao.$missionId.tsx` e `src/routes/_authenticated/minhas-missoes.tsx` — exibir a imagem pro agitador.
- `src/lib/wa-send.server.ts` — reaproveitar `sendImage` (já existe, sem alteração estrutural).

⚠️ Ponto de arquitetura: hoje a mensagem da missão **não passa pela Z-API** — o agitador abre o `wa.me` no celular e envia manualmente. Não é possível anexar imagem a um link `wa.me`. Ver pergunta 2.

---

## Fase 3 — Eventos: capa, consentimentos, tela pós-confirmação, rastreio

Migration (separada), tabela `events`:
- `cover_path`, `cover_mime` (imagem de capa, bucket `campaign-media`)
- `post_rsvp_title`, `post_rsvp_button_text`, `post_rsvp_button_url` (todos opcionais — padrão de `link_text`/`link_url` das perguntas de formulário)

Arquivos:
- `src/lib/events.functions.ts` — schema estendido, upload assinado da capa, notificação ao criar/publicar.
- `src/routes/_authenticated/eventos.tsx` — formulário com upload de capa + campos da tela pós-confirmação + **lista de confirmados/recusados** (nome, telefone, data), com busca e exportação simples.
- `src/lib/events-public.server.ts` — devolver capa (signed URL), bloco pós-RSVP, exigir consentimentos, gravar rastro de origem.
- `src/routes/evento.$slug.tsx` — capa no topo, três checkboxes de consentimento obrigatórios, tela pós-confirmação.
- `src/lib/legal-consent-fields.ts` — reaproveitar textos/links dos três consentimentos já usados nos formulários públicos (sem recriar conteúdo).
- `src/lib/system-notifications.server.ts` — nova `notifyEventCreated`, mesmo padrão de `notifyEventRsvpConfirmed` (`kind='event'`, `system_notification_settings`).

Consentimentos: WhatsApp, LGPD e dados sensíveis, obrigatórios; gravados em `contacts` (colunas e timestamps já existem, trigger `contacts_consent_timestamp` já cuida das datas).

Rastreio de origem por evento (corrige os dois pontos):
- Gravar também em contato **já existente**, não só em novo.
- Rastro específico: `origem_detalhe = "evento:<slug>"` **e** registro em `contact_source_events` via `apply_contact_source` (já existe e é a fonte estruturada correta), com `metadata` contendo `event_id`/`event_slug`.
- Ver pergunta 3 sobre como esse rastro aparece no filtro da Gestão da Base.

Migration adicional possível: nova chave `event_created` em `system_notification_settings` (seed de título/corpo).

---

## Fase 4 — Verificação

- Typecheck completo.
- Roteiro manual: busca+tag, seleção em massa >1.000, criar missão com imagem, criar evento com capa e tela pós-RSVP, confirmar presença como contato novo e como contato existente, conferir rastro e notificação.

---

## Migrations (resumo, aplicadas separadamente e nesta ordem)

1. `agitation_missions`: `media_path`, `media_mime`, `media_filename`.
2. `events`: `cover_path`, `cover_mime`, `post_rsvp_title`, `post_rsvp_button_text`, `post_rsvp_button_url`.
3. `system_notification_settings`: seed `event_created` (se aprovado).
4. (Condicional à pergunta 1) função SQL `contact_ids_with_tags`.

Nenhuma migration apaga ou altera dados existentes.

---

## Perguntas objetivas

**1. Filtro de tag em bases grandes** — prefere (a) paginação em memória, mudança mínima, sem migration, porém pesada quando a tag tem dezenas de milhares de vínculos; ou (b) função SQL dedicada que faz o cruzamento no banco (mais rápido e definitivo, exige uma migration)?

**2. Imagem na mensagem de missão** — hoje o agitador envia pelo `wa.me` do próprio celular, onde imagem não pode ser anexada. Escolha: (a) a imagem fica visível na tela da missão para o agitador baixar e anexar manualmente; (b) a mensagem passa a ser disparada pela Z-API do sistema (texto+imagem automático, muda o modelo de contato "pessoa a pessoa"); (c) as duas, com o admin escolhendo por missão?

**3. Filtrar "quem confirmou presença no Evento X"** — quer (a) um filtro novo dedicado na Gestão da Base ("Confirmou presença no evento" com lista de eventos), ou (b) basta o rastro em `origem_detalhe` aparecer no filtro de origem que já existe?

**4. Consentimentos no evento** — os três obrigatórios bloqueiam a opção "Não poderei ir" também, ou só "Confirmar presença"?

**5. Bucket** — confirma reaproveitar `campaign-media` (recomendado, tudo já pronto) em vez de criar `mission-media`?
