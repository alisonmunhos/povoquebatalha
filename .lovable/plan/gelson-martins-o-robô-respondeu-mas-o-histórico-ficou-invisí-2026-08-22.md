# Gelson Martins: o robô respondeu, mas o histórico ficou invisível

## O que os dados mostram

- 19:51:01 — Gelson (55 51 99414-0520) mandou a primeira mensagem ("...gostaria de saber como faço pra trabalhar na campanha...").
- 19:51:06 — o fluxo **FAÇA PARTE DA NOSSA CAMPANHA!** disparou (gatilho "primeira mensagem") e enviou 2 mensagens. A Meta confirmou **sent** e **delivered** para as duas.
- A sessão do fluxo está `running` no passo 0, com `contact_id` vazio, e ele ainda não respondeu nenhuma pergunta.
- O contato "Gelson Martins" só foi criado às 20:00 (depois do disparo).

Conclusão: ele **recebeu** a abertura e a 1ª pergunta no WhatsApp. O que falhou é a visibilidade: como o contato ainda não existia às 19:51, as mensagens do robô não foram gravadas no histórico (a tabela de mensagens enviadas exige contato vinculado), então no Inbox a conversa aparece só com a mensagem dele — dando a impressão de que o fluxo não rodou.

Efeito colateral: a sessão continua sem contato vinculado, então mesmo as próximas respostas dele seguiriam sem histórico no Inbox.

## O que vou corrigir

1. **Gravar sempre as mensagens do robô**, mesmo sem contato ainda cadastrado, identificando pelo número. Elas passam a aparecer no Inbox em conversas de números desconhecidos, exatamente como as mensagens recebidas.
2. **Vincular o histórico quando o contato nascer**: ao concluir o cadastro pelo chat (ou ao vincular a conversa a um contato na mão), as mensagens antigas daquele número passam a pertencer ao contato — sem perder nada.
3. **Amarrar a sessão do fluxo ao contato** assim que ele existir, para que o restante da conversa já entre com histórico.
4. **Corrigir o caso do Gelson**: ligar a sessão em aberto e as mensagens do robô ao contato criado às 20:00, para a conversa ficar completa.
5. **Sinal claro no Inbox**: etiqueta "Cadastro pelo chat" nas mensagens do robô e, no cartão do fluxo, mostrar em que passo a pessoa parou.

## Detalhes técnicos

- Migração: `direct_messages.contact_id` passa a aceitar nulo e ganha coluna `to_phone` (texto, indexada). Grants e RLS ajustados no mesmo estilo das políticas atuais (equipe/`inbox_access`); nenhum dado é apagado.
- `src/lib/whatsapp-flow.server.ts`: `sendFlowMessage` grava em `direct_messages` sempre (com `to_phone` quando não há contato); ao criar/achar o contato no fim do fluxo, atualiza `whatsapp_flow_sessions.contact_id` e faz `update` das mensagens daquele telefone.
- `src/lib/communication.functions.ts`: a busca da timeline por `from_phone` passa a incluir `direct_messages` por `to_phone`; a vinculação manual de conversa também reassocia `direct_messages` pendentes.
- Correção pontual do Gelson via SQL de atualização (sem exclusões).
