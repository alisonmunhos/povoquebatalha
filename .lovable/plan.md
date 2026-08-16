# Migração 100% para a API oficial do WhatsApp (Cloud API da Meta)

## Primeiro: sobre o token que você colou

Aquele texto começando com `EAAO...` é um **token de acesso da Meta (Graph API)**. É a "senha" que autoriza enviar mensagens em nome da sua conta do WhatsApp Business. Dois pontos importantes:

1. **Ele foi exposto no chat, então precisa ser invalidado.** No painel da Meta (Business Settings > Usuários do sistema, ou o token temporário do app), gere um novo e descarte esse. Nunca cole tokens no chat — eu guardo isso como secret, sem aparecer no código nem no navegador.
2. **Sozinho ele não basta, e provavelmente é temporário.** Os tokens gerados na tela de teste do app expiram em 24 horas. Para produção é preciso um **token de Usuário do Sistema (permanente)**. Além dele, preciso de mais três dados:
   - **Phone Number ID** (identificador do número no WhatsApp Cloud)
   - **WABA ID** (conta do WhatsApp Business)
   - **App Secret** do app da Meta (usado para validar que os webhooks vêm mesmo da Meta)

Secrets a cadastrar: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, `META_APP_SECRET`. Hoje só existe `META_WEBHOOK_VERIFY_TOKEN` — sem `META_APP_SECRET` o receptor de webhook que já criamos responde erro e ignora tudo.

## O que muda de verdade (e o que não muda)

A API oficial não é "a mesma coisa com outra URL". Três diferenças mudam a operação:

- **Não existe mais QR Code.** O número passa a viver na Meta, não no celular. A tela de conexão WhatsApp deixa de ter QR/desconectar e passa a mostrar status do número (verificado, qualidade, limite diário).
- **Mensagem em massa exige template aprovado.** Não é possível disparar texto livre para quem não falou com você antes. Cada mensagem de campanha precisa de um **template** cadastrado e aprovado pela Meta (com variáveis `{{1}}`, `{{2}}`...). Texto livre só vale dentro da **janela de 24h** após a pessoa te responder — ou seja, o Inbox continua livre, as campanhas não.
- **Prévia de link muda.** O truque atual de `send-link` com título/descrição/imagem não existe na oficial: a prévia vem do próprio link (og:image), ou usa-se um template com imagem de cabeçalho.

O que continua igual: contatos, segmentos, campanhas, opt-out, missões de agitação, inbox, relatórios. Tudo isso conversa com um único motor de envio (`wa-send.server.ts`), que é o ponto onde a troca acontece.

## Plano de execução

### Etapa 0 — Pré-requisitos (você, no painel da Meta)
Número verificado na Cloud API, token permanente de usuário do sistema, App Secret, e o webhook apontado para `https://povoquebatalha.lovable.app/api/public/whatsapp-cloud/webhook`. Sem isso as etapas seguintes não podem ser testadas.

### Etapa 1 — Cliente oficial + envio em paralelo
Criar o cliente da Cloud API e ligá-lo ao motor de envio existente, com um **interruptor de provedor** (Z-API ou Oficial) escolhido por configuração. Nada é removido: dá para voltar atrás em um clique. Envio de texto (janela 24h), imagem, documento e template.

### Etapa 2 — Templates
Nova tela para cadastrar/listar templates aprovados e mapear as variáveis do sistema (nome, cidade, link) nas posições `{{1}}`, `{{2}}`. O assistente de envio de campanha passa a exigir template quando o destinatário está fora da janela de 24h.

### Etapa 3 — Recebimento e status
Completar o webhook oficial já criado: baixar mídia recebida (na oficial vem um ID, precisa download autenticado), e registrar status entregue/lido/falha do mesmo jeito que hoje. Opt-out por palavra-chave continua funcionando.

### Etapa 4 — Telas
Substituir QR Code por painel de saúde do número (qualidade, limite de envio, templates aprovados). Manter os avisos de bloqueio, só trocando "shadowban" por "qualidade/limite da Meta".

### Etapa 5 — Virada e limpeza
Rodar as duas em paralelo por alguns dias, virar o interruptor para Oficial, e só depois remover o código da Z-API e seus secrets.

## Detalhes técnicos

- Novo `src/integrations/whatsapp-cloud/client.server.ts` (Graph API v21+, `POST /{phone_number_id}/messages`), lendo secrets dentro do handler.
- `src/lib/wa-send.server.ts` ganha um seletor de provedor; a assinatura de `SendInput`/`SendResult` é preservada para não tocar nos ~10 chamadores (campanhas, automações, inbox, missões, cadastro).
- Campos `zaap_id`/`message_id` continuam: na oficial só `message_id` (wamid) é preenchido.
- Migration: coluna de provedor em `instance_settings` + tabela de templates (`whatsapp_templates`) com GRANTs e RLS.
- Endpoint de mídia recebida: `GET /{media_id}` + download com Bearer, salvando no bucket `campaign-media`.

## Riscos
- Templates levam de minutos a dias para aprovação — planejar antes das campanhas.
- Limite inicial de 250 conversas/dia por número, subindo conforme qualidade.
- Custo por conversa de marketing (cobrado pela Meta), diferente da mensalidade da Z-API.
