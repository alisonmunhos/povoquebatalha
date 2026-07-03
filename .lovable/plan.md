## Diagnóstico

- Hoje o card mostra apenas `la?.note` (a última observação) e um chip azul com data/hora que não abre nada — daí a sensação de "só aparece a última".
- Os dados já existem completos em `territory_contact_logs` (uma linha por ação, com `note` opcional). Só falta uma UI para navegar por eles.

## O que vou construir

### 1. Drawer lateral "Histórico do contato"

Componente `TerritoryContactLogDrawer` (usa `Sheet` do shadcn, lado direito, `sm:max-w-md`).

Aberto ao clicar em qualquer lugar do card do contato — **exceto** nos botões de ação, no link "Voltar para…", no toggle de observação e no textarea (usar `stopPropagation` neles). O chip azul de "Última obs." também abre o drawer.

Header do drawer:
- Nome do contato + telefone + cidade/bairro.
- Contador: "12 registros · 3 pendentes".
- Toggle "Mostrar ocultas".

Corpo: timeline vertical de cards, do mais recente para o mais antigo. Cada card mostra:
- Ícone + rótulo da ação (WhatsApp aberto / Contato feito / Não encontrado / Pediu atualização / Observação), na cor semântica já usada no card.
- Data/hora relativa ("há 2h") + absoluta em tooltip.
- Autor (nome do perfil que registrou).
- Texto da nota, quando houver.
- Selo de status: **Pendente** (âmbar) ou **Concluído** (verde) — só aparece nas ações que fazem sentido como follow-up: `observacao` e `pediu_atualizacao`. As ações mecânicas (`whatsapp_aberto`, `contato_realizado`, `nao_encontrado`) não têm selo.
- Menu "⋯" com: Marcar como pendente / Marcar como concluído / Ocultar / (se oculto) Reexibir.

### 2. Schema — adicionar 3 colunas em `territory_contact_logs`

```sql
ALTER TABLE public.territory_contact_logs
  ADD COLUMN follow_up_status text
    CHECK (follow_up_status IN ('pendente','concluido')),
  ADD COLUMN hidden_at timestamptz,
  ADD COLUMN hidden_by uuid REFERENCES auth.users(id);

CREATE INDEX territory_contact_logs_contact_created_idx
  ON public.territory_contact_logs (contact_id, created_at DESC);
```

Adicionar policy de UPDATE (hoje só existe INSERT/SELECT/DELETE):

```sql
CREATE POLICY tcl_update_own_or_staff
ON public.territory_contact_logs
FOR UPDATE TO authenticated
USING (user_id = auth.uid()
   OR private.has_role(auth.uid(),'admin')
   OR private.has_role(auth.uid(),'operador')
   OR private.has_role(auth.uid(),'vrm')
   OR private.has_role(auth.uid(),'territorio'))
WITH CHECK (true);
```

### 3. Server functions novas em `src/lib/territory-logs.functions.ts`

- `listContactTerritoryLogs` (já existe) — estender para incluir `follow_up_status`, `hidden_at`, `hidden_by` e trazer `profiles.full_name` do autor via join.
- `setTerritoryLogFollowUp({ logId, status: 'pendente'|'concluido'|null })`
- `setTerritoryLogHidden({ logId, hidden: boolean })`

Todas com `requireSupabaseAuth`. RLS já cuida de "só o dono ou staff".

### 4. Selo persistente no card do território

O card em `/territorio` continua compacto. Além do já existente "Última obs.", adicionar um pequeno badge quando houver observações pendentes: **"2 pendentes"** (âmbar, clicável, abre o drawer). Assim o usuário vê no relance quem tem follow-up aberto sem precisar abrir.

### 5. Contador na aba "Ação de Campo"

Reaproveitar `listContactTerritoryLogs` agregado para exibir, no header da aba, "X observações pendentes na sua fila" — útil como próxima entrega, mas fora do escopo desta etapa se você preferir. Vou **deixar preparado** o campo no retorno, sem construir a fila ainda (foi o que você respondeu: só marcar visualmente por enquanto).

## Detalhes técnicos

- Estado do drawer: `useState<contactId | null>` no `TerritoryFieldView`.
- Query key: `["territory-contact-logs", contactId, { showHidden }]`. Invalidar após mutations de follow-up/hidden, e também invalidar `["territory-contacts"]` para atualizar o badge "N pendentes".
- Datas: `date-fns` com locale `ptBR` (já usado no projeto).
- Ocultas: filtro no client por padrão (`hidden_at IS NULL`); toggle mostra todas e as ocultas ficam com opacidade reduzida.
- Acessibilidade: card do contato vira `role="button"` com `tabIndex=0` + Enter/Space abre o drawer.

## Cuidados

- Nenhuma migration destrutiva; colunas novas são nullable.
- Não altera as ações já existentes nem o botão "Voltar para 'Ainda não abordado'".
- Não expande o card visualmente — todo o histórico fica no drawer.
- O chip azul "Última obs. · dd/mm" passa a ser clicável (abre o drawer no mesmo contato).

## Onde testar

1. `/territorio` → aba **Ação de Campo**.
2. Clicar em qualquer card (ou no chip azul de observação) → drawer abre com timeline completa.
3. Em uma entrada de Observação, usar o menu "⋯" → Marcar como pendente / concluído / ocultar.
4. Ativar "Mostrar ocultas" no header do drawer para reexibir.
5. Fechar o drawer e verificar o badge "N pendentes" no card.
