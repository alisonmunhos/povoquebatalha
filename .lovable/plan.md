## Problema

Nos menus suspensos de filtro (Gestão da Base), cada clique numa opção aplica o filtro na hora. Isso re-renderiza a tela inteira embaixo do menu; o popover é reposicionado e o foco volta para o gatilho, o que faz a página rolar para o topo. O usuário precisa rolar de volta para marcar a próxima opção.

## Solução

Trocar o comportamento "aplica a cada clique" por "rascunho + Aplicar", e travar o foco/rolagem do popover.

### 1. Rascunho local no menu (`src/components/MultiSelectFilter.tsx`)

- Ao abrir, o componente copia a seleção atual para um estado interno (rascunho).
- Marcar/desmarcar opções altera só o rascunho — nada é aplicado, nenhuma consulta é disparada, a tela de baixo não re-renderiza.
- Rodapé fixo no menu com:
  - **Aplicar** (mostra quantos itens ficarão selecionados) — envia a seleção e fecha;
  - **Limpar** — zera o rascunho;
  - **Cancelar** — fecha descartando alterações.
- Contador de selecionados no cabeçalho do menu e "Selecionar todos" (respeitando o texto de busca ativo).
- Fechar clicando fora = cancelar (comportamento previsível, sem aplicar por acidente).

### 2. Impedir o pulo de tela

- No conteúdo do popover, cancelar o foco automático de abertura/fechamento (`onOpenAutoFocus` / `onCloseAutoFocus`), enviando o foco para o campo de busca dentro do menu em vez do gatilho.
- Manter a lista interna com rolagem própria e altura máxima, para que rolar dentro do menu nunca role a página.
- Em telas de celular, abrir o menu como painel inferior (bottom sheet) ocupando altura fixa, com o mesmo rodapé Aplicar/Limpar/Cancelar — evita o menu "fugir" da tela.

### 3. Mesmo padrão nos outros pontos

- `SingleSelectFilter` (mesmo arquivo): manter aplicação imediata (é 1 clique e fecha), mas aplicar as mesmas travas de foco.
- `src/components/ColumnFilterHeader.tsx` (filtros por coluna): mesmo rascunho + Aplicar/Cancelar, para o comportamento ser igual em toda a Gestão da Base.
- `src/components/contacts-sheet/ColumnFilterPopover.tsx` já tem Aplicar/Limpar/Cancelar — só receberá o ajuste de foco/rolagem.

### 4. Barra de filtros ativos

Sem mudança de lógica: os chips continuam refletindo o que foi aplicado. Como agora só aplica no botão, os chips param de "piscar" a cada clique.

## Detalhes técnicos

- Estado do rascunho sincronizado por `useEffect` no evento de abertura (`open === true`), não a cada render, para não sobrescrever a edição em andamento.
- `PopoverContent` com `modal` e `onOpenAutoFocus={(e) => e.preventDefault()}` + foco programático no `CommandInput`; `onCloseAutoFocus={(e) => e.preventDefault()}` para não devolver foco ao gatilho fora da viewport.
- Sem alteração em `crm-filters.ts`, nas funções de servidor ou na URL: a assinatura `onChange(string[])` continua a mesma, só passa a ser chamada uma vez, no Aplicar.
- Mobile detectado com o hook existente `useIsMobile`.

## Verificação

- Typecheck.
- Teste no preview em viewport de celular: abrir "Cidade", marcar 3 opções seguidas sem a página rolar, aplicar, conferir chips e contagem da tabela.
