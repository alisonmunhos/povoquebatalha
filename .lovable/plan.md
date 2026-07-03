## Diagnóstico

O botão **"Não encontrado"** já está funcionando como projetado:

1. Grava o log em `territory_contact_logs` com `action = 'nao_encontrado'`.
2. Invalida a lista e o resumo → o card sai da aba "Ainda não abordado".
3. O contato passa a aparecer no chip de filtro **"Não encontrado"**.

Esse é o comportamento correto — não há bug a corrigir.

## Melhoria opcional sugerida (polimento de UX)

Como o card **some da tela** logo após o clique, o usuário pode achar que "sumiu por engano". Sugiro adicionar:

- **Toast com "Desfazer"** (5s): permite reverter a última ação registrada sem precisar ir até o filtro.
- **Contador visível nos chips de filtro** já existe — apenas confirmar que atualiza imediatamente.
- **Texto de ajuda** no topo da aba Ação de Campo: *"Contatos marcados saem desta lista e podem ser vistos nos filtros abaixo."*

### Detalhes técnicos

- Novo server fn `undoLastTerritoryLog({ contactId })` que deleta o log mais recente do usuário para aquele contato (últimos 60s).
- `toast.success("Marcado como não encontrado", { action: { label: "Desfazer", onClick: () => undoMut.mutate(...) } })`.
- Reinvalidar `["territory-contacts"]` e `["territory-summary-today"]` após desfazer.

Confirma se quer que eu implemente esse polimento, ou prefere deixar como está?