# Evolução do Inbox: histórico confiável, não lidas de verdade e operação diária

## Diagnóstico (verificado no banco agora)

**1. Conversas partidas ao meio por causa do 9º dígito.**
O contato "Alison Acosta Munhos" tem telefone `+5551998902337`. As mensagens dele chegaram como `555198902337` (sem o 9). Resultado: 33 mensagens ficaram sem contato vinculado, **18 delas não lidas** — e nenhuma aparece no Inbox, porque a conversa dele é aberta pelo contato e busca só as mensagens já vinculadas. No total, **43 mensagens sem vínculo têm contato correspondente** (mesmo número final), espalhadas por **9 pessoas**. Essas mensagens hoje estão invisíveis.

**2. "Não lidas" está sempre zerado.**
Todas as 260 conversas têm contador de não lidas = 0, mesmo existindo 18 mensagens não lidas no banco. Existem duas fontes de verdade (o contador da conversa e a marca de leitura de cada mensagem) e elas divergiram. O chip "Não lidas" hoje é decorativo.

**3. Só as 500 conversas mais recentes existem para o Inbox.**
A lista carrega no máximo 500 conversas e a busca por nome/telefone é aplicada apenas sobre o que já foi carregado. Com 260 conversas ainda funciona; a busca já não alcança conversas resolvidas quando o filtro é outro. Não há rolagem infinita.

**4. Filtros com pouco significado prático.**
- "Aguardando": 1 conversa em 260. Nada no sistema move para esse estado — depende de alguém marcar à mão.
- "Resolvidas": 0 conversas. Ninguém resolve, então "Em aberto" = tudo (259).
- "Sinalizadas": 1.
- Não existe filtro para o que o operador realmente precisa: "sem responsável", "com erro de envio", "fora da janela de 24h", "não vinculadas ao CRM" (24 conversas) — parte disso existe no servidor mas não está exposta na tela.

**5. Contagens dos chips só aparecem no chip ativo**, então o operador não vê onde tem trabalho acumulado sem clicar em cada filtro.

**6. Sem atalhos de operação.** Não há marcar como não lida, arquivar, resolver+próxima, navegação por teclado, nem indicação de quem está atendendo direto na lista (existe o selo de responsável, mas nada de "em atendimento por mim").

## Plano de ação

### P0 — Histórico e não lidas confiáveis (base de tudo)

1. **Casar mensagens órfãs com o contato certo.** Migration que vincula mensagens sem contato ao contato cujo telefone termina igual (mesmo número final, tolerando 9º dígito e DDI), registrando o vínculo em auditoria. Nada é apagado.
2. **Impedir que volte a acontecer**: no recebimento, procurar o contato por número normalizado *e* por número final antes de gravar sem vínculo.
3. **Ao abrir a conversa, buscar por contato E pelos telefones equivalentes**, para que histórico antigo apareça mesmo se algum registro escapar do vínculo.
4. **Uma só fonte de verdade para não lidas**: contador da conversa recalculado a partir das mensagens, com correção retroativa das 260 conversas. Marcar como lida passa a limpar as duas pontas sempre.
5. **Marcar como não lida** (ação manual), para o operador poder "guardar para depois" sem perder o item.

### P1 — Lista que mostra onde está o trabalho

6. Contagem em **todos** os chips, não só no ativo, com atualização em tempo real.
7. Novos filtros úteis, já suportados no servidor: **Sem responsável**, **Minhas**, **Com erro de envio**, **Não vinculadas ao CRM**.
8. **Busca no servidor** (nome, telefone, conteúdo da mensagem) atravessando todos os status, com rolagem infinita em vez do teto de 500.
9. Cada linha da conversa mostra: quem está atendendo, se está fora da janela de 24h, se houve erro no último envio, e se ainda não está no CRM.

### P2 — Produtividade no atendimento

10. **Resolver e ir para a próxima** em um clique; atalhos de teclado (próxima/anterior, responder, resolver, sinalizar).
11. **"Aguardando" automático**: ao responder, a conversa passa a aguardando; ao chegar resposta da pessoa, volta para aberta. O estado deixa de ser manual e os filtros passam a significar algo.
12. Composer: indicar claramente quando a janela de 24h fechou e oferecer template oficial no lugar do texto livre.

### P3 — Integração com o CRM

13. Painel do contato ao lado da conversa com o essencial (cidade/bairro, origem, etiquetas, últimas ações) e ação de completar cadastro sem sair do Inbox.
14. Conversa não vinculada mostra sugestão de contato provável (mesmo número final) com um clique para vincular.

## Detalhes técnicos

- Migration de reconciliação: `update inbound_messages set contact_id = ...` usando `public.phone_last8`, restrita a casos com exatamente um contato correspondente; recálculo de `conversations.unread_count` e `last_message_at`; log em `contact_audit_log`.
- `src/lib/inbound-message-parse.server.ts` / webhooks (`whatsapp-cloud/webhook.ts`, `zapi/$evento.ts`): resolução de contato por `phone_last8` como fallback antes de gravar órfã.
- `src/lib/communication.functions.ts`: `getConversation` busca inbound por `contact_id` **ou** telefones equivalentes; `listConversations` ganha paginação por cursor (`last_message_at`), busca server-side com `ilike`/trigram e retorno de contagens agregadas por filtro; novas funções `markConversationUnread` e `resolveAndNext`.
- Contador de não lidas: função SQL de recálculo + ajuste dos triggers `conv_sync_from_*` para manter `unread_count` coerente com `read_at`.
- `src/components/CommunicationInbox.tsx`: chips com contagens agregadas, novos filtros, rolagem infinita, atalhos de teclado, badges de janela/erro/CRM na linha, ação "não lida".
- Automação de status: ao inserir em `direct_messages` (origem inbox) → `aguardando`; ao inserir inbound → `aberta`, dentro dos triggers já existentes.
- RLS e permissões atuais (staff ou `profiles.inbox_access`) preservadas; nenhuma exclusão de dados.
