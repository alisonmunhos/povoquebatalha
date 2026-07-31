## Diagnóstico (confirmado no banco)

Consultei as linhas das últimas importações. O erro é sempre o mesmo, em 990 linhas:

```text
null value in column "consentimento_lgpd" of relation "contacts" violates not-null constraint
```

Motivo: na tabela `contacts`, as colunas `consentimento_lgpd` e `consentimento_dados_sensiveis` são **NOT NULL com default `false`**. Mas o `commitImport` (`src/lib/imports.functions.ts`, linhas 702-703) envia explicitamente `null` quando a planilha não tem essas colunas. Enviar `null` explícito ignora o default e o banco rejeita a linha.

Por isso a prévia mostra tudo "válido" (a validação só olha nome/telefone) e depois **todas** as linhas novas falham. Os "4 atualizados/4 duplicidades" passaram porque o caminho de duplicidade forte usa `UPDATE` (que só preenche campos vazios e nunca grava `null`), então escapa da restrição.

Também existe o risco relacionado em `nome` (NOT NULL sem default): com a estratégia "importar tudo", uma linha sem nome gera o mesmo tipo de falha.

## Correção proposta

1. **`src/lib/imports.functions.ts` — payload de inserção**
   - `consentimento_lgpd: ex.consentimento_lgpd ?? false`
   - `consentimento_dados_sensiveis: ex.consentimento_dados_sensiveis ?? false`
   - Garantir que `nome` nunca vá nulo no insert: se não houver nome, marcar a linha como erro com mensagem clara ("Nome ausente") em vez de tentar inserir.
   - Revisar os demais campos do payload contra as colunas NOT NULL (`origem`, `consentimento_whatsapp`, `disponibilidade`, `formas_ajuda`) — hoje já vão preenchidos, só confirmar.

2. **Mensagem de erro mais compreensível**
   - Ao gravar `erro` em `import_rows`, traduzir violações de `not-null` para um texto em português ("Campo obrigatório ausente: X") em vez do erro técnico do banco, mantendo o original em detalhes.

3. **Reprocessar sem retrabalho**
   - Após o ajuste, as importações antigas ficam com status `confirmed` e 495 erros. Vou orientar a refazer o upload do arquivo (as linhas com erro não criaram contatos, então não há duplicidade). Se preferir, posso adicionar um botão "Tentar novamente as linhas com erro" reaproveitando a prévia já salva — diga se quer isso nesta rodada.

## Validação

- Rodar typecheck.
- Importar novamente o mesmo arquivo na preview e confirmar contadores: criados > 0 e erros = 0 (exceto linhas realmente sem nome/telefone).
- Conferir no banco que os contatos criados ficam com `consentimento_lgpd = false` quando a planilha não informa.

## Cuidados

- Nenhum dado existente é alterado; a mudança afeta apenas novas inserções.
- Definir consentimento como `false` (e não `true`) preserva a regra de LGPD: consentimento só é positivo quando o arquivo informa.
