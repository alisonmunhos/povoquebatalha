## Objetivo
No Passo 2 (Mensagem) do **SendWhatsAppWizard**, ampliar opções de personalização do texto e adicionar um campo dedicado para link com **prévia estilo WhatsApp** antes de enviar.

## Mudanças

### 1. Barra de formatação do WhatsApp
Botões acima do textarea que envolvem a seleção (ou inserem no cursor):
- **Negrito** `*texto*`
- *Itálico* `_texto_`
- ~Riscado~ `~texto~`
- Código `` `texto` ``
- Lista `- item`
- Quebra de linha / separador

### 2. Novas variáveis dinâmicas
Adicionar aos chips existentes:
- `{{saudacao}}` → "Bom dia / Boa tarde / Boa noite" (calculado por horário do envio)
- `{{uf}}`
- `{{primeiro_nome_ou_ola}}` → fallback "Olá" quando não houver nome
- `{{link}}` → placeholder do link do passo 2.3 (abaixo)

Atualizar `personalize()` no wizard **e** `renderVars()` server-side (`src/lib/campaigns.server.ts` e `src/lib/inbox.functions.ts`) para reconhecer as novas variáveis.

### 3. Campo de link com prévia
- Novo input "Link (opcional)" com validação de URL.
- Botão **"Inserir no texto"** que adiciona a URL na mensagem (ou substitui `{{link}}` se existir).
- Ao colar/validar a URL, chamar novo server function `fetchLinkPreview({ url })` que:
  - Faz `fetch` server-side com timeout 4s e User-Agent do WhatsApp.
  - Extrai `og:title`, `og:description`, `og:image`, `og:site_name` (fallback para `<title>` / `<meta description>` / favicon).
  - Retorna `{ title, description, image, siteName, url }` ou `{ error }`.
  - Cache leve em memória (LRU 50, TTL 10min).
- Card de prévia estilo WhatsApp abaixo do input: thumbnail à esquerda, título/descrição/domínio; skeleton enquanto carrega; mensagem "Sem prévia disponível" no erro.
- Persistência: guardar `preview_url` no payload de campanha para reaproveitamento no Passo 6 (Confirmação).

### 4. Confirmação (Passo 6)
Exibir o card de prévia do link junto com a mensagem final.

### 5. Envio
- Envio de campanha texto simples já usa `sendText` com `linkPreview: true` (Z-API renderiza a prévia no destinatário). Garantir que o mesmo flag esteja ativo em qualquer novo caminho.
- Nada muda no schema do banco; `mensagem_template` continua guardando o texto com a URL.

## Fora de escopo
- Não alterar o Inbox direto (`CommunicationInbox`) nesta fase — foco apenas no wizard.
- Não fazer encurtador de URL nem rastreamento de clique (pode ser fase futura).
- Sem alteração de migrations.

## Arquivos afetados
- `src/components/SendWhatsAppWizard.tsx` — barra de formatação, chips extras, campo de link, card de prévia, uso em Passo 6.
- `src/lib/messages.functions.ts` (ou novo `src/lib/link-preview.functions.ts`) — `fetchLinkPreview` server function.
- `src/lib/campaigns.server.ts` e `src/lib/inbox.functions.ts` — expandir `renderVars` com `saudacao`, `uf`, `primeiro_nome_ou_ola`.
