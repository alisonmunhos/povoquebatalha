# Quarto botão: "Não quer receber"

Na tela **Minhas Missões**, cada contato da leva ganha um quarto botão, ao lado de "Enviar", "Enviei" e "Não consegui enviar".

## O que o botão faz

Um toque em **"Não quer receber"**:

1. Marca o contato como **recusou contato** (opt-out) com o motivo "Pediu para não receber mensagens (missão: <título>)".
2. **Arquiva** o contato imediatamente, então ele sai da base ativa e não entra em campanhas, missões ou segmentos futuros.
3. Marca a tarefa da missão como **não enviada**, para a leva não ficar pendente por causa dele.
4. Registra a ação no histórico do contato (auditoria), com quem fez e quando.
5. Mostra um aviso na tela: *"<Nome> foi arquivado e não receberá mais mensagens"* com botão **Desfazer** por alguns segundos.

Sem tela de confirmação, conforme escolhido. O **Desfazer** reverte tudo: remove o opt-out, desarquiva o contato e devolve a tarefa para "pendente".

## Visual do card

O contato arquivado por recusa fica com selo vermelho **"Não quer receber"** e os botões de envio desaparecem — evita reabrir o WhatsApp de quem pediu para não ser mais contatado. O contador do cabeçalho da missão passa a mostrar também "X recusou(aram)".

Em telas estreitas os quatro botões ficam em duas linhas, com o botão de recusa em estilo discreto (contorno vermelho) para não competir com "Enviar".

## Detalhes técnicos

- Nova função de servidor `refuseMissionContact` em `src/lib/agitation-missions.functions.ts`, autenticada, recebendo `task_id`:
  - valida que a tarefa pertence ao usuário logado (`assigned_user_id = userId`);
  - só então usa o cliente privilegiado (carregado dentro do handler) para atualizar `contacts.opt_out_at`, `opt_out_motivo`, `arquivado_at`, `whatsapp_status = 'opt_out'` e `lifecycle_status = 'nao_enviar'`, além de gravar em `contact_audit_log` e `agitacao_contact_logs`.
  - Isso é necessário porque a política de acesso atual só permite que agitadores editem contatos que eles mesmos captaram; a validação de posse da tarefa substitui essa checagem com segurança.
- Função irmã `undoRefuseMissionContact` com a mesma validação, limpando `opt_out_at`/`arquivado_at`/motivo e voltando a tarefa para `pending`.
- `src/routes/_authenticated/minhas-missoes.tsx`: novo handler `onRefuseTask`, estado local `refused` para feedback otimista, toast com ação Desfazer (sonner), selo e contador novos. `listMyMissions` passa a trazer `contacts.opt_out_at` e `contacts.arquivado_at` para o selo aparecer também após recarregar a página.
- Nenhuma migration necessária: todos os campos usados já existem.
