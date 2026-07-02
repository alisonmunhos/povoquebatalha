# Plano — Endereço, Geolocalização e ajustes no Inbox

Apenas planejamento. Nenhum arquivo será alterado até você aprovar.

---

## A. Diagnóstico do estado atual

### 1. Formulário `/atualizacao` (arquivo `src/routes/recadastro.tsx`)
- Ao digitar 8 dígitos no CEP, `onCepChange` chama `useCepLookup` → `/api/public/cep/:cep` → ViaCEP com fallback BrasilAPI. Não há autocomplete de sugestões: o preenchimento é automático, sem clique.
- Rua, bairro, cidade, UF são preenchidos em estado React e o foco vai para "Número".
- Problemas reais:
  - Nenhum bloco "Endereço encontrado — confirmar/editar". Se a pessoa altera cidade/bairro manualmente, o valor manual é salvo sem qualquer marcação.
  - Se o CEP falha, exibe aviso mas não marca o registro como "precisa revisão".
  - Não há prévia final "Rua X, nº Y — Bairro, Cidade/UF" antes do envio.
  - Não destaca que o número é essencial para precisão.

### 2. Ficha do contato (`src/routes/_authenticated/contatos.$id.tsx`)
- Campos existentes em `contacts`: `cep, endereco, numero, complemento, referencia, bairro, cidade, uf, endereco_completo` (gerado por trigger `contacts_address_fill`), `latitude, longitude, geocoding_status, geocoding_provider, geocoded_at`.
- Trigger `contacts_address_fill` já detecta mudança de endereço e reseta `geocoding_status='pendente'` + limpa lat/long. Bom.
- Não há botão "Recalcular localização" na ficha, nem indicador visual de precisão, nem pin manual.
- Auditoria: existe `contact_audit_log`, mas edições de endereço na ficha não gravam entrada dedicada de "endereço alterado".

### 3. Geolocalização (`src/lib/geocoding.functions.ts` + `src/lib/cep.server.ts`)
- Geocoder: Nominatim (OSM), 1 req/s, com cache em `geocode_cache` por `endereco_completo`.
- Roda em: submissão do `/atualizacao` (best-effort inline) e em lote via `runGeocodingBatch` (limit 20).
- Status atuais gravados em `contacts.geocoding_status`: `pendente`, `localizado`, `aproximado`, `erro`. Não distingue "por bairro" vs "por cidade" vs "manual".
- Geocoda mesmo sem número. Não há política que segure geocoding até ter dados mínimos.
- Mapa (`/mapa`) mostra pins mas sem legenda/filtro de precisão nem aviso de aproximação.

### 4. Inbox — problemas relatados
- Após enviar, mensagem aparece no WhatsApp do contato mas **não some do input e não sobe pra thread** → provavelmente falha em invalidar `getConversation` / limpar `reply` no `onSuccess` do `sendMutation`, ou o retorno da server function não dispara o refetch. Reenvios múltiplos indicam ausência de reset do estado local.
- **Prévia de link (OG preview)** não é gerada. Hoje o texto é enviado cru; nem no envio, nem na renderização da thread há extração de metadados OpenGraph.

### 5. Contato "Ezequiel" some da aba Contatos + WhatsApp "desconhecido" no Inbox
- Lista `/contatos` usa filtro padrão `{ archived: "nao" }`. Se o Ezequiel foi marcado `arquivado_at` (ex.: como duplicado mesclado pelo `merge_contacts`, que define `arquivado_at` + `lifecycle_status='duplicado_mesclado'`), ele desaparece da lista mesmo tendo conversa ativa.
- Painel do Inbox mostrando "WhatsApp: desconhecido" indica que `contact.phone_e164` está `null` na ficha vinculada — possível dessincronia entre `conversations.contact_id` e a `contacts` real, ou o contato foi criado via `createQuickContactFromConversation` sem gravar `phone_raw`/`phone_e164`.
- Duplicidades: o endpoint `/api/public/forms/recadastro` reaproveita registro se `recad_token` OU `phone_e164` OU `email` batem. Se você reenviou com o mesmo telefone, ele **atualiza o mesmo registro** — comportamento correto, mas você percebeu que "as informações não mudaram". Suspeito de dois casos possíveis:
  1. Segundo envio bateu em outro registro (telefone digitado diferente) e não gerou `contact_duplicates`.
  2. Atualização ocorreu, mas a UI da ficha estava com cache antigo do React Query.

---

## B. Proposta de solução

