# Migração 100% para a API oficial do WhatsApp (Cloud API da Meta)

## O que eu já confirmei com os dados que você mandou

Consultei a API da Meta e está tudo coerente:

- **Phone Number ID `1370198982834159` está correto.** Ele corresponde ao número **+55 51 8213-7088**, nome verificado **"Coletivo Alicerce"**, verificação **concluída**, rodando na **Cloud API** com throughput **STANDARD**.
- **O token é realmente permanente** (tipo "usuário do sistema", sem data de expiração) e está válido, ligado ao app `991613737267368`. As permissões estão certas: `whatsapp_business_messaging`, `whatsapp_business_management`, `business_management`.
- **App ID e App Secret**: recebidos. O App Secret é o que faltava para o receptor de webhook já existente validar as chamadas da Meta.

### Segurança: precisa trocar o token e o App Secret
Token e App Secret foram colados no chat, então saíram do cofre. Antes de virar a chave em produção: gere um novo token para o usuário do sistema e clique em "Redefinir" no App Secret (Painel do app > Configurações > Básico). Depois eu abro um formulário seguro e você cola os valores novos — eles ficam criptografados, fora do código e invisíveis no navegador.

### Onde achar o WABA ID
Não consigo puxar automaticamente porque esse usuário do sistema não expõe a lista de contas. Você encontra em: **business.facebook.com > WhatsApp Manager > Configurações da API (ou "Configuração da conta")** — aparece como "ID da conta do WhatsApp Business", logo acima/abaixo do ID do número de telefone. Também aparece na tela do app em Desenvolvedores > WhatsApp > Configuração da API.

### Sobre o repositório que você indicou
`alisonmunhos/openapi` é um fork do repositório oficial da Meta com a **especificação OpenAPI da WhatsApp Business API (v23.0)**. Serve como documentação formal dos formatos de requisição/resposta — vou usar como referência de contrato, mas não é uma biblioteca para instalar.

## Informações que ainda faltam

| Item | Situação |
|---|---|
| Phone Number ID | OK (confirmado) |
| Token permanente | OK (será re-cadastrado após rotação) |
| App ID / App Secret | Recebido (rotacionar o secret) |
| **WABA ID** | Falta — buscar no WhatsApp Manager |
| **Webhook configurado** | Falta — colar a URL abaixo no painel e assinar os campos `messages` |
| **Limite de envio atual** | Verificar em WhatsApp Manager (250, 1.000, 10.000/dia) |
| **Templates aprovados** | Falta — nenhuma campanha em massa funciona sem isso |
| **Forma de pagamento na conta** | Verificar — sem cartão vinculado, a Meta bloqueia envios pagos |

URL do webhook: `https://povoquebatalha.lovable.app/api/public/whatsapp-cloud/webhook`
Verify token: o valor já salvo em `META_WEBHOOK_VERIFY_TOKEN` (te mostro qual usar no momento da configuração).

## O que muda na operação (importante)

A API oficial não é a Z-API com outra URL. Três diferenças mudam o dia a dia:

1. **Não existe mais QR Code.** O número vive na Meta, não no celular. A tela "Conexão WhatsApp" deixa de ter QR/desconectar e passa a mostrar saúde do número, qualidade e limite diário.
2. **Campanha em massa exige template aprovado pela Meta.** Texto livre só é permitido dentro da **janela de 24h** depois que a pessoa te responde. Ou seja: Inbox e conversas ativas seguem livres; disparos frios precisam de template com variáveis (`{{1}}`, `{{2}}`), aprovado antes.
3. **Prévia de link muda.** O truque atual (`send-link` com título/imagem forçados) não existe na oficial: a prévia vem do próprio link (og:image, que já arrumamos) ou de um template com imagem de cabeçalho.

O que **não** muda: contatos, segmentos, campanhas, opt-out, missões de agitação, inbox, relatórios. Tudo isso passa por um motor único de envio (`wa-send.server.ts`) — é lá que a troca acontece.

## Plano de execução

### Etapa 1 — Cliente oficial + envio em paralelo
Criar o cliente da Cloud API e ligá-lo ao motor de envio existente, com um **interruptor de provedor** (Z-API ou Oficial) por configuração. Nada é removido: dá para voltar atrás em um clique. Cobre texto (janela 24h), imagem, documento e template.

### Etapa 2 — Templates
Tela para cadastrar/sincronizar templates aprovados e mapear as variáveis do sistema (nome, cidade, link de cadastro) nas posições `{{1}}`, `{{2}}`. O assistente de campanha passa a exigir template quando o destinatário está fora da janela de 24h, e mostra a prévia com as variáveis preenchidas.

### Etapa 3 — Recebimento e status
Completar o webhook oficial: validar assinatura (já implementado, falta o secret), baixar mídia recebida (na oficial vem um ID e exige download autenticado) e gravar entregue/lido/falha como hoje. Opt-out por palavra-chave continua igual.

### Etapa 4 — Telas
Substituir QR Code por painel de saúde do número: qualidade, limite diário, número verificado, templates aprovados. Avisos de bloqueio deixam de falar "shadowban" e passam a refletir qualidade/limite da Meta.

### Etapa 5 — Virada e limpeza
Rodar as duas em paralelo alguns dias, comparar entrega, virar o interruptor para Oficial e só então remover o código e os secrets da Z-API.

## Detalhes técnicos

- Novo `src/integrations/whatsapp-cloud/client.server.ts` (Graph API v23.0, `POST /{phone_number_id}/messages`), lendo secrets dentro do handler.
- `src/lib/wa-send.server.ts` ganha seletor de provedor mantendo `SendInput`/`SendResult` intactos, para não tocar nos ~10 chamadores (campanhas, automações, inbox, missões, cadastro de usuário).
- `message_id` passa a guardar o `wamid` da Meta; `zaap_id` fica nulo nos envios oficiais.
- Migration: coluna de provedor em `instance_settings` + tabela `whatsapp_templates` (com GRANTs e RLS).
- Mídia recebida: `GET /{media_id}` + download com Bearer, salvando no bucket `campaign-media`.
- Secrets a cadastrar: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, `META_APP_SECRET`, `META_APP_ID`.

## Riscos
- Aprovação de template leva de minutos a dias — cadastrar antes das campanhas.
- Limite inicial costuma ser 250 conversas/dia por número, subindo conforme qualidade.
- Custo por conversa de marketing cobrado pela Meta (modelo diferente da mensalidade da Z-API).
- Qualidade baixa (muitos bloqueios/denúncias) reduz o limite automaticamente — o painel da Etapa 4 serve justamente para acompanhar isso.
