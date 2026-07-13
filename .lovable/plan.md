# Plano de correção e aprimoramento — /contatos-bi

Sobre o histórico do GitHub: não tenho acesso direto ao chat do Copilot nem ao repositório privado a partir daqui. Baseei o plano no estado atual do código no projeto Lovable (que reflete o que já foi implementado) e nas pendências que você citou. Se quiser, depois posso puxar commits específicos via conector GitHub.

## 1. Bug: botão "Colunas" duplicado (correção imediata)

Hoje existem **dois** botões "Colunas ▾":
- Um em `src/routes/_authenticated/contatos-bi.tsx` (`columnsOpen` + `ColumnPickerPanel` condicional).
- Outro dentro do próprio `ColumnPickerPanel.tsx` (estado `open` interno adicionado depois).

Resultado: clicar no de fora mostra um card vazio com só o botão de dentro; precisa clicar duas vezes.

Correção: manter **uma** fonte de verdade. Remover o `useState`/botão interno do `ColumnPickerPanel`, deixando o componente puro (recebe `chosen` e renderiza a grade). O controle abrir/fechar fica na rota (`contatos-bi.tsx`, que já tem `columnsOpen`).

## 2. Colunas multi-valor — chips legíveis

Refatorar `src/components/contacts-sheet/Cell.tsx` (e criar sub-componentes em `contacts-sheet/chips/`) para:

- **Tags**: manter chip colorido, mas com padding maior, borda mais suave e truncamento com "+N" após 3 tags (tooltip com o resto).
- **Disponibilidade**: trocar as bolinhas Seg–Dom por **chips "Seg manhã", "Ter tarde"…** agrupados por dia (ex: "Seg: manhã, tarde"). Chips pequenos com cor sutil por turno (manhã/tarde/noite).
- **Formas de ajuda** (array de strings): chips neutros com fundo `muted`, wrap com gap consistente, "+N mais" quando passar de 4.
- **Telefones/compostos** (nome+sobrenome, endereço): manter link para o contato, mas formatar com separador visual (·) em vez de vírgula crua.
- **Status/lifecycle**: badge colorido (verde/âmbar/cinza) usando `phone-labels.ts`.

Cada tipo vira um pequeno componente reusável: `<TagChips />`, `<AvailabilityChips />`, `<ListChips />`, `<StatusBadge />`.

## 3. Cópia formatada — lista simples + agrupada

Ampliar o "Copiar lista formatada" do `BulkActionBar`:

- Trocar o botão por um **menu dropdown** "Copiar ▾" com opções:
  1. **Lista simples** — `Nome — Telefone` (uma por linha) — já existe, manter.
  2. **Agrupado por Cidade** — `## São Paulo\n- Nome — Telefone\n...`
  3. **Agrupado por Tag** — um bloco por tag; contato sem tag entra em "Sem tag".
  4. **Agrupado por Disponibilidade** — por dia da semana (contatos disponíveis Seg, Ter, …).

Implementação:
- Server function nova em `src/lib/crm-bulk.functions.ts`: `copyContactsFormatted({ ids, groupBy })` que retorna string pronta, evitando depender só do que está carregado na página (hoje o `onCopyFormatted` na rota falha silenciosamente para IDs não presentes em `rows`).
- Cliente recebe a string e faz `navigator.clipboard.writeText` + `toast.success` com a contagem.
- Formatos usam markdown leve compatível com WhatsApp (linhas simples, `*negrito*` em cabeçalhos de grupo).

## 4. Refino estético geral

Em `SheetContainer.tsx` e `styles.css`:

- Cabeçalho `sticky` com fundo sólido (`bg-background` + `border-b` + leve sombra) — hoje usa `bg-muted/40` que fica translúcido sobre linhas.
- Zebra rows (`odd:bg-muted/10`) e hover mais evidente.
- Densidade: `py-1.5` nas células, altura mínima consistente, alinhamento vertical no meio.
- Checkbox da seleção com largura fixa e alinhado.
- Ícone de filtro: usar `lucide-react` `Filter` (14px) em vez do SVG inline, com estado ativo destacado (fundo `primary/10`, não só cor).
- Skeleton no loading (3–5 linhas cinza pulsando) em vez de "Carregando…".
- Estado vazio com ilustração/ícone + CTA "Ajustar filtros".
- Footer com paginação real (Anterior/Próxima + seletor de pageSize) — hoje só mostra "Página {n}".
- `BulkActionBar` fixo no rodapé (sticky bottom) quando há seleção, com animação de entrada.

## 5. Ordem de execução sugerida

1. Fix imediato do bug do painel Colunas (item 1).
2. Chips de disponibilidade + formas de ajuda + refino de tags (item 2).
3. Menu "Copiar ▾" com agrupamentos (item 3).
4. Polimento visual (item 4) — última camada, sem mexer em lógica.

## Detalhes técnicos

- Arquivos a editar/criar:
  - `src/components/contacts-sheet/ColumnPickerPanel.tsx` — remover estado interno.
  - `src/components/contacts-sheet/Cell.tsx` — refatorar; extrair chips para `contacts-sheet/chips/`.
  - `src/components/contacts-sheet/chips/{TagChips,AvailabilityChips,ListChips,StatusBadge}.tsx` — novos.
  - `src/components/contacts-sheet/BulkActionBar.tsx` — dropdown "Copiar ▾" (usar `DropdownMenu` do shadcn já instalado).
  - `src/lib/crm-bulk.functions.ts` — `copyContactsFormatted` server function nova.
  - `src/components/contacts-sheet/SheetContainer.tsx` — sticky header, zebra, skeleton, ícone `Filter`, paginação.
  - `src/routes/_authenticated/contatos-bi.tsx` — conectar novo dropdown; paginação anterior/próxima.
- Sem mudança de schema no banco.
- Sem mudança em RLS/permissões.
- Typecheck ao final de cada item.

## Fora do escopo (posso incluir se quiser depois)

- Reordenar colunas por drag-and-drop.
- Congelar coluna de Nome à esquerda.
- Salvar preferências de coluna por usuário no banco (hoje é `localStorage`).
