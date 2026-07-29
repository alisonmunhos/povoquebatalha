## O que encontrei no banco (lido, não presumido)

Formulário `3537a1d2-f7a7-41fb-ab48-9b9c5d1cba0c` — "ENTRE PARA NOSA BASE!", slug `seja-um-apoiador-a-da-campanha-do-povo-que-batalha-copia`, `layout_mode: sectioned`, ativo, `source_form_type: cadastro_completo`.

Seções, na ordem:

```text
0  SEU CADASTRO ....................... nome, WhatsApp, consentimento WhatsApp,
   (questions)                          nome social, consentimento LGPD,
                                        consentimento dados sensíveis
   -> segue sempre para a seção 1

1  VAMOS CONTINUAR? ................... pergunta única "COMO VOCÊ QUER PARTICIPAR?"
   (questions)                          opcao-1 -> seção 2 (perfil de apoiador)
                                        opcao-2 -> seção 3 (só atualizações)
                                        opcao-3 -> seção 4 (criar login)

2  SEU PERFIL DE APOIADOR(A) .......... endereço, e-mail, etc. (termina aqui)
3  VOCÊ VAI RECEBER NOSSAS ATUALIZAÇÕES! (termina aqui, botão WhatsApp)
4  E AÍ, COMPA! ....................... account_creation, papel "agitador"
```

Ou seja: a "Seção 1" que você descreve é a de ordem 0 (SEU CADASTRO) e ela **já tem exatamente os 3 consentimentos** — o que confirma que os 3 checkboxes feitos à mão em `evento.$slug.tsx` são duplicação.

Também confirmei que o motor já resolve sozinho quase tudo que você pediu:
- `PublicFormRenderer` aceita `startSectionId` e encadeia seções via `recad_token` (`saveSectionProgress` → `/api/public/forms/$slug/section-progress`).
- Depois de enviar a seção 0, ele **avança sozinho** para a seção 1 e adiante. Então "a tela de sucesso continua a partir da Seção 2" é o comportamento nativo do encadeamento — não precisa de mecanismo novo.
- Já existe `form_sections.linked_event_id` (vínculo seção → evento) usado na tela de sucesso. O que falta é o vínculo inverso: evento → formulário.

## Plano

### 1. Migration — vínculo por referência
`supabase/migrations/<ts>_events_linked_form.sql`:
- `ALTER TABLE public.events ADD COLUMN linked_form_definition_id uuid REFERENCES public.form_definitions(id) ON DELETE SET NULL;`
- `ADD COLUMN linked_form_start_section_id uuid REFERENCES public.form_sections(id) ON DELETE SET NULL;` (qual seção abre na tela do evento; se nulo, a primeira)
- Sem GRANT novo (colunas em tabela existente). Nenhum dado copiado: é referência viva, edição na aba Entrada de Dados reflete na hora.

### 2. Backend público do evento — `src/lib/events-public.server.ts`
- `handlePublicGetEvent` passa a devolver `form: { slug, start_section_id }` resolvido a partir das novas colunas (ou `null` quando o evento não tem formulário vinculado).
- **Remoção da implementação própria:** o bloco de validação dos 3 consentimentos e o ramo "confirmed com nome+phone" saem de `handlePublicEventRsvp`. O handler fica responsável só por **recusa** (`declined`) e por reconfirmação via token.
- Nasce `confirmEventRsvpForContact(eventId, contactId)` — função única que faz upsert do RSVP `confirmed`, carimba os consentimentos, chama `apply_contact_source` e dispara `notifyEventRsvpConfirmed`. Ela é chamada tanto pelo fluxo de seção quanto pelo endpoint de reconfirmação, então nada vira código morto nem duplicado.

### 3. Submissão única (contato + presença)
- `PublicFormRenderer` ganha prop opcional `eventSlug`, repassada no corpo de `section-progress`, `$slug` (final) e `account-section`.
- `src/routes/api/public/forms/$slug/section-progress.ts` e `.../$slug.ts`: aceitam `event_slug` opcional; depois de salvar o contato com sucesso, chamam `confirmEventRsvpForContact`. Uma requisição só, como pedido.
- Idempotente: reenvio da mesma seção não duplica RSVP (upsert por `event_id,contact_id`) e a notificação continua disparando só na primeira confirmação.

### 4. Tela `src/routes/evento.$slug.tsx`
- Mantém cabeçalho do evento (capa, data, local, descrição, .ics).
- Bloco "Sua presença" perde os 3 checkboxes bespoke e o par nome/WhatsApp manual; no lugar entra `<PublicFormRenderer slug={form.slug} startSectionId={form.start_section_id} eventSlug={slug} />`.
- "Não poderei ir" continua botão isolado, sem formulário.
- Quem chega com `?t=<recad_token>` já identificado: o renderer recebe `recadToken` e a seção vem pré-preenchida, com um botão direto "Confirmar presença" que dispensa reeditar os dados.
- Evento sem formulário vinculado: cai no fluxo simples atual (confirmar/recusar com nome e WhatsApp), preservando links já compartilhados.

### 5. Admin `src/routes/_authenticated/eventos.tsx` + `src/lib/events.functions.ts`
- Campo "Formulário de confirmação" (select de formulários ativos `sectioned`) e "Seção inicial", persistidos nas colunas novas.
- Sem formulário selecionado = comportamento antigo.

### 6. Uso autônomo do formulário — não quebra
O formulário continua acessível em `/f/seja-um-apoiador-a-da-campanha-do-povo-que-batalha-copia` sem `event_slug`. Todo o acoplamento de evento é um parâmetro opcional no corpo da requisição; ausente, nenhum RSVP é gravado. Nenhuma coluna de `form_definitions`/`form_sections` é alterada.

## Arquivos tocados
- `supabase/migrations/<ts>_events_linked_form.sql` (novo)
- `src/lib/events-public.server.ts`
- `src/routes/api/public/forms/$slug/section-progress.ts`
- `src/routes/api/public/forms/$slug.ts`
- `src/routes/api/public/forms/$slug/account-section.ts`
- `src/components/PublicFormRenderer.tsx`
- `src/routes/evento.$slug.tsx`
- `src/lib/events.functions.ts`
- `src/routes/_authenticated/eventos.tsx`

## Decisões que precisam da sua resposta

1. **Quando a presença é gravada?** (a) já ao enviar a Seção 0 — a pessoa confirmada mesmo se abandonar as seções seguintes; ou (b) só ao terminar a jornada inteira. Recomendo (a).
2. **"Não poderei ir" de quem chega sem token**: precisa identificar a pessoa (pede nome + WhatsApp num campo mínimo) ou basta registrar a recusa anônima sem gravar nada na base? Recomendo pedir nome + WhatsApp, para a recusa ser rastreável.
3. **Vínculo do formulário**: fixo em código para todos os eventos, ou escolhido por evento na tela de administração (o plano acima assume escolhido por evento, com o formulário "ENTRE PARA NOSA BASE!" como padrão sugerido)?
4. **Quem já confirmou antes** e reabre o link: mostra só o aviso "presença confirmada" ou reabre o formulário a partir da Seção 1 (VAMOS CONTINUAR?) para completar o cadastro?
