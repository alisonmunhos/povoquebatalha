
## Diagnóstico (verificado no banco e no código)

**Formulário testado:** FORMS TESTE (`/f/forms-teste`), 5 seções. Na Seção 2 há a pergunta customizada single_choice `QUAL SEÇÃO VOCÊ QUER IR?` com 3 alternativas (`opcao-1/2/3`) que deveriam ir para as Seções 3, 4 e 5.

Consulta em `form_question_branch_rules` → **0 linhas** para esse formulário. Ou seja, as regras que aparecem no construtor **não estão sendo persistidas**. As seções tampouco têm `default_next_section_id` além da Seção 1→Seção 2, então quando não há regra o fluxo termina em qualquer seção após a 2.

### Causa raiz da ramificação silenciosa
Em `SectionedQuestionsPanel.saveSection()`:

1. `upsertFormQuestions` grava as perguntas.
2. O painel refaz um `getFormDefinition` e monta `questionIdByClientKey` casando perguntas locais com as salvas por `(section_id, order_index, source, catalog_field_key, label)`.
3. Regras cujo `questionClientKey` **não** está no mapa são **descartadas silenciosamente** (`.filter((r) => questionIdByClientKey.has(r.questionClientKey))`).
4. `upsertBranchRules` então recebe `rules: []` e como já deleta tudo com base em `questionIds`, **apaga qualquer regra existente**.

Quando o casamento por rótulo falha (espaços, acento, edição após criar a pergunta, ordem recalculada por `reindex`), o usuário vê as regras no construtor mas o banco fica vazio — exatamente o cenário atual.

### Confusão da tela de sucesso
Cada seção mostra hoje **dois blocos separados** (confirmação automática, botão WhatsApp) + um bloco "padrões do formulário" + regras tri-state (default/on/off). O usuário só quer, por seção: “usa confirmação? usa botão de WhatsApp? qual o número/mensagem desse botão?”. Não existe campo para número por seção — hoje o número vem só do formulário global.

## Plano de ação

### 1. Persistir ramificações de forma segura (bug crítico)

Reescrever a etapa de mapeamento em `SectionedQuestionsPanel.saveSection`:

- Enviar `client_key` junto de cada pergunta no payload de `upsertFormQuestions` e devolver, no retorno do server function, um mapa `{ client_key → question_id }`. Isso elimina o casamento heurístico por `(section_id, order_index, label)`.
- Se qualquer regra referenciar uma `questionClientKey` sem correspondência após o upsert, **abortar com toast** em vez de descartar silenciosamente.
- Ajustar `upsertFormQuestions` (`src/lib/form-definitions.functions.ts`) para aceitar `client_key` opcional e retornar `{ id, client_key }[]`.
- Consequência: a Seção 2 do FORMS TESTE, ao clicar "Salvar seção" de novo, gravará as 3 linhas em `form_question_branch_rules` e o runtime (`resolveNextSectionId`) fará a bifurcação corretamente.

Verificação pós-fix:
1. Abrir `/entrada-dados/6c4f2e0b…`, apertar "Salvar seção" sem mexer em nada.
2. `SELECT * FROM form_question_branch_rules WHERE question_id = '037b63b4-548e-42d7-b440-fab47b603424'` deve retornar 3 linhas.
3. Testar `/f/forms-teste` respondendo cada opção e confirmar que pula para a seção correta.

### 2. Simplificar “Tela de sucesso” por seção

Reorganizar o bloco final do painel da seção em um único cartão “O que aparece quando o formulário termina nesta etapa”, com:

- **Toggle único** “Mostrar tela de confirmação” (default = padrão do formulário; explicitar em texto o valor atual).
- **Toggle único** “Mostrar botão Avisar no WhatsApp”.
  - Quando ligado, expor **3 campos por seção**:
    - Número de WhatsApp desta etapa (default = número dos padrões do formulário; deixar vazio = usar padrão).
    - Mensagem do botão (já existe).
    - Ordem na tela (WhatsApp primeiro / Confirmação primeiro), só se ambos ligados.
- Remover o bloco duplicado azul “Padrão geral do formulário” dentro da seção — substituir por microcopy contextual junto de cada toggle (“Padrão: ligado”, “Padrão: desligado”).
- Todo o cartão só aparece quando a seção é terminal do fluxo (mesma regra atual), com aviso curto caso a seção tenha “Próxima seção padrão” definida.

### 3. Persistir número de WhatsApp por seção

- Migration `20260725100000_form_sections_whatsapp_phone.sql`:
  - `ALTER TABLE public.form_sections ADD COLUMN whatsapp_button_phone TEXT`.
- Atualizar `SectionDraft`, `upsertFormSections` (validação + gravação), e `src/routes/api/public/forms/$slug.ts` para expor `whatsapp_button_phone` na resposta pública.
- Em `PublicFormRenderer` (payload de sucesso vindo do POST `/api/public/forms/$slug`), preferir o número da seção terminal quando presente, senão o do formulário. Ajustar `src/routes/api/public/forms/$slug.ts` (bloco de resposta do POST) para escolher o número dessa forma.

### 4. Melhorias de UX complementares no construtor

- Trocar o botão “Salvar seção” por “Salvar formulário” (o comportamento já é global; o nome atual induz erro).
- Mostrar aviso amarelo persistente “Você tem alterações não salvas em N seção(ões)” fixo perto do botão.
- No cartão de cada pergunta ramificável, mostrar sob cada opção a legenda `→ Seção X` já com o rótulo, e destacar quando a seção destino for a mesma da seção atual (proibido) ou anterior (proibido) — hoje a validação só reclama no submit.
- No resumo do fluxo (rodapé), destacar caminhos que terminam em seção sem sucesso configurado, para o usuário perceber lacunas.

### 5. Testes manuais no preview após implementação

1. Abrir `/entrada-dados/6c4f2e0b…`; salvar; confirmar branch rules gravadas.
2. Abrir `/f/forms-teste`, escolher cada uma das 3 opções e verificar que cai na Seção 3, 4 ou 5 corretamente e que Seções 4 e 5 mostram o botão WhatsApp com o número configurado.
3. Trocar o número da Seção 4, salvar, submeter novamente e confirmar que a URL do botão do WhatsApp usa o número da seção.
4. Rodar `bunx tsgo --noEmit` para garantir tipos íntegros.

## Detalhes técnicos (arquivos tocados)

- `src/lib/form-definitions.functions.ts`: aceitar `client_key`, retornar `id/client_key` no upsert de perguntas.
- `src/components/form-builder/SectionedQuestionsPanel.tsx`: usar o mapa retornado, abortar em caso de falha de mapeamento, refatorar o bloco de sucesso, exibir campo de número por seção, renomear botão de save.
- `src/lib/form-sections.types.ts` + `src/lib/form-sections.functions.ts`: novo campo `whatsapp_button_phone` (nullable) e validação/gravação.
- `supabase/migrations/20260725100000_form_sections_whatsapp_phone.sql`: coluna nova em `form_sections`.
- `src/routes/api/public/forms/$slug.ts`: incluir `whatsapp_button_phone` na resposta e no POST final; usar o número da seção terminal quando presente.
- `src/components/PublicFormRenderer.tsx`: sem mudança lógica de roteamento (já correto); apenas confia no número recebido do servidor.

## Fora do escopo

- Ramificação por múltiplas perguntas por seção (a regra atual pega a primeira pergunta ramificável com resposta) permanece igual.
- Redesenho visual amplo do construtor. Foco é remover a confusão e o bug, mantendo o mesmo layout.
