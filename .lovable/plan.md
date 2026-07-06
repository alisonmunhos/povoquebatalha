## Diagnóstico

**1. Link some no envio de teste (`mensagens` → "Enviar teste")**

Fluxo atual em `src/lib/messages.functions.ts` (`sendTestTemplate`):

- O composer sugere `{{link_inscricao}}` / `{{link_atualizacao}}` como variáveis, mas ao salvar o template só grava `link` (URL crua) — perde `link_title/description/image`.
- No teste chama `sendMessage({ text: "[TESTE] "+body, renderOptions: { unknownAsEmpty: true } })` **sem `origin`**. Como `renderMessageVars` monta os links a partir do `origin`, `{{link_inscricao}}` vira string vazia.
- Como não há OG salvo e `useSendLink` não é lido, `planEndpoint` escolhe `send-text`. Deveria acrescentar `tpl.link` no corpo via `ensureLinkInBody`, mas se o body já contém `{{link_inscricao}}` (vazio) o usuário vê a mensagem sem link.
- Além disso o preview do composer usa `window.location.origin`, então mostra o link certo — daí a divergência preview × envio.

**2. Motor de envio fragmentado (3 implementações diferentes)**

| Superfície | Arquivo | Estado |
|---|---|---|
| Campanhas (worker) | `src/lib/campaigns.server.ts` linhas 30-100 | Reimplementa envio, escolhe endpoint na mão, não usa `sendMessage`, não conhece `send-link` |
| Inbox / ficha / mapa | `src/lib/inbox.functions.ts` `sendDirectMessage` | Chama `zapi.sendText` direto; ignora `link_*` e feature flag |
| Automações & teste de template | `src/lib/automations.server.ts`, `messages.functions.ts` | Já usam `sendMessage` (correto) |
| `wa.me` (território) | `src/lib/wa-send.server.ts` | ok |

**3. Composer fragmentado**

| Superfície | Componente | Recursos |
|---|---|---|
| Campanhas (aba lista) | `MessageComposer` | variáveis (subset), link+preview, anexo, preview WhatsApp — **sem emojis, sem formatação** |
| Templates (`/mensagens`) | `MessageComposer` | idem, mas salva só `link_url` (perde OG) |
| Wizard WhatsApp (contatos/mapa) | `SendWhatsAppWizard` (embutido) | **emojis, negrito/itálico/mono/lista**, variáveis full, link, anexo — não usa `MessageComposer` |
| Inbox / Add contato / Ficha | textarea cru | **sem** variáveis, sem emoji, sem link estruturado |

Resultado: comportamento e visual diferentes por tela, e nem todas persistem `link_title/description/image`.

## Objetivo

- Consertar o link no teste imediatamente.
- Unificar composer (um único componente com emoji + formatação + variáveis + link OG + anexo + preview) e motor de envio (`sendMessage` como único caminho).

## Plano de execução

### Passo 1 — Fix imediato do teste (mensagens)

- Em `sendTestTemplate` passar `renderOptions: { origin, unknownAsEmpty: true }` (origin vindo de `process.env.PUBLIC_BASE_URL` ou header `origin` da request; fallback para published URL).
- Passar `origin` também em `retryAutomationDelivery`/`triggerAutomationForContact` (mesmo problema latente).
- Já que templates precisam ter OG persistido para usar `/send-link`, adicionar colunas `link_title/link_description/link_image` em `message_templates` (migration) e mapear no `MessageComposer` de `mensagens.tsx` (hoje só passa `link_url`, joga OG fora).

### Passo 2 — Unificar composer

Estender `MessageComposer` para incluir o que hoje só existe no wizard:
- Barra de formatação WhatsApp (`*negrito*`, `_itálico_`, `~riscado~`, `` `mono` ``, listas) preservando cursor.
- Popover de emojis (mesma lista `QUICK_EMOJIS`, extensível).
- Prop `variables` para permitir subset (composer) ou lista cheia (wizard).
- Preview e chip "endpoint planejado" via `planEndpoint`.

Trocar por `MessageComposer` em:
- `SendWhatsAppWizard` (remove ~200 linhas de composer embutido).
- `sendDirectMessage` na inbox (`CommunicationInbox`) — hoje textarea puro; passar a compor `ComposerValue` completo com link/anexo.
- `AddContactButton` / ficha do contato onde há mensagem WhatsApp inline (auditar e substituir).

### Passo 3 — Unificar motor

- `sendDirectMessage` (`inbox.functions.ts`): trocar bloco `try { zapi.sendText… }` por `sendMessage({ origin: "inbox", link, attachment, ... })`. Persistir `endpoint_used`, `preview_status`, `link_*` em `direct_messages` (colunas já existem no padrão de campaigns; criar migration se faltar).
- `campaigns.server.ts` worker: substituir o bloco 50-88 por chamada a `sendMessage`, lendo `use_send_link` via `readUseSendLinkFlag()`. Persistir os campos de retorno em `campaign_recipients` (já mapeado). Aceitar `link_title/link_description/link_image` da campanha.
- Adicionar `origin` (base URL pública) num helper `getPublicOrigin()` reutilizável em todos os handlers para render consistente de `{{link_*}}`.

### Passo 4 — Regressão

- Roteiro manual: (a) template com `{{link_inscricao}}` → enviar teste → conferir link no WhatsApp; (b) inbox: mensagem com link → confirmar prévia; (c) campanha com link OG → confirmar `endpoint_used=send-link`; (d) wizard: emojis/formatação ainda funcionam.
- Typecheck após cada migration.

## Detalhes técnicos

- **Migration `message_templates`**: `alter table message_templates add column link_title text, add column link_description text, add column link_image text;` — sem GRANT novo (tabela já ok), sem impacto em RLS.
- **Migration `direct_messages`**: adicionar `endpoint_used text, preview_status text, link_title text, link_description text, link_image text` se ausentes (verificar antes; criar índice não é necessário).
- **`getPublicOrigin()`** em `src/lib/wa-send.server.ts`: lê `process.env.PUBLIC_BASE_URL` (novo) → fallback `https://povoquebatalha.lovable.app`. Nenhum secret novo obrigatório.
- **`MessageComposer` API nova**:
  ```ts
  <MessageComposer
    value={v} onChange={setV}
    variables={MESSAGE_VARIABLES}       // ou COMPOSER_VARIABLES
    features={{ formatting: true, emoji: true, link: true, attachment: true, preview: true }}
  />
  ```
  Retrocompatível: props antigas (`showLink`, `showAttachment`, `showPreview`) continuam funcionando.
- **Wizard**: mantém steps (audiência, mensagem, revisão); passo "mensagem" passa a ser só `<MessageComposer .../>`.
- **Nada é apagado no banco**; templates existentes seguem válidos (colunas OG novas ficam nulas até re-editar).

## O que NÃO muda

- Estrutura de rotas, tabelas existentes, RLS, políticas.
- Fluxo de opt-out, consentimento, validações.
- Fluxo `wa.me` do território.