### B.1. Formulário público `/atualizacao`
Fluxo alvo:
```text
[CEP 8 dígitos] → lookup automático
   ├── OK  → preenche rua/bairro/cidade/UF
   │        ↓ Card "Endereço encontrado" [Confirmar] [Editar]
   │        ↓ campo Número em destaque com aviso
   │           "O número é essencial para localizar sua casa no mapa"
   │        ↓ Preview: "Rua X, 123 — Bairro, Cidade/UF"
   └── FALHA → banner amarelo "CEP não encontrado — preencha manualmente"
              marca `address_source='manual'` + `address_needs_review=true`
```
- Estado novo no cliente: `cepStatus: 'idle' | 'loading' | 'ok' | 'not_found' | 'edited'`. Se usuário editar rua/bairro/cidade após lookup OK → `cepStatus='edited'` e o registro salva `address_source='cep_edited'`.
- Não bloqueia envio se CEP faltar/falhar.

### B.2. Ficha do contato
- Seção "Endereço" com:
  - Badge de precisão (verde/âmbar/vermelho conforme `geocoding_precision`).
  - Botão "Recalcular localização" → chama `runGeocodingBatch({ ids: [id], limit: 1 })`.
  - Registro em `contact_audit_log` (`action='endereco_alterado'`) sempre que endereço mudar.
- Pin manual (Etapa 4): campos `manual_latitude/longitude/updated_by/at` + toggle "Usar coordenada manual". Componente de mapa com marcador arrastável (Leaflet, já presente). Coordenada manual tem prioridade sobre geocoder; RLS restringe a admin/vrm.

### B.3. Mapa
- Legenda com cores por `geocoding_precision`.
- Filtro multi-select: exata, número, rua, bairro, cidade, manual, pendente, erro.
- Popup do pin: endereço usado, precisão, provedor, badge "Aproximado — número ausente" quando aplicável.

### B.4. Regras de geocoding
Prioridade de cálculo:
```text
manual_lat/lng             → precision='manual'
rua + número + bairro/CEP  → geocoder → 'exata' (se hit exato) ou 'numero'
rua + bairro (sem número)  → 'rua'
bairro + cidade            → 'bairro'
cidade + UF                → 'cidade'
só CEP                     → 'cep'
nada útil                  → 'pendente'
geocoder retornou erro     → 'erro'
```
- Não gastar chamada Nominatim quando só há cidade/UF ou só CEP → resolver por heurística (bounding box do CEP via ViaCEP já retorna cidade; usar centroide da cidade via BrasilAPI IBGE ou tabela local).
- Manter cache `geocode_cache` e rate-limit 1 req/s.
- Recalcular quando trigger detectar mudança (já existe) e quando endereço tiver melhor completude que a última tentativa.

### B.5. Correções paralelas
- **Inbox — send flow**: no `onSuccess` do `sendMutation`, resetar `reply=""`, limpar `attachment`, e invalidar `["conversation", contactId]` + `["conversations"]`. Verificar que o retorno da server function inclui a mensagem inserida (ou adicionar refetch otimista).
- **Inbox — OG preview**: nova server function `fetchLinkPreview(url)` → busca `<title>`, `og:image`, `og:description` server-side, cache em nova tabela `link_previews (url pk, title, description, image_url, fetched_at)`. Detectar URL no `reply`; ao enviar, gravar `direct_messages.link_preview_url`; ao renderizar bubble, mostrar card. (No WhatsApp em si o preview depende do provider — Z-API renderiza automaticamente quando o link é a única/primeira parte da mensagem; documentar isso.)
- **Contatos — listar tudo**: mudar filtro padrão de `/contatos` para `archived: "todos"` OU adicionar tab "Arquivados" visível. Garantir que a busca por nome ignore `arquivado_at`.
- **Inbox — "WhatsApp: desconhecido"**: no painel lateral, se `contact.phone_e164` estiver vazio, cair para `conversation.from_phone`. Ao vincular/criar contato via `createQuickContactFromConversation`, obrigatoriamente gravar `phone_raw` a partir de `from_phone` para o trigger normalizar.
- **Duplicidades**: no `/api/public/forms/recadastro`, quando encontrar registro existente pelo telefone, registrar em `contact_audit_log` a diff antes/depois; se dados divergem substancialmente do que já existe (nome muito diferente), criar linha em `contact_duplicates` mesmo assim para revisão manual.

### B.6. Campos de banco propostos
Adicionar em `contacts` (nenhum campo atual apagado):
- `address_source text` — `viacep | brasilapi | manual | import | cep_edited`
- `address_confirmed bool default false`, `address_confirmed_at timestamptz`
- `address_needs_review bool default false`
- `geocoding_precision text` — `exata | numero | rua | bairro | cidade | cep | manual | pendente | erro`
- `geocoding_error text`
- `manual_latitude double precision`, `manual_longitude double precision`
- `manual_location_updated_by uuid`, `manual_location_updated_at timestamptz`

Não precisamos duplicar `geocoding_status` — vira coluna gerada ou fica como `pendente/localizado/aproximado/erro` legado; a `precision` é a verdade nova.

