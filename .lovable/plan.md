
## Diagnóstico

**Dados reais (1.010 contatos):**
- `phone_status`: 623 `valido`, 318 `precisa_revisao` (só 8-9 dígitos, sem DDD), 66 `invalido` (vazios/lixo), 3 `sem_nono_digito`.
- `lifecycle_status`: 925 `importado_aguardando_recadastro`, 16 `recadastro_concluido` (os "ativos"), 60 `telefone_invalido`, 7 `duplicado_mesclado`.
- `whatsapp_status`: 1.010 `desconhecido` — nunca é populado; a Z-API nunca é consultada.

**Causa da confusão:**
1. Existem 3 status paralelos (`phone_status`, `whatsapp_status`, `lifecycle_status`) com rótulos técnicos, sem hierarquia visível.
2. Não há ação para corrigir os 318 "precisa revisão" — só ficam listados.
3. Não há atalho para "quem virou apoiador" (preencheu cadastro).
4. Filtro de status funciona na query, mas fica escondido dentro de "Detalhado / avançado" no painel de filtros, então parece "não funcionar".

## Escopo aprovado

DDD em massa · WhatsApp sob demanda · rótulos amigáveis · revisão completa dos filtros.

## Passo 1 — Terminologia clara na UI (banco não muda)

Mapa de rótulos aplicado em **filtros, badges na tabela e ficha do contato**:

| Valor no banco | Rótulo antigo | Rótulo novo |
| --- | --- | --- |
| `phone_status=valido` | Válido | **Número OK** |
| `phone_status=precisa_revisao` | Precisa revisão | **Falta DDD** |
| `phone_status=invalido` | Inválido | **Número inválido** |
| `phone_status=sem_nono_digito` | Sem 9º dígito | **Falta 9º dígito** |
| `phone_status=sem_ddd` | Sem DDD | **Falta DDD** (mesma família) |
| `lifecycle_status=recadastro_concluido` | Atualização concluída | **Cadastro completo** |
| `lifecycle_status=importado_aguardando_recadastro` | Importado (aguardando) | **Só importado (sem cadastro)** |

Explicação curta no topo do bloco de status: *"Número = qualidade técnica do telefone. Cadastro = a pessoa preencheu o formulário."*

## Passo 2 — Filtros no lugar certo

Hoje `Status do telefone`, `WhatsApp`, `Ciclo de vida` estão dentro de "Detalhado / avançado", escondidos. Mudanças no `ContactFiltersPanel`:

1. Promover **Status do número** e **Cadastro (ciclo de vida)** para a seção principal ("Base rápida"), antes de "Detalhado".
2. Adicionar **filtros rápidos (chips clicáveis)** no topo:
   - `Cadastro completo` → `lifecycle_statuses=[recadastro_concluido]`
   - `Só importados` → `lifecycle_statuses=[importado_aguardando_recadastro]`
   - `Precisa revisão de número` → `phone_statuses=[precisa_revisao, sem_nono_digito]`
   - `Números OK` → `phone_statuses=[valido]`
   - `Bloqueados` → `bloqueado=sim`
3. Manter `Status do WhatsApp` no avançado com aviso já existente ("não use para decisões") — passa a fazer sentido depois do passo 4.
4. Reproduzir no browser antes/depois com um filtro por status e confirmar que a query retorna a contagem esperada (Ex: `Cadastro completo` = 16).

## Passo 3 — Corrigir "Falta DDD" em massa

Nova aba **"Revisão de números"** dentro de `/contatos` (ou botão flutuante quando filtro `precisa_revisao` está ativo):

- Lista os 318 contatos com `phone_status` em `precisa_revisao`/`sem_nono_digito`/`sem_ddd`, mostrando `phone_raw`, `cidade`, `uf`, `bairro`.
- Ação: **seleção múltipla + botão "Aplicar DDD"** com dropdown de DDDs (padrão sugerido pela cidade quando houver; senão o usuário escolhe manualmente, ex: 11, 21, 31, 71...).
- Server function `fixContactsPhoneDdd({ contactIds, ddd })`:
  - Para cada contato: reconstrói `phone_raw = ddd + phone_raw`, dispara o trigger `contacts_phone_fill` que já roda `private.parse_phone_br` e recalcula `phone_status`, `phone_e164`, `phone_last8`, etc.
  - Registra no `contact_audit_log`.
  - Retorna quantos viraram `valido` vs. quantos continuaram problemáticos.
- Também um botão "Editar manualmente" por linha, que abre a ficha do contato no campo telefone.

Reversível: se der ruim, o `contact_audit_log` guarda o valor anterior e uma tela de "desfazer último lote" (reaproveita padrão do `imports-undo`) refaz.

## Passo 4 — Checagem real de WhatsApp (sob demanda)

Server function `checkWhatsappForContacts({ contactIds })`:

- Chama `phone-exists-batch` da Z-API em lotes de 50 (endpoint já existe no cliente Z-API).
- Atualiza `whatsapp_status` = `confirmado` | `invalido` (nome já usado em `WPP_STATUS`).
- Atualiza `whatsapp_checked_at` (nova coluna — migration).
- Registra em `contact_audit_log`.

UI: botão **"Verificar no WhatsApp"** aparece:
- No topo da lista de contatos quando há seleção múltipla.
- Na ficha individual do contato.
- Rate-limit visual: "vai consumir X chamadas Z-API, confirma?".

Filtro `Status do WhatsApp` deixa de ter o aviso "não use para decisões".

## Passo 5 — Migração de dados e schema

Uma única migration:
1. `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS whatsapp_checked_at timestamptz`.
2. Backfill: contatos com `phone_status='invalido'` E `phone_raw` não vazio E não parece telefone → mantém como está; `phone_raw` vazio permanece.
3. Sem mudanças em enums (mantém compatibilidade).

## Passo 6 — Validação

- Reproduzir no preview: aplicar chip "Precisa revisão de número" → 321 contatos → selecionar tudo → aplicar DDD 11 → chip "Números OK" → contagem sobe para ~944.
- Testar chip "Cadastro completo" → 16 contatos.
- Testar "Verificar no WhatsApp" com 5 contatos → conferir `whatsapp_status` mudou no banco.
- Rodar typecheck.

## Arquivos afetados

- `src/components/ContactFiltersPanel.tsx` — rótulos, promoção de campos, chips rápidos.
- `src/routes/_authenticated/contatos.tsx` — chips no topo, aba/tela de revisão.
- `src/lib/phone.ts` — helpers de sugestão de DDD por cidade (tabela estática).
- `src/lib/contacts.functions.ts` (novo ou existente) — `fixContactsPhoneDdd`, `checkWhatsappForContacts`.
- `src/lib/wa-send.server.ts` ou novo `wa-check.server.ts` — chamada `phone-exists-batch`.
- Migration nova para `whatsapp_checked_at`.

## Riscos e cuidados

- Ação em massa de DDD sobrescreve `phone_raw`. Mitigado pelo log de auditoria + confirmação com contagem.
- Checagem Z-API custa chamadas; sempre pedir confirmação com a contagem.
- Nenhum contato é apagado. Nenhum enum ou trigger existente é alterado.
