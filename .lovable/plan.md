## Objetivo

Hoje, ao selecionar todos os cadastros de um bloco de repetidos, a tela obriga a manter pelo menos um: aparece "Você precisa deixar pelo menos um cadastro" e os botões de excluir ficam desativados. Você quer poder excluir todos, com a chance de cancelar.

## O que muda

**1. Tela de confirmação (`DeleteDuplicatesDialog`)**
- Quando todos os cadastros do bloco estiverem marcados, em vez do bloqueio vermelho aparece um aviso claro: "Nenhum cadastro vai permanecer na base — este bloco de repetidos será apagado por completo."
- Os botões "Excluir definitivamente" e "Tirar da base" ficam habilitados nesse caso.
- Como é uma ação sem volta, adiciono uma caixinha de confirmação: "Entendi que nenhum cadastro será mantido". Sem marcar, o botão de excluir definitivamente continua desativado (o "Tirar da base", que só arquiva, também pede a marcação para manter coerência).
- "Cancelar" continua disponível e sem efeito nenhum.
- Continua bloqueado apenas o caso de contato com acesso ao sistema (esse nunca pode ser excluído por aqui) — nesse caso a mensagem segue explicando o motivo.

**2. Menu do bloco (`duplicidades.tsx`)**
- No menu "Excluir…" incluo a opção "Excluir todos os cadastros deste bloco", que marca todos e já abre a confirmação.
- A opção atual "Excluir todos, menos o sugerido para ficar" permanece.

**3. Regra do servidor (`deleteDuplicateContacts`)**
- Hoje a função recusa quando não sobra ninguém ("Pelo menos um cadastro do grupo precisa ser mantido") e limita `delete_ids` a no máximo 49. Vou permitir apagar o grupo inteiro:
  - aceitar `delete_ids` cobrindo todos os IDs do grupo;
  - remover a exigência de sobrar um;
  - manter a proteção de contatos com acesso ao sistema;
  - manter o registro em auditoria de cada exclusão definitiva (nome, telefone, e-mail, motivo "duplicidade").
- Com o bloco vazio, os pares de duplicidade caem sozinhos (exclusão em cascata) ou são marcados como resolvidos no modo "Tirar da base".

## Detalhes técnicos

- `src/lib/duplicates.functions.ts`: ajustar o schema (`delete_ids` até 50, sem obrigar `remaining >= 1`) e trocar o `throw` por um caminho que trata `remaining.length === 0`.
- `src/components/DeleteDuplicatesDialog.tsx`: novo estado `confirmarTudo`, texto condicional e `invalido` calculado só pelos bloqueados + confirmação.
- `src/routes/_authenticated/duplicidades.tsx`: nova entrada no dropdown de exclusão.
- Ao final, rodar o typecheck.
