## Objetivo

Poder excluir um cadastro repetido direto no card, sem precisar abrir a unificação. Quando o grupo ficar com apenas um cadastro, ele sai da fila automaticamente e o contato restante é mantido.

## Como vai funcionar na tela

Em cada card de contato dentro do bloco de repetidos:

- Uma caixinha de seleção no canto do card (para escolher vários).
- Um botão discreto de lixeira no card (excluir só aquele).

Na barra de ações do bloco (junto de "Unificar cadastros"):

- Quando houver cards marcados: "Excluir selecionados (N)".
- Sempre disponível: menu "Excluir…" com a opção "Excluir todos deste bloco menos o sugerido para ficar" (mantém o cadastro mais completo, exclui os demais).

Só administradores veem essas ações — igual às outras decisões da tela.

## Confirmação (sem digitar nada)

Um único diálogo mostrando: nomes/telefones dos cadastros que serão excluídos, quantos serão excluídos, qual permanece, e o aviso de que o histórico, mensagens e tags daquele cadastro serão perdidos (diferente da unificação, que transfere tudo).

O diálogo terá duas opções de ação:
- **Excluir definitivamente** (apaga do banco, registrando em auditoria).
- **Tirar da base** (arquiva, preserva histórico) — alternativa segura.

Bloqueios de segurança:
- Não é permitido excluir todos os cadastros de um bloco — pelo menos um sempre fica. Se a seleção incluir todos, a interface avisa e obriga a deixar um.
- Cadastro que é usuário do sistema não pode ser excluído por aqui; o card mostra o motivo e a opção fica desabilitada (recomendação: unificar).

## Depois da exclusão

- Se sobrar 1 cadastro: os pares do bloco são marcados como resolvidos e o bloco some da fila "Para revisar".
- Se sobrarem 2 ou mais: o bloco continua na fila, apenas com os pares que ainda envolvem cadastros existentes — segue possível unificar.
- Mensagem de retorno com quantos foram excluídos e o que permanece.

## Detalhes técnicos

- Nova função de servidor `deleteDuplicateContacts` em `src/lib/duplicates.functions.ts`:
  - exige admin (`requireAdmin`);
  - recebe `group_key`, `pair_ids`, `delete_ids`, `mode: "hard" | "arquivar"`;
  - valida que ao menos um contato do grupo permanece e que nenhum `is_system_user` está na lista;
  - grava auditoria por contato (reaproveitando o padrão de `auditHardDelete` em `contacts.functions.ts`, extraído para um helper compartilhado);
  - exclui (ou arquiva) e, na sequência, atualiza `contact_duplicates`: pares que envolvem contatos excluídos ficam `status = 'separados'`/resolvidos; se restar só um contato no grupo, todos os pares do grupo são resolvidos.
  - Observação: se as linhas de `contact_duplicates` já caem por `on delete cascade`, o passo de atualização só cobre os pares remanescentes — confirmo isso na implementação consultando a definição da tabela.
- UI em `src/routes/_authenticated/duplicidades.tsx`: estado local de seleção por bloco, botão de lixeira no card, e um novo componente `DeleteDuplicatesDialog` em `src/components/` com o resumo e as duas ações.
- Invalidação de `dup-groups` e `dup-counts` após a operação.
- Ao final: typecheck.
