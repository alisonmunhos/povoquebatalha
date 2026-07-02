## Problema

As URLs mostradas em `/whatsapp` estão sendo geradas a partir do host da requisição atual. Como você abre o painel pelo **preview** (`preview--povoquebatalha.lovable.app`), o diagnóstico devolve URLs de preview — e o preview muda a cada build (o hash `id-preview--...` ou o alias `preview--...` podem sair do ar/rotacionar), fazendo a Z-API bater num endpoint que não responde de forma estável. Por isso o envio (saindo do app) funciona, mas o `on-receive` não chega.

O correto é a Z-API apontar para a **URL estável de produção**:

```
https://povoquebatalha.lovable.app/api/public/zapi/{evento}?token=...
```

ou, se quiser um domínio imutável mesmo se você renomear o projeto:

```
https://project--3045d5d2-135a-486e-99c7-42103653d991.lovable.app/api/public/zapi/{evento}?token=...
```

## O que o plano faz

1. **Corrigir a geração das URLs de webhook em `getWebhookDiagnostics`** (`src/lib/zapi.functions.ts`)
   - Parar de derivar `base` do `getRequest()`.
   - Passar a usar sempre a URL pública de produção: `https://povoquebatalha.lovable.app`.
   - Como fallback (caso o projeto ainda não esteja publicado), usar `https://project--<PROJECT_ID>.lovable.app` — domínio estável que não muda com renome nem com novo preview.

2. **Melhorar a UI em `/whatsapp` (`WebhookDiagnosticsSection`)**
   - Adicionar um aviso em destaque: *"Use sempre a URL de produção abaixo no painel Z-API. Não use URLs de preview (`preview--...` ou `id-preview--...`) — elas mudam a cada build e param de receber mensagens."*
   - Mostrar claramente que a URL exibida é a de produção, mesmo quando o admin está acessando pelo preview.
   - Manter os botões de copiar por evento.

3. **Checklist visível para o usuário reconfigurar na Z-API**
   - Substituir as 7 URLs atuais (que começam com `preview--...`) pelas novas (produção).
   - Em especial a `on-receive`, que é a que traz as mensagens recebidas.
   - Confirmar que o toggle "Recebimento no Inbox" continua ativo em `/whatsapp`.

## Detalhes técnicos

- `PROJECT_ID` já é conhecido pelo agente: `3045d5d2-135a-486e-99c7-42103653d991`. Vai ser usado como constante no fallback do diagnóstico.
- Nenhuma mudança de banco, de webhook receiver (`/api/public/zapi/$evento.ts`) ou de lógica de recebimento — o receiver já está correto; o problema é só a URL configurada no painel Z-API.
- Nenhuma mudança em segredos. O `ZAPI_WEBHOOK_SECRET` continua o mesmo.

## Como validar depois

1. Abrir `/whatsapp` → seção "Diagnóstico do Webhook" — as URLs devem começar com `https://povoquebatalha.lovable.app/...`
2. Copiar a URL do evento **on-receive** e colar no painel da Z-API (substituindo a atual com `preview--`).
3. Repetir para os demais eventos (`on-connect`, `on-disconnect`, `on-send`, `on-delivery`, `on-read`, `on-message-status`).
4. Enviar uma mensagem de um celular externo para o número conectado.
5. Voltar em `/whatsapp` → "Testar endpoint" e conferir que **Último `on-receive`** foi atualizado.
6. Abrir `/comunicacao/inbox` — a nova mensagem deve aparecer.
