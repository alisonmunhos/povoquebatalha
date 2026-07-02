## Objetivo

Resolver três pontos do Módulo Comunicação → Inbox:

1. Botão de anexo funcional (imagem/documento) no chat.
2. Recebimento de mensagens da Z-API chegando ao Inbox.
3. Painel lateral direito (informações do contato) retrátil para ampliar o chat.

---

## 1. Anexos no chat do Inbox

Hoje o clip (`Paperclip`) está `disabled`. Vamos habilitar upload igual ao que já existe no editor de mensagens.

- Reutilizar o bucket `campaign-media` (já configurado, só staff).
- Novo helper server no cliente Z-API: `sendDocument(phone, url, filename)` além do `sendImage` já existente.
- Estender `sendDirectMessage` (`src/lib/inbox.functions.ts`) para aceitar `media_path`, `media_mime`, `media_filename` opcionais. Gera URL assinada (curta duração para envio, longa para exibição no timeline), chama `sendImage` ou `sendDocument` conforme mime, e persiste os campos em `direct_messages`.
- Adicionar colunas `media_path`, `media_mime`, `media_filename` em `direct_messages` (migration).
- UI no `CommunicationInbox`:
  - Botão de clip abre file picker (imagem/PDF/áudio até ~15MB).
  - Prévia inline do anexo escolhido acima do textarea, com botão “remover”.
  - Envio dispara upload → `sendDirectMessage` com o arquivo → limpa estado.
  - Timeline renderiza miniatura de imagem ou linha de arquivo (nome + link).

---

## 2. Recebimento de mensagens (webhook Z-API)

Diagnóstico atual: `webhook_log` está vazio e `whatsapp_instances.last_ping` nulo → a Z-API não está chamando os endpoints. O handler `/api/public/zapi/{evento}` está correto e o toggle `inbound_to_inbox_enabled` está ligado. Falta configuração dos webhooks no painel da Z-API.

Ações:

- Reformular a tela `/whatsapp` para mostrar de forma bem clara **as URLs completas prontas para colar no painel Z-API**, uma por evento (`on-connect`, `on-disconnect`, `on-send`, `on-delivery`, `on-read`, `on-receive`, `on-message-status`), já com o parâmetro `?token=…` (usando o segredo existente `ZAPI_WEBHOOK_SECRET`).
- Botão “Copiar” em cada URL e passo a passo curto (Painel Z-API → Webhooks → colar em cada evento → salvar).
- Card de diagnóstico com: último `webhook_log` recebido (evento + horário), última `on-receive`, status atual da instância e alerta em vermelho quando não houver evento algum nas últimas 24 h.
- Endpoint utilitário server (`getWebhookDiagnostics`) que devolve esses dados para a UI.
- Sem mudança no handler em si — ele já cria contato/insere `inbound_messages` corretamente quando o `on-receive` chega.

Observação: nada aqui expõe segredos ao usuário final — a URL só é visível ao admin logado dentro do painel.

---

## 3. Painel de contato retrátil

No `CommunicationInbox`, a coluna direita com dados do contato/notas ocupa espaço fixo. Vamos:

- Adicionar estado `infoOpen` (default `true` em telas ≥ lg, fechado em telas menores) persistido em `localStorage`.
- Botão no header do chat (ícone painel/`PanelRightClose`/`PanelRightOpen`) que alterna a visibilidade do painel direito.
- Quando fechado, o chat expande para ocupar toda a largura restante. Transição suave (`transition-all`).
- No mobile, mantém o comportamento atual de tabs (`list`/`thread`/`info`).

---

## Detalhes técnicos

Arquivos afetados:

- `src/integrations/zapi/client.server.ts` — adicionar `sendDocument`.
- `src/lib/inbox.functions.ts` — aceitar anexos em `sendDirectMessage`, novo `getWebhookDiagnostics`.
- `src/components/CommunicationInbox.tsx` — anexos + painel retrátil.
- `src/routes/_authenticated/whatsapp.tsx` (ou componente equivalente) — URLs de webhook + diagnóstico.
- Migration: colunas de mídia em `direct_messages` + grants já herdados.

Sem alteração em RLS existente, sem mexer em auth, sem mudar rotas públicas.

## Fora de escopo

- Envio de áudio gravado no navegador.
- Reprocessar `webhook_log` antigo (não há nenhum ainda).
- Redesign visual do Inbox além da coluna retrátil.
