Não há registro no histórico de uma **edição em lote de valores de campos** na Gestão da Base. O que foi construído até agora são **ações em massa** sobre a seleção: aplicar/remover tag, arquivar/desarquivar, opt-out, alterar status de lifecycle, exportar CSV e salvar como segmento. A edição de campo único (profissão, consentimento, etc.) só existe no modo planilha/BI (`/contatos-bi`) ou dentro da ficha individual de cada contato.

A seguir, proponho a implementação de **"Editar campo em comum"** na barra de ações em massa da tela `/contatos`.

### Objetivo
Permitir que o usuário aplique filtros, selecione um ou vários contatos e defina o mesmo valor para campos que não sejam identificadores exclusivos (nome, telefone, e-mail). Exemplos: profissão, instituição, coletivo_alicerce, consentimento_whatsapp, consentimento_lgpd, formas_ajuda, disponibilidade, participa_movimento_social, movimento_social_nome, faixa_etaria, rede_social, zona_eleitoral, como_conheceu, observações.

### Escopo e restrições
- Campos bloqueados para edição em massa: `nome`, `nome_social`, `email`, `phone_raw`, `email_secundario`, `phone_secundario_raw`, `cep`, `endereco`, `numero`, `complemento`, `bairro`, `referencia`, `cidade`, `uf`, `arquivado_at`, `opt_out_at`, `lifecycle_status`, `phone_status`.
- Campos liberados: booleanos, multiselect, enum e textos simples de perfil/campanha (exceto endereço e identificadores).
- Validação: consentimentos só podem ser `true` em massa; não será permitido revogar consentimento em lote (evita acidente LGPD).
- Auditoria: cada contato atualizado recebe uma linha em `contact_audit_log` com `action: 'bulk_update_field'`, campos alterados e usuário responsável.
- Segurança: função de servidor autenticada, reutiliza `requireSupabaseAuth` e RLS; verifica se o campo está no catálogo e não é bloqueado.
- UX: confirmação com a contagem exata de contatos afetados antes de salvar.

### Mudanças propostas

1. **Backend — `src/lib/crm-bulk.functions.ts`**
   - Adicionar `bulkUpdateField`: recebe `ids`, `fieldKey` e `value`; valida campo contra `FORM_FIELD_CATALOG`; executa `UPDATE` em `contacts` para os IDs selecionados; grava auditoria em `contact_audit_log`; retorna `{ updated, skipped }`.
   - Reutilizar `getCatalogField` e validar tipo do `value` conforme `responseType` (yes_no, multiple_choice, short_text, etc.).

2. **Backend — `src/lib/contact-rules.ts` (ou novo helper)**
   - Criar lista de chaves permitidas para edição em massa, extraída do catálogo, excluindo identificadores e campos sensíveis.

3. **Frontend — `src/routes/_authenticated/contatos.index.tsx`**
   - Adicionar botão **"Editar campo em comum"** na barra de ações em massa.
   - Abrir modal com duas etapas: (a) escolher campo (select com apenas campos permitidos), (b) informar o valor (input, checkbox, select de opções ou multi-select conforme o tipo do campo).
   - Mostrar contador de contatos selecionados e solicitar confirmação antes de aplicar.
   - Atualizar a lista após sucesso (`refetch`) e limpar seleção.

4. **Componente novo — `src/components/BulkEditFieldModal.tsx`**
   - Receber `open`, `contactIds`, `onClose`, `onApplied`.
   - Renderizar o campo de valor de forma dinâmica de acordo com o catálogo: boolean → checkbox/toggle; multiple_choice → multi-select; enum → select; short_text → input.
   - Exibir mensagens de ajuda do catálogo e validar antes de confirmar.

5. **Testes e validação**
   - Rodar `tsgo` para garantir tipos.
   - Testar na preview: filtrar 3 contatos, aplicar `profissao = "Professor"`, verificar se persistiu e se a auditoria foi registrada.
   - Verificar se campos bloqueados não aparecem no select.
