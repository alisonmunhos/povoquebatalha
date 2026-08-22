# Enviar fluxo manualmente para quem está na janela de 24h

Hoje o disparo manual do fluxo só aceita **um número digitado à mão** ("Testar no meu WhatsApp"). Não existe nenhuma lista de quem pode receber. Como a Meta só permite texto livre para quem escreveu nas últimas 24 horas, o certo é o sistema mostrar essa lista pronta.

## O que será criado

Na tela **Cadastro pelo WhatsApp** (`/fluxos-whatsapp`), no cartão de cada fluxo, um botão **"Enviar para quem falou nas últimas 24h"** que abre uma janela com:

- Lista das pessoas que mandaram mensagem nas últimas 24 horas, mais recentes primeiro, com nome (ou só o número, quando não há cadastro), última mensagem e há quanto tempo.
- Aviso quando alguém já está com um fluxo em andamento ("já está respondendo um cadastro") e quando o cadastro já foi concluído — essas ficam desmarcadas por padrão.
- Busca por nome/número e seleção múltipla, com "selecionar todos".
- Botão de envio mostrando a quantidade: "Enviar para 12 pessoas". Antes de disparar, uma confirmação explicando que cada pessoa recebe a mensagem de abertura e a 1ª pergunta.
- Depois do envio, um resumo: quantas receberam, quantas falharam e o motivo em português.

O botão de teste com número digitado continua existindo.

## Detalhes técnicos

- Nova função de servidor `listFlowEligibleRecipients` em `src/lib/whatsapp-flows.functions.ts` (admin): busca em `inbound_messages` os `from_phone` distintos com `received_at >= now() - 24h`, junta nome/cidade via `contacts` e o estado atual em `whatsapp_flow_sessions` (running/opening/completed). Reaproveita a mesma regra de janela usada em `campaign-audience.server.ts` (`WINDOW_24H_MS`).
- Nova função `startWhatsappFlowForMany` (admin): recebe `flow_id` + lista de telefones (máx. 200 por chamada), normaliza com `normalizePhoneBR`, resolve o contato com `matchInboundContactId` e chama o `startFlowManually` já existente por número, retornando `{ enviados, falhas: [{ phone, motivo }] }`. Sem novo motor: só laço em cima do que já funciona.
- Nova UI `src/components/whatsapp-flows/FlowSendDialog.tsx` (Dialog + busca + checkboxes), usada por `src/routes/_authenticated/fluxos-whatsapp.tsx`.
- Sem mudança de banco de dados.

## Cuidados

- A janela é por pessoa: quem escreveu há 23h pode expirar antes de responder ao fluxo.
- Disparo em massa para quem não pediu contato aumenta risco de bloqueio do número; a janela exibirá esse aviso.
