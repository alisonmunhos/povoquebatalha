## Diagnóstico rápido

1. **"Contato não migrou"** — na verdade migrou: a Marina (cadastrada em 01/07 20:24) está em `contacts` com `lifecycle_status=recadastro_concluido` e telefone normalizado. O que não aconteceu foi o **WhatsApp de confirmação**: `automation_deliveries` está sem nenhum registro para ela, mesmo com a automação `atualizacao_apoiador_concluida` ativa (sem consentimento obrigatório). Provável causa: falha silenciosa no bloco de disparo (log de erro só foi adicionado no turno anterior, depois do envio dela) ou a instância Z-API estava desconectada no momento — sem linha de erro para diagnosticar.

2. **`?origem=whatsapp_grupo_antigo` no link** — é só um parâmetro de rastreio (UTM interno), validado no schema da rota. **Não atrapalha** o cadastro nem o envio da mensagem. É opcional. Vou deixar o módulo `/links` gerar também a versão "limpa" (sem `?origem`) e explicar isso na UI.

3. **Compositor de mensagem sem anexo/link/preview/teste** — o editor em `/mensagens` hoje só tem campos de texto para "link" e "URL de mídia" digitados, sem upload, sem prévia de como o contato verá e sem envio de teste por telefone digitado ali (o botão atual pergunta via `prompt()`).

## Plano

### 1. Garantir a confirmação por WhatsApp (crítico)

- Em `src/lib/automations.server.ts`:
  - Antes do `for` das automações, gravar uma linha `automation_deliveries` com `status='queued'` (upsert por `automation_id,contact_id`) para que **toda tentativa fique visível**, mesmo se algo quebrar no meio.
  - Envolver a checagem inicial (fetch de automações, contato) em `try/catch` que grava `status='error'` numa linha síntese quando não há automação carregada.
  - Registrar no `console.error` também o payload do Z-API (status HTTP, corpo) quando `sendText` falhar.
- Em `src/integrations/zapi/client.server.ts`:
  - `sendText` passa a enviar `{ phone, message, linkPreview: true }` (Z-API respeita a flag e o WhatsApp gera a prévia do link).
- Em `src/routes/api/public/forms/recadastro.ts`:
  - Se a instância estiver desconectada no momento do submit, ainda gravar um `automation_deliveries` com `status='error'` explicando "instância desconectada" (chamada rápida a `zapi.status()` antes do `triggerAutomationsForEvent`, sem bloquear resposta).
- Retentativa manual: adicionar no painel de "Últimas entregas" (`/mensagens` → Automações) um botão **"Reenviar"** por linha que dispara a automação novamente para aquele contato (server-fn nova `retryAutomationDelivery`). Isso resolve Marina imediatamente.

### 2. Links Públicos mais claros

Em `src/routes/_authenticated/links.tsx`:
- Mostrar duas variações lado a lado para cada formulário:
  - **Link limpo**: `/recadastro` e `/inscrever` (sem query).
  - **Link com origem**: `/recadastro?origem=…` (o atual).
- Bloco explicativo curto: o parâmetro `?origem=` é opcional, serve só para saber por onde a pessoa chegou, e **não interfere** no cadastro nem no envio da confirmação.

### 3. Compositor de mensagem (templates em `/mensagens`)

Refazer o editor de template:
- **Anexo real**: upload para o bucket `campaign-media` (mesma lógica do `SendWhatsAppWizard`), guardando `media_url` + `media_mime` + `media_filename` no template. Aceita imagem (JPG/PNG/WEBP) e PDF.
- **Campo Link**: já existe; deixar claro que é opcional e que o WhatsApp gera prévia automática quando houver URL no corpo (com a flag `linkPreview:true` acima).
- **Prévia estilo WhatsApp**: painel à direita renderizando bolha verde com quebras de linha preservadas, thumbnail da mídia anexada e cartão de prévia do link (título/descrição/imagem) obtido via nova rota server `api/public/link-preview?url=…` que faz fetch do HTML e extrai `og:title`, `og:description`, `og:image` (com timeout curto e cache em memória).
- **Enviar teste**: substituir o `prompt()` por um input inline "WhatsApp de teste (com DDD)" + botão **"Enviar teste"** que chama `sendTestTemplate` já existente (estender para aceitar `media_url` do template, hoje só manda texto).

## Detalhes técnicos

- Arquivos alterados: `src/lib/automations.server.ts`, `src/integrations/zapi/client.server.ts`, `src/routes/api/public/forms/recadastro.ts`, `src/routes/api/public/forms/inscrever.ts`, `src/routes/_authenticated/links.tsx`, `src/routes/_authenticated/mensagens.tsx`, `src/lib/messages.functions.ts`.
- Arquivos novos: `src/routes/api/public/link-preview.ts` (fetch + parse OG, retorna JSON `{title,description,image,url}`), `src/components/MessagePreview.tsx` (bolha WhatsApp).
- Banco: adicionar colunas `media_mime text`, `media_filename text` em `message_templates` via migração; sem mudanças em RLS.
- Sem alteração de esquema em `automation_deliveries` — só uso mais consistente do `upsert`.

## Fora de escopo neste passo

- Reenvio em lote de todas as automações "perdidas" do passado (só o botão manual por linha).
- Delay configurado por automação (continua imediato).