### B.7. Normalização
Funções puras server-side em `src/lib/address.server.ts`:
- CEP: `\D → ""`, formatar `00000-000` para display.
- UF: `toUpperCase`, validar contra lista de 27.
- Cidade/bairro/rua: `trim`, colapsar espaços, title-case respeitando preposições (de, da, do, dos, das).
- Aplicar tanto no submit público quanto na edição da ficha (via trigger BEFORE INSERT/UPDATE ou em SQL function chamada pelo `contacts_address_fill`).

### B.8. Contatos importados
- Import atual já grava o que vem. Manter.
- Ao rodar geocoding em lote, calcular `precision` conforme regras acima → contatos com só cidade viram `precision='cidade'` sem gastar Nominatim.
- Quando o mesmo telefone chegar via `/atualizacao`, o merge natural (mesmo `phone_e164`) sobrescreve/completa e o trigger recalcula geocoding.

---

## C. Plano de implementação em etapas

**Etapa 1 — Endereço confiável no `/atualizacao`** (2 telas + backend leve)
1. Migration: novos campos `address_source`, `address_confirmed*`, `address_needs_review` + normalização em `contacts_address_fill`.
2. `src/routes/recadastro.tsx`: bloco "Endereço encontrado" com botões Confirmar/Editar, aviso de número, preview final.
3. `src/routes/api/public/forms/recadastro.ts`: gravar `address_source`, marcar `needs_review` quando CEP falhar.
4. `src/lib/address.server.ts`: normalização compartilhada.

**Etapa 2 — Geocoding com precisão real**
1. Migration: `geocoding_precision`, `geocoding_error`, `manual_lat/lng*`.
2. `src/lib/geocoding.functions.ts`: refatorar `runGeocodingBatch` com regras de precisão e short-circuit para cidade/CEP.
3. Ficha do contato: badge de precisão + botão "Recalcular localização" + auditoria.

**Etapa 3 — Mapa com indicação de precisão**
1. `/mapa`: legenda, filtro por precisão, cores diferentes por marcador, popup enriquecido.

**Etapa 4 — Pin manual (opcional/segura)**
1. Toggle "Definir localização manualmente" na ficha, marcador arrastável, gravação em `manual_lat/lng`, prioridade sobre geocoder, RLS admin/vrm, auditoria.

**Etapa 5 — Correções paralelas** (podem entrar junto com Etapa 1 se preferir)
1. Inbox: reset de estado após envio + invalidate queries.
2. Inbox: fallback `from_phone` no painel lateral; `createQuickContactFromConversation` grava `phone_raw`.
3. Contatos: exibir arquivados por padrão ou tab dedicada + busca ignorar `arquivado_at`.
4. Duplicidades: logar diff no reenvio do formulário e criar `contact_duplicates` quando divergência for grande.
5. Link preview: tabela `link_previews`, server fn `fetchLinkPreview`, card no bubble.

---

## D. Riscos e cuidados
- Não quebrar `/atualizacao`: mudanças de UI só somam campos, backend aceita antigos e novos.
- CEP falhando **nunca** bloqueia submit.
- Nenhuma coluna existente é removida; apenas novas.
- Backfill: script one-shot preenche `geocoding_precision` a partir do `geocoding_status` atual para não deixar registros vazios.
- Nominatim: manter 1 req/s e cache; short-circuit para cidade/CEP reduz chamadas.
- Filtro padrão da lista de contatos vai mudar → sinalizar visualmente que "arquivados" também aparecem, para evitar confusão do admin.
- Pin manual: RLS restrita a admin/vrm; auditoria obrigatória.

---

## E. Perguntas antes do Build
1. **Filtro default de `/contatos`**: prefere mostrar **todos** (ativos + arquivados) por padrão, ou manter "ativos" como default e criar uma aba "Arquivados" ao lado?
2. **Confirmação de endereço**: quer o botão "Confirmar endereço" como etapa obrigatória (bloqueia envio até confirmar) ou apenas visual (envio livre, marca `address_confirmed=false` se não clicar)?
3. **Pin manual (Etapa 4)**: entra agora junto ou fica para uma iteração futura?
4. **Link preview**: quer preview visual **dentro do Inbox do sistema** (nosso card no bubble) e/ou depender do render nativo do WhatsApp no celular do contato? Se só nativo, basta garantir que a URL seja isolada na mensagem — nenhuma tabela nova.
5. **Reenvio do mesmo telefone no `/atualizacao`**: quando os dados divergem muito do cadastro atual (ex.: nome diferente), deve (a) sobrescrever silenciosamente, (b) sobrescrever e criar entrada em `contact_duplicates` para revisão, ou (c) criar um novo contato e sinalizar duplicidade?
