# O robô não continuou depois do seu nome: o número tinha um "9" a mais

## O que aconteceu (confirmado nos dados)

Ao disparar o fluxo manualmente, a sessão foi gravada com o número no formato do sistema:
`5551998902337` (com o nono dígito).

Quando você respondeu no WhatsApp, a Meta entregou a mensagem com o número no formato dela:
`555198902337` (sem o nono dígito).

O motor de fluxos procura a sessão em aberto com comparação exata do número. Como os dois
formatos são diferentes, ele não encontrou nenhuma sessão, não gravou sua resposta e não
mandou a pergunta seguinte. Sua resposta "Alison Acosta Munhos" está registrada no Inbox, e
a sessão continua parada na etapa 1 com respostas vazias — exatamente o sintoma.

O teste do Gelson funcionou porque ali o fluxo começou pela mensagem recebida (número já no
formato da Meta), então os dois lados batiam.

## Correção

1. **Comparar números pelos 8 últimos dígitos** em todo o motor de fluxos (busca de sessão em
   aberto, checagem de primeiro contato, vínculo de histórico e status de conversa), em vez de
   exigir formato idêntico. É a mesma regra já usada com sucesso na identificação de contatos
   recebidos.
2. **Guardar o número que a Meta reconhece.** No disparo manual, a resposta de envio da Meta
   traz o `wa_id` (número real do WhatsApp). Ao receber, a sessão passa a gravar esse número,
   então da segunda mensagem em diante a comparação é exata.
3. **Evitar sessões duplicadas** do mesmo contato em formatos diferentes: ao abrir uma nova
   sessão, encerrar as anteriores em aberto do mesmo número (considerando as duas formas).
4. **Retomar seu teste atual:** a sessão parada segue válida por 24h; depois da correção, sua
   próxima mensagem cai na etapa certa. Se preferir começar do zero, é só disparar de novo.

## Detalhes técnicos

- `src/lib/whatsapp-flow.server.ts`: helper local de comparação por últimos 8 dígitos; trocar
  os `.eq("phone", phone)` / `.eq("from_phone", phone)` por filtro `like %last8` (sessões,
  `inbound_messages`, `direct_messages`, `conversations`); ao localizar sessão por variante,
  atualizar `whatsapp_flow_sessions.phone` com o número recebido.
- `startWhatsappFlowManually` / disparo em lote: usar o `waId` já devolvido por
  `sendFlowMessage` (client da Cloud API retorna `waId`) para gravar a sessão com o número
  canônico da Meta.
- Sem migração de banco necessária; nenhuma coluna nova. Nada muda nos templates aprovados.
