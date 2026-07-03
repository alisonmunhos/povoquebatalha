## Diagnóstico

**Problema 1 — link não chega ao contato e sem prévia:**
- No `SendWhatsAppWizard`, o campo dedicado de link (`linkUrl`) só entra na mensagem se o usuário clicar em "Inserir link". Se não clicar, o link **fica só no state do wizard e nunca vai para o backend**.
- `createCampaignFromSelection` não aceita nenhum campo de link — a tabela `campaigns` não tem colunas `link_url/title/description/image` (só `direct_messages` tem).
- `processCampaignBatch` (worker de envio) e `campaigns.server.ts` (cron) **não usam** o novo motor `sendMessage`. Chamam `zapi.sendText` direto com `rendered_message`, que sai sem link nenhum. As colunas `endpoint_used/preview_status/link_*` criadas na Etapa 1 em `campaign_recipients` nunca são preenchidas.
- Resultado: o contato recebe só o texto puro, sem URL nem card.

**Problema 2 — "Ver prévia" e "Preparar destinatários" não fazem nada:**
- `prepareCampaign` só aceita status `draft|scheduled|paused`. Se a campanha já está `running`/`done`, dispara erro. Se o erro chega ao toast, aparece; se falha antes por outro motivo, botão parece morto.
- `previewCampaign` faz `.limit(5)` na query, então "elegíveis" nunca reflete o público real quando `audience_ids` já foi montado — mostra número enganoso e sem exemplos.
- Precisa verificar erros reais em runtime (após 1º ajuste dá para diagnosticar).

## Plano de correção (imediato)

### 1. Persistir link estruturado em campanhas
- Migration: adicionar `link_url text`, `link_title text`, `link_description text`, `link_image text` em `public.campaigns`. Preservar dados existentes.
- Estender `campaignInput` e `createFromSelectionSchema` (`src/lib/campaigns.functions.ts`) para aceitar esses 4 campos.
- Ajustar `upsertCampaign` e `createCampaignFromSelection` para gravar os campos.

### 2. Garantir link no `rendered_message` de cada destinatário
- Ao montar `campaign_recipients`, se `campaign.link_url` existe e não está contido no template renderizado, anexar `\n\n{link_url}` ao final. Isso garante que o WhatsApp (com `linkPreview:true`) tenha URL para expandir.
- Aplicar tanto em `createCampaignFromSelection` quanto em `prepareCampaign`.

### 3. Wizard passa o link mesmo sem "Inserir link"
- No `submit()` do `SendWhatsAppWizard`, incluir no payload: `link_url`, `link_title`, `link_description`, `link_image` a partir do state `linkUrl` + `linkPreview`.
- Manter o botão "Inserir link" opcional (para quem quer o link no meio do texto).

### 4. Migrar envio de campanhas para o motor `sendMessage`
- Refatorar `processCampaignBatch` (`campaigns.functions.ts`) e `processCampaignBatchInternal` (`campaigns.server.ts`) para:
  - Chamar `sendMessage({ contact, text: rendered_message, link: { url, title, description, image, status }, attachment, origin: "campaign", useSendLink })`.
  - Persistir em `campaign_recipients`: `endpoint_used`, `preview_status`, `link_url`, `link_title`, `link_description`, `link_image`, `fallback_reason` (colunas já existem).
- Ler flag `use_send_link` via `readUseSendLinkFlag()`. Enquanto a flag estiver desligada, o motor usa `send-text` com `linkPreview:true` — a URL no corpo já força o WhatsApp a gerar preview quando o site permite.

### 5. Corrigir "Ver prévia" e "Preparar destinatários"
- `previewCampaign`: remover `.limit(5)`, contar corretamente todos os aptos vs. inaptos, retornar até 3 exemplos personalizados e o motivo do descarte (`sem_consent`, `opt_out`, `sem_telefone`, `arquivado`). Toast deve mostrar breakdown ("X aptos · Y sem consentimento · Z opt-out").
- `prepareCampaign`: manter regra de status, mas retornar toast claro quando bloqueado ("Campanha em envio — pause antes de reprocessar"). Adicionar `console.error` do lado do server-fn e mensagem legível quando `audience_ids` vazio.
- Frontend: nos `useMutation` desses dois botões, garantir toast em `onSettled` e desabilitar durante `isPending` (já existe). Adicionar `retry:false` para o handler `useQuery({refetchInterval:4000})` não mascarar toasts.

### 6. Sinalização de status na tela da campanha
- Ao lado do bloco "Mensagem" mostrar o link com badge da prévia (`preview_confirmada|provavel|indisponivel|link_bloqueado|sem_link`) — reaproveita `MessagePreview`/`LinkPreviewCard`.
- Tabela de destinatários: mostrar coluna extra "Endpoint" (usa `endpoint_used`) só se estiver preenchido, para diagnosticar envios recentes.

## Fora de escopo
- Não mexer em Inbox, Mapa, Território, Automação nesta rodada.
- Não implementar `send-link` ativo (flag continua desligada até você confirmar que a Z-API do plano suporta).
- Não recriar CRM, tags, segmentos.

## Riscos
- Preview no WhatsApp depende do site alvo permitir OG scraping. Redes sociais (Instagram/Facebook/TikTok) frequentemente bloqueiam — nesse caso o link chega, o balão do WhatsApp aparece sem card. Isso é limite do WhatsApp, não do sistema.
- Migration adiciona 4 colunas nullable em `campaigns`; sem risco para dados existentes.
- Alterar `processCampaignBatch` para o motor único muda o fluxo em produção — vou preservar o comportamento atual quando `link_url` for null (fallback para `sendText` puro), assim campanhas antigas não são afetadas.

## Onde testar depois do build
1. Abrir wizard de envio em massa, colar um link no campo dedicado (sem clicar "Inserir link"), enviar rascunho, verificar em `/campanhas/{id}` que aparece o link.
2. Clicar "Ver prévia" — deve mostrar breakdown correto.
3. Clicar "Preparar destinatários" em rascunho — deve popular a fila; se em `running`, toast explicando bloqueio.
4. "Iniciar envio" + "Enviar próximo lote agora" — destinatário deve receber texto **com** o link ao final e preview do WhatsApp (quando site permitir).
5. Conferir na tabela de destinatários que `endpoint_used` = `send-text` e a mensagem enviada contém o URL.