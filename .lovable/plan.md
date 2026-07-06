## Causa raiz (uma só)

A migration reparadora do construtor de formulários rodou incompleta: criou as tabelas mas **faltou duas colunas** e **nunca semeou os 2 formulários fixos** que o app espera. Isso derruba os dois sintomas de uma vez.

### O que confirmei

- Tabela `form_definitions` **não tem** as colunas `is_fixed` nem `success_screen_order`.
- Só existe 1 linha na tabela (um formulário de teste que você criou). **Não existem** os slugs `recadastro-fixo` e `inscrever-fixo`.
- O `SELECT ... is_fixed ...` que a aba **Entrada de Dados** faz retorna erro do PostgREST → a lista inteira quebra → "não consigo criar" (o modal existe, mas a lista fica em erro) e "os fixos não abrem" (nem existem).
- O componente `PublicFormRenderer` das rotas `/recadastro`, `/inscrever` e `/atualizacao` chama `/api/public/forms/recadastro-fixo` e `/api/public/forms/inscrever-fixo`; como esses slugs não estão no banco, o endpoint devolve 404 e a tela mostra **"Formulário não encontrado ou indisponível"** — foi exatamente o que reproduzi no domínio publicado (`povoquebatalha.lovable.app/recadastro`, `/inscrever`, `/atualizacao`).
- O `POST` do mesmo endpoint também faz `SELECT ... success_screen_order` — mesmo semeando os registros, a submissão só volta a funcionar depois de adicionar a coluna.

## O que vou fazer

**1 migration única**, idempotente, sem perda de dados:

1. `ALTER TABLE public.form_definitions ADD COLUMN IF NOT EXISTS is_fixed boolean NOT NULL DEFAULT false;`
2. `ALTER TABLE public.form_definitions ADD COLUMN IF NOT EXISTS success_screen_order text NOT NULL DEFAULT 'whatsapp_first' CHECK (success_screen_order IN ('whatsapp_first','confirmation_first'));`
3. `INSERT ... ON CONFLICT DO NOTHING` dos 2 formulários fixos:
   - `recadastro-fixo` → título "Recadastro completo", `source_form_type='cadastro_completo'`, `is_fixed=true`.
   - `inscrever-fixo` → título "Inscrição simples", `source_form_type='receber_informacoes'`, `is_fixed=true`.
4. Para cada formulário fixo, semear as **3 perguntas core** (nome, WhatsApp, consentimento) usando `INSERT ... WHERE NOT EXISTS` — mesmas 3 que o construtor cria automaticamente para qualquer formulário novo. Fica alinhado com o comportamento atual de "criar novo formulário" e com a proteção que já existe no código impedindo deletar formulário fixo.

Depois da migration ser aprovada e o `types.ts` regenerar, **sem tocar em nenhum código**:
- A aba **Entrada de Dados** volta a listar (agora com os 2 fixos + o formulário de teste que você criou).
- Clicar num formulário fixo abre o construtor normalmente (o `getFormDefinition` já usa `.maybeSingle()` em template/automation/tracked_link).
- `povoquebatalha.lovable.app/recadastro` (e `/atualizacao`, `/inscrever`) volta a carregar o formulário, submissão inclusa.

## O que **não** vou mexer agora (e por quê)

- **Aba `/links`**: os links exibidos usam `window.location.origin`, que dentro do editor Lovable é o preview interno (`lovableproject.com`). Isso é um problema separado de UX — o formulário publicado em si volta a funcionar com essa migration. Se depois de aplicada você ainda quiser que a tela de links mostre o domínio publicado em vez do preview interno, aviso e trato num passo à parte pra não misturar escopo com o fix crítico.
- Rotas antigas em `src/routes/api/public/forms/recadastro.ts` e `inscrever.ts`: continuam existindo como fallback histórico (comentário no código diz isso). Não precisam ser tocadas.

## Checklist de teste ao final

1. Abrir `/entrada-dados` → ver "Recadastro completo" e "Inscrição simples" com tag azul **Fixo** na lista.
2. Clicar num deles → construtor abre com as 3 perguntas core já preenchidas.
3. Criar um formulário novo qualquer → aparece na lista e abre.
4. Abrir `https://povoquebatalha.lovable.app/recadastro` em aba anônima → formulário renderiza (não a tela "Formulário não encontrado").
5. Idem `/inscrever` e `/atualizacao`.
6. Submeter um teste em `/inscrever` → chega em `contacts`.

## Detalhe técnico

```text
Migration (idempotente):
  ALTER TABLE form_definitions ADD COLUMN IF NOT EXISTS is_fixed boolean ...
  ALTER TABLE form_definitions ADD COLUMN IF NOT EXISTS success_screen_order text ... CHECK (...)
  INSERT INTO form_definitions (slug, title, source_form_type, event_key, is_fixed) VALUES
    ('recadastro-fixo', ..., 'cadastro_completo', 'formulario:recadastro-fixo', true),
    ('inscrever-fixo',  ..., 'receber_informacoes','formulario:inscrever-fixo',  true)
  ON CONFLICT (slug) DO UPDATE SET is_fixed = true;
  INSERT INTO form_definition_questions ... WHERE NOT EXISTS (...)
    -- 3 perguntas core por formulário fixo
```

Nenhum código fonte precisa mudar — o schema desses SELECTs já assume as colunas e slugs. Depois da migration, os selects passam a retornar dados e os fluxos voltam.
