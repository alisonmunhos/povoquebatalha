## Bug 1 — causa real (confirmada, não suposta)

Rodei a mesclagem real do par `a0d31249…` ("Guilherme Gil" x "Guilherme Gil") direto no banco, dentro de uma transação desfeita ao final. O resultado:

```text
ERROR: duplicate key value violates unique constraint
       "campaign_recipients_campaign_id_contact_id_key"
DETAIL: Key (campaign_id, contact_id)=(6954283c…, 4a1c0383…) already exists.
CONTEXT: UPDATE public.campaign_recipients SET contact_id = p_survivor
         WHERE contact_id = p_merged   (merge_contacts, linha 145)
```

Ou seja: **os dois cadastros receberam a mesma campanha**. A função `merge_contacts` transfere os destinatários de campanha com um `UPDATE` cego, e a tabela tem regra de "um destinatário por campanha". A transação inteira é abortada — por isso o par continua `pendente` e não existe **nenhum** registro em `contact_merges` para esses dois contatos.

Não é o campo "MESCLAR": esse par é de confiança **provável**, e nessa confiança a digitação nem é exigida. O botão estava habilitado.

O erro fica invisível porque `mergeContactsBulk` captura a falha por item, devolve `{ ok: false, falhas: [...] }`, e o modal só mostra um aviso genérico ("0 unificado(s), 1 com erro") e **fecha mesmo assim**, parecendo sucesso.

A função tem o mesmo tratamento cego em `automation_deliveries` (também única por automação+contato). `event_rsvps`, `agitation_tasks`, `agitation_link_pauses`, `contact_tags` e `conversations` já são tratadas corretamente.

## Correção 1 — o que fazer

1. **Migration** ajustando `merge_contacts`: antes de mover, apagar do absorvido o registro conflitante (mesmo padrão já usado em `event_rsvps`), para `campaign_recipients` e `automation_deliveries`. Nada é perdido de fato: o sobrevivente já tem o registro daquela campanha/automação.
2. **Mensagem de erro visível**: o modal deixa de fechar quando há falha — mostra a mensagem real do banco dentro do modal e mantém a tela aberta.

## Correção 2 — remover a digitação "MESCLAR"
Retirar `confirmText`/`needsTyped` do `MergeContactsModal.tsx` e a função `requiresTypedConfirmation` de `merge-suggestion.ts` (sem outros usos). O botão passa a ser a única confirmação.

## Correção 3 — "Decidir depois": duas opções

**(a) Renomear (recomendado).** Trocar o rótulo para **"Ignorar por enquanto"** e explicar na tela que o par sai da fila e só volta se a verificação da base for rodada de novo. Zero mudança de banco, e já é verdade hoje: o `rescanDuplicates` recria pares que voltarem a bater.

**(b) Implementar o adiamento de verdade.** Nova coluna `postergado_ate` em `contact_duplicates`, o par continua `pendente` mas some da lista até a data; a fila ordena por ela. Exige migration, ajuste em `listDuplicateGroups`, `countPendingDuplicates` e um seletor de prazo na interface.

**Recomendação: (a)**, com o rótulo honesto. É a opção tecnicamente mais simples e o comportamento (a) já tem uma válvula de escape — o botão "Verificar a base agora" traz de volta o que ainda for duplicado. Se você preferir (b), implemento na sequência.

## Correção 4 — menos ruído na comparação
Na tabela de comparação, só entram os campos em **conflito real** (os dois lados preenchidos e diferentes). Os campos que só existem num dos cadastros passam para um bloco menor abaixo: "Estes campos serão preenchidos automaticamente: Bairro, Profissão, E-mail…", sem botão nenhum. Se não houver conflito algum, a tabela é substituída por "Nenhuma divergência — nada a decidir".

## Arquivos tocados
- `supabase/migrations/…_merge_contacts_unique_fix.sql` (nova versão de `merge_contacts`)
- `src/components/MergeContactsModal.tsx` (digitação removida, erro visível, comparação enxuta)
- `src/lib/merge-suggestion.ts` (remover `requiresTypedConfirmation`)
- `src/routes/_authenticated/duplicidades.tsx` (rótulo do botão de adiar)

## Cuidados
- A migration só altera a função; não apaga contatos nem históricos.
- Após aplicar, testo de novo o par do Guilherme na transação com rollback antes de considerar resolvido.
