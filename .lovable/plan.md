## Diagnóstico

**1. Por que o telefone some da tabela mas aparece na ficha**
Confirmado no banco: 315 contatos `precisa_revisao` têm `phone_raw` preenchido mas `phone_e164` = NULL (o normalizador exige DDD para gerar E.164). A tabela `/contatos` mostra apenas `formatPhoneBR(c.phone_e164)` (linha 512), por isso fica em branco. A ficha lê `phone_raw`, por isso o número aparece lá.

**2. Por que o dropdown "Status" da coluna não puxa "Falta DDD"**
O dropdown da coluna **Status** está ligado apenas a `lifecycle_statuses` (opções: Só importado, Link enviado, Cadastro completo, Telefone inválido, Mesclado…). `phone_status` (Falta DDD, Número OK, Número inválido) **não existe nesse menu** — só está no painel lateral. Além disso:
- "Telefone inválido" no dropdown é `lifecycle_status=telefone_invalido` (praticamente vazio, 60 registros só) — diferente de `phone_status=invalido` (66). Nomes iguais para coisas diferentes.
- Sem contadores nas opções → o usuário não vê que várias delas estão zeradas (`link_enviado`, `recadastro_iniciado`, `nao_respondeu`, `precisa_revisao`, `duplicado_possivel` = 0).

**3. Filtros que não puxam nada**
Opções de `lifecycle_status` são hardcoded a partir de `LIFECYCLE`, sem contagem, então aparecem valores que nunca ocorrem no banco.

---

## Plano

### Passo 1 — Mostrar o telefone mesmo sem E.164
Na tabela `/contatos` (linha 512), quando `phone_e164` for null e existir `phone_raw`, exibir `phone_raw` em cinza + badge "Falta DDD". Assim o operador enxerga o número original e sabe o que revisar. O botão "Copiar WhatsApp" e o link `wa.me` continuam desabilitados enquanto não houver E.164.

### Passo 2 — Reformular a coluna "Status" em duas colunas de filtro
Substituir a coluna "Status" única por duas colunas de cabeçalho filtráveis, alinhadas ao vocabulário do painel lateral:
- **Cadastro** → filtra `lifecycle_statuses` (Cadastro completo, Só importado, Link enviado, Bloqueado, Mesclado etc.).
- **Número** → filtra `phone_statuses` (Número OK, Falta DDD, Falta 9º dígito, Número inválido).

Cada dropdown mostra **contagem real** vinda de um novo agregado `contactsStatusFacets` (COUNT por `lifecycle_status` e por `phone_status` respeitando `archived=nao`). Opções com contagem 0 aparecem desabilitadas/cinza, para o usuário entender que não existe nenhum contato naquele estado hoje. Isso elimina o mistério de "cliquei no filtro e não veio nada".

### Passo 3 — Sincronizar rótulos e remover duplicidade
- Renomear "Telefone inválido" no dropdown de lifecycle para "Marcado telefone inválido (manual)", para não confundir com o `phone_status=invalido` real.
- Remover do dropdown lifecycle os valores sem nenhum uso previsto pelo fluxo atual (`precisa_revisao`, `duplicado_possivel` como lifecycle — só existem como phone_status/regra de deduplicação), mantendo apenas os que fazem parte do ciclo de vida real.
- `PHONE_STATUS_LABEL` e `LIFECYCLE_LABEL` já estão centralizados em `phone-labels.ts`; ambos dropdowns e chips ativos continuam consumindo daí.

### Passo 4 — Facets como fonte única
Novo `contactsStatusFacets()` em `src/lib/contacts-phone.functions.ts` retorna:
```
{ lifecycle: { valor: count }, phone: { valor: count }, whatsapp: { valor: count } }
```
respeitando `arquivado_at IS NULL`. A tabela usa o resultado nas colunas Cadastro/Número e o painel lateral também passa a mostrar contagens ao lado de cada checkbox. Zero query extra por filtro selecionado — 1 chamada só.

### Passo 5 — Chip rápido corrige o "Falta DDD"
O chip **Precisa revisão** já filtra `phone_statuses = [precisa_revisao, sem_ddd, sem_nono_digito]` e abre o diálogo de aplicação de DDD. Vou verificar visualmente que ele fica ativo/destaque quando o filtro é aplicado (bug reportado: "não puxa"). Se o problema era só que o usuário buscava a opção no dropdown de coluna, o Passo 2 já resolve.

### Passo 6 — Validação (browser)
Rodar Playwright em `/contatos`:
1. Abrir dropdown **Número** → confirmar opções "Número OK (623)", "Falta DDD (315)", "Número inválido (66)".
2. Selecionar "Falta DDD" → verificar que as linhas listadas mostram `phone_raw` em cinza + badge, e a contagem bate.
3. Abrir dropdown **Cadastro** → confirmar contagens; opções com 0 aparecem cinza.
4. Screenshot final.

---

## Detalhes técnicos

- Sem mudança de banco, sem migration, sem enum novo.
- Arquivos tocados: `src/routes/_authenticated/contatos.index.tsx` (colunas + render do telefone), `src/lib/contacts-phone.functions.ts` (novo `contactsStatusFacets`), `src/components/ContactFiltersPanel.tsx` (mostrar counts vindos do facet), `src/lib/phone-labels.ts` (ajuste do rótulo lifecycle "telefone_invalido").
- Sem alteração no motor de mensagens, sem tocar em `crm-filters.ts` (a query já suporta `phone_statuses`/`lifecycle_statuses`).
- Risco: baixo. Nenhuma escrita, apenas leitura e apresentação.
