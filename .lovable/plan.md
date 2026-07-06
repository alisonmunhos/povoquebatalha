## Diagnóstico do que está diferente hoje

Testei o que já foi implantado e comparei com o comportamento dos formulários originais (`src/routes/api/public/forms/recadastro.ts` e `inscrever.ts`). Achei uma causa raiz única para o que você reclamou, mais duas confirmações do que **já está certo**.

### 1) Causa raiz — os formulários fixos foram semeados quase vazios

No banco, `recadastro-fixo` e `inscrever-fixo` existem, mas **só têm as 3 perguntas core** (Nome, WhatsApp, Consentimento). Confirmei rodando `SELECT` na tabela `form_definition_questions` — 3 linhas por formulário, só.

O `/recadastro` original (handler antigo em `recadastro.ts`) validava **~20 campos**: nome, nome_social, phone, email, cidade, uf, cep, endereço, número, complemento, referência, bairro, como_conheceu, profissão, instituição, coletivo_alicerce, participa_movimento_social + nome do movimento, formas_ajuda + outro. Nenhum desses foi seedado no `recadastro-fixo`. Por isso a tela pública renderiza só 3 campos em vez do "cadastro completo" que existia antes.

O `/inscrever` original pedia nome, phone, cidade, uf, consentimento. Também está reduzido a 3 campos hoje.

O motor público (`PublicFormRenderer`) **já renderiza tudo numa tela só** — isso não mudou. O problema não é layout, é que as perguntas simplesmente não foram plantadas.

### 2) O que já está correto (não vou mexer)

- **Botões de WhatsApp e confirmação são independentes e opcionais também nos fixos.** O construtor (`entrada-dados.$id.tsx`) mostra `waEnabled` e `confActive` como dois checkboxes desmarcáveis, inclusive para `is_fixed=true`. A tag azul só avisa "não pode excluir", nada bloqueia edição de perguntas, mensagem ou botões.
- **Ordem WhatsApp × confirmação na tela de sucesso** já é configurável (`success_screen_order`), e o `PublicFormRenderer` respeita.
- **Compatibilidade retroativa das URLs** já está preservada — `/recadastro`, `/atualizacao` e `/inscrever` continuam existindo e apontam pra `PublicFormRenderer` com o slug fixo correto.

### 3) Uma cicatriz técnica que preciso corrigir junto

O `event_key` seedado ficou `formulario:recadastro-fixo` / `formulario:inscrever-fixo`. Os handlers antigos disparavam `atualizacao_apoiador_concluida` e `inscricao_concluida`. Se houver `automations` ou `message_templates` cadastrados no seu banco de produção amarrados nesses eventos originais, elas silenciosamente pararam de disparar quando a rota migrou pro motor genérico. Vou verificar isso antes de aplicar e, se existir, **ajustar o `event_key` dos fixos pros nomes originais** — a migration é reversível e não perde dado.

---

## Plano de correção

### Fase 1 — Migration (idempotente, sem perda de dado)

Um único arquivo de migration, com estas operações:

1. `UPDATE form_definitions SET event_key='atualizacao_apoiador_concluida' WHERE slug='recadastro-fixo'`
2. `UPDATE form_definitions SET event_key='inscricao_concluida' WHERE slug='inscrever-fixo'`
3. Para `recadastro-fixo`, `INSERT ... WHERE NOT EXISTS` das perguntas do catálogo que faltam, na ordem correspondente ao formulário original: `endereco_completo` (bloco único com CEP + autopreenchimento), `email`, `nome_social`, `profissao`, `instituicao`, `formas_ajuda`, `formas_ajuda_outro`, `participa_movimento_social`, `movimento_social_nome`, `coletivo_alicerce`, `como_conheceu`. Todas como opcionais (`required=false`), replicando o schema original — só o core continua obrigatório. Usa `defaultLabel` e `defaultHelpText` do `FORM_FIELD_CATALOG`.
4. Para `inscrever-fixo`: ver "Ponto a decidir" abaixo.

`ON CONFLICT` no par `(form_definition_id, catalog_field_key)` garante que rodar de novo não duplica; se você já tiver editado alguma pergunta manualmente, o `WHERE NOT EXISTS` preserva sua edição.

### Fase 2 — Nada de código

Nenhum `.tsx`/`.ts` precisa mudar. O `PublicFormRenderer`, o handler `/api/public/forms/$slug.ts` e o construtor já sabem lidar com todos esses catalog fields — só precisavam das linhas no banco.

### Fase 3 — Verificação ao final

1. Abrir `povoquebatalha.lovable.app/recadastro` em aba anônima → aparece o cadastro completo (bloco de endereço com CEP autocompletando + demais campos) numa tela só.
2. Abrir `/atualizacao?ref=<token>` → mesma coisa (mesmo componente, alias).
3. Abrir `/inscrever` → forma resultante da decisão abaixo.
4. Abrir `/entrada-dados/<id-do-recadastro-fixo>` → construtor mostra todas as perguntas seedadas, permite editar enunciado/ajuda/obrigatoriedade, desmarcar botão de WhatsApp, desmarcar confirmação, salvar tudo.
5. Submeter um cadastro de teste em `/inscrever` → chega em `contacts` e a automação amarrada a `inscricao_concluida` (se existir) volta a disparar.
6. `bunx tsc --noEmit` sem erros novos.

---

## Ponto a decidir antes de eu executar (uma escolha só)

**O que o `/inscrever` deve pedir?** O original pedia nome, phone, cidade, uf, consentimento. O catálogo do construtor **não tem** um campo "cidade+UF" solto — só existe o `endereco_completo`, que é o bloco inteiro (CEP+rua+número+bairro+cidade+UF). Três caminhos razoáveis:

- **A. Igualzinho ao original**: adicionar `endereco_completo` como opcional no `inscrever-fixo`. O usuário pode preencher só cidade/UF e ignorar o resto (o bloco não força CEP). Pede um pouco mais visualmente, mas é o mais próximo do "seguir a versão anterior" e usa o mesmo catálogo que o resto do sistema.
- **B. Manter enxuto**: deixar `inscrever-fixo` com só as 3 perguntas core (nome/whatsapp/consentimento) e você adiciona cidade/UF depois manualmente pelo construtor se quiser. Fica diferente do original, mas mais leve.
- **C. Criar um catalog field novo "cidade_uf"**: envolve migration de banco pra coluna nova e código pra reconhecer o filtro. Escopo maior do que a correção pede — não recomendo agora.

Minha recomendação é **A**, porque foi o que você definiu como o padrão desse sistema ("cadastro completo todo na mesma tela") e mantém a paridade com o formulário antigo. Confirma A, B, ou algo diferente?
