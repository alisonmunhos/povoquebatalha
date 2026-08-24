# Janela de 24h no Inbox: ver quem dá pra responder agora

## O que existe hoje (verificado)

- A tabela `conversations` **não guarda** quando a pessoa escreveu por último. Só existe `last_message_at` (última mensagem de qualquer lado). A janela de 24h hoje é calculada **dentro da conversa aberta**, olhando as mensagens carregadas (`CommunicationInbox`, "Só é possível iniciar o fluxo até 24h depois da última mensagem da pessoa"). Na **lista** não existe nenhuma informação de janela.
- Filtros atuais na tela: Não lidas, Em aberto, Aguardando, Resolvidas, Sinalizadas. O servidor já suporta outros que não estão expostos: `mine` (minhas), `in_service`, `unlinked`, `with_error`, `opt_out`.
- Ou seja: **não existe hoje um jeito fácil de o usuário ver "as minhas conversas"** — o filtro existe no servidor mas não tem chip na tela.
- Só 74 conversas têm mensagem recebida; nenhuma está dentro da janela de 24h neste momento (manhã de segunda), então a tela precisa deixar claro quando a lista de "Chat disponível" está vazia por motivo legítimo.

## O que vai ser feito

### 1. Guardar a hora da última mensagem da pessoa

Nova coluna `last_inbound_at` em `conversations`, preenchida retroativamente a partir do histórico e mantida pelos gatilhos que já sincronizam a conversa quando chega mensagem. Com isso a janela passa a ser consultável na lista, sem abrir cada conversa.

### 2. Novos filtros (chips)

- **Chat disponível** — dentro da janela de 24h, independente de estar atribuído, lido ou aguardando. É a lista de quem dá pra responder com texto livre agora.
- **Minhas** — conversas atribuídas a mim (hoje só existe no servidor).
- **Minhas na janela** — cruzamento dos dois: o que eu preciso responder antes de fechar.
- **Expirando** — janela fecha em menos de 4 horas. Fila de urgência.

Todos com contagem no chip, como os atuais. Os já existentes continuam iguais.

### 3. Sinal de janela em cada linha e no composer

- Na linha da conversa: selo verde "24h · faltam 3h" quando aberta; selo cinza "fora da janela" quando fechada.
- No topo da conversa aberta: faixa com o tempo restante, e quando fechada, aviso claro de que texto livre não chega, com atalho para enviar um template aprovado ou iniciar um fluxo.
- Ordenação opcional da lista por "janela fechando primeiro" quando o filtro é Chat disponível ou Expirando.

### 4. Evitar mensagem que não chega

O envio já falha e mostra o motivo. A mudança é preventiva: com a janela fechada, o campo de texto fica desabilitado com explicação e os dois caminhos válidos em destaque (template oficial / fluxo). Nada de bloqueio silencioso.

## Estratégias para manter a conversa viva

Proposta em três camadas, da mais simples para a mais automática:

1. **Aviso ao responsável (in-app + push)** — quando faltam ~4h para fechar a janela de uma conversa atribuída a você com a última palavra sendo da pessoa, você recebe uma notificação "Responda o Fulano antes de 14:20". Usa a estrutura de notificações e push que já existe no app.
2. **Resumo de plantão** — uma vez ao dia (e opcionalmente a cada 4h no horário comercial), quem tem acesso ao Inbox recebe "3 conversas na janela, 1 expirando". Roda como tarefa agendada, no mesmo padrão dos jobs já existentes.
3. **Resposta automática de acolhimento** — quando chega a primeira mensagem de alguém sem responsável, o robô responde na hora (isso reabre/renova a janela e evita a pessoa achar que caiu no vazio). Já existe estrutura de auto-resposta e de fluxos; aqui é só ligar com regra clara e limite de 1 por conversa por dia.
4. **Reengajamento fora da janela** — para quem já saiu da janela, template oficial "posso te ajudar com algo?" em lote controlado, que reabre a janela quando a pessoa responde. Precisa de template aprovado na Meta.

Sugiro implementar agora os itens **1, 2 e 4** como ganchos, e o item 3 depois de você definir o texto da acolhida.

## Detalhes técnicos

- Migration: `alter table public.conversations add column last_inbound_at timestamptz`; backfill via `max(received_at)` de `inbound_messages` casado por `contact_id` e por `from_phone`; índice `(last_inbound_at desc)`; atualização das funções de gatilho `conv_sync_from_inbound` / `conv_open_on_inbound` para gravar `last_inbound_at`. Nenhum dado apagado.
- `src/lib/communication.functions.ts`: novos valores no enum de `filter` (`window_open`, `window_expiring`, `mine_window`) com predicados sobre `last_inbound_at`; `mine` já existe; `counts` ganha as novas chaves; retorno da lista passa a incluir `last_inbound_at` para a UI calcular o tempo restante.
- `src/components/CommunicationInbox.tsx`: novos itens em `STATUS_FILTERS` com dica de texto; selo de janela em `ConversationRow`; faixa de janela no cabeçalho da conversa; composer desabilitado com CTA de template/fluxo quando fechada.
- Notificações: helper novo em `src/lib/inbox-window-notify.server.ts` (aviso de janela expirando e resumo de plantão), disparado por rota `src/routes/api/public/jobs/inbox-window-reminders.ts` agendada por cron, no mesmo padrão de `release-stalled-missions`.
- Permissões atuais (staff ou `profiles.inbox_access`) preservadas; nenhuma mudança de RLS além da nova coluna.
