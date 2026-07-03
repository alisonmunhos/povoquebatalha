## Objetivo
Cada card no módulo Território deve ter um botão persistente para **retornar o contato para "Ainda não abordado"**, sem depender do toast "Desfazer" (que some rápido e não aparece para ações antigas).

## Mudanças

### 1. Backend — `src/lib/territory-logs.functions.ts`
Adicionar server function `resetTerritoryContact({ contactId })`:
- Middleware `requireSupabaseAuth`.
- Deleta **todos** os logs em `territory_contact_logs` do contato (o `last_action` volta a `null` → o contato reaparece como "Ainda não abordado").
- Retorna `{ ok: true, deleted: N }`.

Observação: `undoLastTerritoryLog` continua existindo (desfaz só a última ação, usado pelo toast).

### 2. UI — `src/routes/_authenticated/territorio.tsx`
No card de cada contato (`FieldAction`, dentro do `<li>`):
- Quando o contato já tem `last_action` (ou seja, já foi marcado como "Contato feito", "Não encontrado" ou "Observação"), mostrar um botão discreto **"Voltar para Ainda não abordado"** logo abaixo dos botões principais.
- Ícone `RotateCcw` (lucide-react), estilo texto pequeno / link secundário para não competir visualmente com as ações primárias.
- Confirmação inline via `window.confirm("Voltar este contato para 'Ainda não abordado'? Isso apaga o histórico de campo dele.")`.
- Usa a mutation nova `resetMut` que chama `resetTerritoryContact` e invalida `territory-contacts` + `territory-summary-today`.
- Toast de sucesso: "Contato voltou para 'Ainda não abordado'".

### 3. Texto de ajuda
Atualizar o bloco explicativo no topo da lista (linha ~280) para mencionar:
> "Para trazer um contato de volta para a lista de não abordados, use o botão **Voltar para não abordado** no próprio card."

## Fora do escopo
- Não mexer no fluxo do toast "Desfazer" (mantém como atalho rápido).
- Não alterar o esquema do banco.