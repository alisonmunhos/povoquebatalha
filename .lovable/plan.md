## Diagnóstico

Vasculhei o código de envio. A pré-visualização não aparece por 3 motivos combinados:

1. **O loop de envio das campanhas não usa o motor unificado `wa-send.server.ts`**  
   Em `src/lib/campaigns.functions.ts` (linhas 470–560, dentro de `processCampaignBatch`), o envio chama `zapi.sendText/sendImage/sendDocument` diretamente. Nunca cai em `zapi.sendLink`, mesmo quando há `link_url + link_title + link_image` salvos na campanha. Ou seja: a UI mostra a prévia bonita, mas na hora de mandar a Z-API só recebe texto.

2. **`zapi.sendText` envia `linkPreview: true`, mas o preview depende 100% do WhatsApp cachear o link**  
   Já está correto em `src/integrations/zapi/client.server.ts` linha 66. Quando não aparece prévia com send-text, é porque:  
   - o telefone-instância estava dormindo/desconectado no momento do envio;  
   - a URL não tem `og:image` válida ou a imagem é > 300 KB;  
   - o cache do Facebook está com metadados antigos.  
   O caminho robusto é usar **`/send-link`** com título/descrição/imagem que já capturamos na composição — assim a prévia não depende de o WhatsApp buscar o link em tempo real.

3. **Sem log/observabilidade do que a Z-API respondeu**  
   Hoje salvamos `endpoint_used` e `preview_status`, mas não a resposta real do provedor nem o motivo do fallback. Fica difícil dizer "o envio X falhou o preview porque Y".

## O que fazer

### Etapa 1 — Fazer as campanhas usarem `/send-link` quando o link tem prévia

Em `campaigns.functions.ts` (`processCampaignBatch`):

- Ler a flag `use_send_link` via `readUseSendLinkFlag()` (já existe em `wa-send.server.ts`) **e** por padrão ligar em `true` (é isso que resolve o sintoma).
- Quando `c.link_url` estiver definido **e** houver `c.link_title` ou `c.link_image`:
  - chamar `zapi.sendLink({ phone, message: bodyRendered, linkUrl, title, linkDescription, image, linkType: "LARGE" })`;
  - `endpoint_used = "send-link"`, `preview_status = "preview_confirmada"`.
- Se `sendLink` falhar: fallback para `sendText` com `linkPreview:true`, gravar `fallback_reason` em `campaign_recipients.erro_preview` (novo campo texto opcional — se a coluna não existir, gravar dentro do `payload` do `message_events`).
- Quando `c.tipo === "image"` e existir link com prévia salva: continuar mandando a imagem (a mídia é o principal), mas depois disparar um segundo `sendLink` com o link. Alternativa mais simples que vou adotar: se há mídia, mantemos hoje (mídia tem prioridade); se não há mídia e há link com OG, usar `send-link`.

### Etapa 2 — Ligar a mesma flag no `SendWhatsAppWizard` e no botão "Enviar teste"

Todos os pontos que hoje chamam `zapi.sendText` para um payload que tem `link_url + link_title/image` devem passar pelo mesmo caminho decisor. A forma mais barata é criar uma função interna `sendCampaignPayload(...)` em `campaigns.functions.ts` que centraliza a escolha e é chamada tanto pelo loop de campanha quanto pelo "enviar teste"/wizard.

### Etapa 3 — Persistir resposta bruta para debug

- Em `message_events.payload` já gravamos o retorno do `zapi.*`. Vou passar a incluir também `{ endpoint, requested_preview: {title, image, description}, fallback_reason }` para conseguirmos abrir um evento e ver exatamente o que a Z-API recebeu.
- Adicionar log server-side (`console.warn`) quando `sendLink` falha, para o `server-function-logs` mostrar a mensagem da Z-API.

### Etapa 4 — Painel "Como o contato vai ver"

No detalhe da campanha (`/campanhas/:id`), no card do destinatário, mostrar:

- `endpoint_used` traduzido ("Texto com preview automático" / "Link com preview forçado" / "Imagem" / "Documento");
- `preview_status` com badge (verde = confirmada, amarelo = provável, cinza = sem link, vermelho = bloqueado);
- se houve `fallback_reason`, mostrar em tooltip.

Isso responde diretamente ao pedido "quero saber exatamente como vai aparecer para o contato".

### Etapa 5 — Checklist na UI para o site do link

No `MessageComposer`, quando a prévia carrega, mostrar um bloco pequeno de dicas se a imagem do OG for suspeita:

- se `og:image` > 300 KB (checar via HEAD dentro de `fetchLinkPreview`), avisar "A imagem do link tem X KB — o WhatsApp pode descartar a prévia. Recomendado <300 KB.";
- link para o Facebook Sharing Debugger com o URL pré-preenchido, texto: "Se o site mudou recentemente, force a atualização do cache do WhatsApp aqui.";
- aviso simples se o telefone-instância estiver `disconnected` (status já é lido em `zapi.status()`): "Instância WhatsApp desconectada — reconecte antes de enviar."

## Fora de escopo

- Não vou mexer no wizard `SendWhatsAppWizard` além de reaproveitar a mesma função central.
- Nenhuma migration necessária. As colunas `link_title/description/image/preview_status/endpoint_used` já existem em `campaign_recipients`.
- Não vou tocar em `inbound_messages` / Inbox.

## Detalhes técnicos

- Arquivo a editar: `src/lib/campaigns.functions.ts` (loop de envio e função de "enviar teste"), `src/components/MessageComposer.tsx` (dicas), `src/routes/_authenticated/campanhas.$id.tsx` (badge/endpoint na lista de destinatários).
- Sem novas dependências.
- Compatível com registros antigos: quem não tem `link_title/image` continua com `send-text` + `linkPreview:true` (comportamento atual).
- Nenhuma migração de banco.

## Riscos

- `/send-link` da Z-API às vezes rejeita imagens grandes ou URLs sem `https` — por isso o fallback automático para `send-text` está no plano.
- O aviso de "imagem > 300 KB" depende do site permitir HEAD sem CORS server-side; feito no server (`link-preview.functions.ts`), então CORS não é problema.
