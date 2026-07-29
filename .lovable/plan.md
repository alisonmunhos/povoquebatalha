## Entendi assim

Hoje, quem clica em **"Não poderei ir"** sem estar identificado é obrigado a informar nome + WhatsApp antes de qualquer coisa — o que não faz sentido: a pessoa está dizendo que **não** vai.

O que você quer:

```text
[Não poderei ir]  ->  tela "Tudo bem, obrigado por avisar!" (mensagem já configurada no evento)
                          |
                          +-- [Quero continuar com vocês]  ->  Seção 1 do formulário vinculado
                          |
                          +-- (não clica em nada) -> fim, nada é pedido
```

Ou seja: **nenhum campo é pedido para recusar**. O formulário só aparece se a pessoa escolher continuar.

## Mudanças

### 1. `src/routes/evento.$slug.tsx`
- Remover o mini-formulário de identificação da recusa (`declineOpen` com nome/WhatsApp) e o bloqueio de validação em `submitRsvp("declined")`.
- Clique em "Não poderei ir":
  - **Com token** (link da notificação ou `?t=`): registra a recusa no banco normalmente e mostra a tela de recusa.
  - **Sem token**: não chama a API; mostra direto a tela de recusa (estado local `declinedLocal`).
- Tela de recusa passa a usar os campos já existentes `post_decline_title` / `post_decline_body` / `post_decline_button_text`.
- Botão "Quero continuar com vocês": se o link configurado for externo (`http…`), abre o link; senão, mostra a **Seção 1** do formulário vinculado, na mesma página, abaixo da mensagem.
- Nesse caminho, o formulário **não confirma presença**: passa `eventSlug` com intenção de recusa, para o envio da Seção 1 registrar/atualizar o contato e gravar RSVP `declined`. Some o botão "Não poderei ir" dessa etapa (ela já recusou).

### 2. Registro da recusa junto ao envio da seção
- `src/lib/events-public.server.ts`: extrair de `confirmEventRsvpForContact` uma versão com status (`confirmed` | `declined`) — o rastro de origem e o upsert são os mesmos; a notificação de confirmação só dispara em `confirmed`.
- `src/routes/api/public/forms/$slug/section-progress.ts` e `.../$slug.ts`: aceitar `event_rsvp_status` opcional (padrão `confirmed`) junto do `event_slug` já existente.
- `src/components/PublicFormRenderer.tsx`: nova prop opcional `eventRsvpStatus`, repassada no corpo das requisições. Quando for `declined`, **não** dispara a parada de confirmação (`onEventConfirmed`) — a pessoa segue direto para a Seção 2 completando o cadastro.

## Detalhes técnicos
- Sem migration: todas as colunas (`post_decline_*`) já existem e já estão preenchidas neste evento.
- Recusa anônima (sem token) não grava nada no banco até a pessoa optar por continuar e enviar a Seção 1 — nesse momento o contato é criado/atualizado e o RSVP `declined` é gravado numa única submissão.
- Fluxo de evento **sem** formulário vinculado continua igual ao de hoje.

## Uma decisão sua
Quando alguém sem token só clica em "Não poderei ir" e vai embora, **nada** fica registrado (não temos como saber quem é). A alternativa seria contar recusas anônimas num contador do evento. Minha recomendação: deixar sem registro, como acima — mais simples e sem dado inútil na base.
