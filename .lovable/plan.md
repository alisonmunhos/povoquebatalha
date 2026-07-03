## Para onde vão as informações hoje

Cada clique em **Abrir WhatsApp**, **Contato feito**, **Não encontrado** ou **Observação** insere uma linha na tabela `territory_contact_logs` (colunas: `user_id`, `contact_id`, `action`, `note`, `created_at`). Ou seja: o dado é gravado, mas hoje ele **não aparece em lugar nenhum** — nem na própria lista de Ação de Campo, nem no CRM, nem em filtros. Por isso parece que o botão "não faz nada".

## O que vou fazer

Transformar essas ações em sinal útil, em três frentes — sem mudar o schema.

### 1. Feedback imediato ao clicar (aba Ação de Campo)

- Toast de sucesso/erro em cada ação (`sonner`).
- Botão fica desabilitado com "Registrando…" enquanto a mutation está pendente (evita clique duplo).
- O card ganha, na hora, um **selo persistente** com o último status desta visita: "✓ Contato feito 14:32" ou "Não encontrado 14:35" — assim o agente em campo sabe que o registro foi salvo.
- O selo também aparece automaticamente com base no log mais recente do contato (não só na sessão atual), para quando outra pessoa já tiver passado por ele.

### 2. Filtros e ordenação na lista de Ação de Campo

Barra de filtros acima da lista de contatos:

- **Status de abordagem** (multi-select): "Ainda não abordado", "Contato feito", "Não encontrado", "Com observação".
- **Período**: hoje / últimos 7 dias / todos.
- **Ordenar por**: mais recentes primeiro / não abordados primeiro (padrão) / alfabético.
- Contagem em cada opção ("Não encontrado (12)").

O objetivo é que o agente consiga, por exemplo, "esconder quem já foi contatado hoje" ou "revisitar os não encontrados da semana".

### 3. Visibilidade no CRM (aba Contatos)

- Nova **coluna opcional** "Última ação de campo" mostrando ícone + rótulo + data (ex.: "Contato feito · há 2h").
- Novo **filtro no CRM**: "Ação de campo" com as mesmas opções acima, para segmentar quem já foi visitado.
- Na **timeline do perfil do contato**, os eventos de campo passam a aparecer junto com os demais (importação, mensagens, etc.), com autor e observação.

### 4. Alertas leves (sem barulho)

- Um pequeno **contador no menu lateral** de Território: "3 não encontrados hoje" quando aplicável.
- No topo da Ação de Campo, um card resumo do dia do usuário logado: "Hoje você abordou 12 · fez contato com 8 · não encontrou 3 · deixou 2 observações".

## Fora do escopo

- Não altero `territory_contact_logs` nem `logTerritoryAction`.
- Não crio notificações por WhatsApp/e-mail — só alertas visuais dentro do app.
- Não mudo RLS.
- Não mexo na aba **Mapa**.

## Detalhes técnicos

- Novo server fn `getContactsLastFieldAction({ contactIds })` retornando `{ contact_id, action, note, created_at, user_id }` com base em `territory_contact_logs`, usando `distinct on (contact_id)` ordenado por `created_at desc`. Consumido tanto na lista de campo quanto no CRM.
- `listTerritoryContacts` recebe novos filtros opcionais (`fieldStatus[]`, `sinceDays`, `sortBy`) resolvidos via join lateral com o log mais recente.
- `logTerritoryAction` continua igual; o `onSuccess` da mutation já invalida `territory-contacts` — vou incluir também as queries do CRM (`contacts` list) para refletir o selo lá.
- Coluna e filtro no CRM adicionados como opt-in em `ColumnSettings` para não poluir a tabela padrão.
