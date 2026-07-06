## Diagnóstico

Analisei a ficha `/contatos/:id` (`src/routes/_authenticated/contatos.$id.tsx`) e a server fn `updateContact` (`src/lib/contacts.functions.ts`). Vejo três causas possíveis, e o fluxo atual é pesado demais para uma correção simples de telefone.

**Por que "Salvar alterações" parece não fazer nada**
1. O `save()` envia o formulário inteiro (30+ campos) através de um Zod schema estrito. Se **qualquer** campo estiver fora do padrão (e-mail com espaço, UF em minúscula, telefone acima de 40 caracteres, formas_ajuda com slug longo), o Zod lança e mostra um `toast.error` com mensagem críptica em inglês que some em 3s. O usuário vê "nada acontece".
2. Não há `console.error` no catch — a falha some sem deixar rastro.
3. Depois do save, o refetch é só da query da ficha; a listagem e os facets da tela anterior continuam com o status antigo, reforçando a sensação de "não salvou".
4. Bônus: o `session_replay` mostra o body em `data-selector-active="true"` — quando o modo de seleção da Lovable está ligado, cliques em botões vão para o seletor, não para o `onClick`. Isso pode ter contribuído em alguns testes.

**Por que fica complexo pro seu uso real**
Pra consertar 1 telefone que falta DDD, você é obrigado a rodar o save do formulário inteiro. O certo é ter uma ação dedicada para o telefone.

---

## Plano de ação

### Passo 1 — Botão "Salvar telefone" ao lado do campo (ficha)
Adicionar, logo abaixo do campo **WhatsApp / telefone** na ficha, um bloco compacto:
- Chip mostrando o status atual ("Falta DDD", "Número OK", "Número inválido").
- Quando falta DDD e o número tem 8-9 dígitos, sugestão automática pelo `suggestDddFor(cidade, uf)` (já existe). Botão "Aplicar DDD 51 (Porto Alegre)" que prefixa e salva num clique.
- Dropdown alternativo com todos os DDDs (`ALL_DDDS`) pro caso da sugestão estar errada.
- Botão **Salvar telefone** que envia SÓ `{ id, phone_raw }` (não depende do resto do form estar válido).
- Após salvar: `q.refetch()` da ficha + `queryClient.invalidateQueries({ queryKey: ["contacts-*"] })` para atualizar listagem, facets e chips.

Isso resolve 90% dos casos com 1 clique, sem depender do "Salvar alterações" global.

### Passo 2 — Robustecer o "Salvar alterações" global
No `save()` da ficha:
- Fazer o `parse` do form no cliente com `updateSchema.safeParse` **antes** de chamar o servidor. Em caso de erro, montar mensagem em português citando o campo e destacar a borda do input em vermelho.
- Adicionar `console.error("updateContact failed:", e)` no catch.
- Trocar toast genérico por mensagem específica ("E-mail inválido", "Telefone muito longo", etc.).
- Após sucesso, invalidar também as queries da lista: `["contacts-rich", "contacts-quick-counts", "contacts-status-facets"]`.

### Passo 3 — Normalizar o schema para aceitar entrada humana
Ajustes pequenos no `updateSchema` para reduzir rejeições espúrias:
- `phone_raw`: aumentar para `max(60)` e converter string vazia em `null`.
- `uf`: aceitar minúsculo e normalizar no handler (já faz `toUpperCase`, mas o `.length(2)` roda antes).
- `email`: quando string vazia, converter para `null` antes do parse.
- `formas_ajuda`/`disponibilidade`: subir `max` do item para 60 (compatível com slugs atuais).

Sem migration, sem mudar o banco.

### Passo 4 — Confirmar que o status muda visualmente
Depois de aplicar DDD:
- O trigger `contacts_phone_fill` já recalcula `phone_e164`, `phone_status`, `phone_last8` automaticamente (confirmado nos triggers do banco).
- A ficha refaz o fetch e mostra o novo chip "Número OK".
- A listagem atualiza contagem no chip "Números OK" / "Falta DDD" via invalidação.

### Passo 5 — Validação real no navegador
Playwright abrindo `/contatos`, filtrando "Falta DDD", entrando na primeira ficha, clicando "Aplicar DDD 51", confirmando que:
1. Toast "Telefone atualizado — Número OK".
2. Chip da ficha muda para "Número OK".
3. Voltando à listagem, o contato sai do filtro "Falta DDD".

Screenshot de cada etapa.

---

## Arquivos afetados

- `src/routes/_authenticated/contatos.$id.tsx` — bloco de telefone + robustecer save + invalidar caches.
- `src/lib/contacts.functions.ts` — nova fn `saveContactPhone({ id, phone_raw })` que só toca no telefone; pequenos ajustes no `updateSchema`.
- Nenhuma mudança no banco, nenhum enum novo, nenhum trigger tocado.

## Riscos

Baixo. A ação nova é escopo mínimo (1 campo). O save global fica com validação mais tolerante mas continua respeitando os limites do banco. Nada apagado.
