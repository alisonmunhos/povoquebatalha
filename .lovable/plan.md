
Plano incremental para resolver os 4 pontos levantados. Cada bloco pode ser implementado e testado de forma independente.

---

## 1) Excluir contato (exclusão definitiva, só admin)

**Onde aparece:**
- Ficha do contato (`/contatos/$id`): botão "Excluir contato" no rodapé, em vermelho, separado das outras ações.
- Seleção em massa no CRM (`/contatos`): nova ação "Excluir selecionados" no menu de ações em massa, só visível para admin.

**Fluxo de confirmação (dupla, para evitar acidente):**
1. Modal com resumo: "Você vai apagar 12 contatos definitivamente. Isso remove telefone, endereço, tags, histórico de mensagens e log de auditoria. **Não é possível desfazer.**"
2. Campo para digitar `EXCLUIR` (individual) ou o número de contatos (em massa) antes do botão vermelho habilitar.
3. Após confirmar, toast com resultado e opção "Ver relatório" (mostra IDs deletados no log de auditoria pessoal do admin).

**Backend (`src/lib/contacts.functions.ts`):**
- `deleteContact({ id })` e `deleteContactsBulk({ ids })`, ambos com `requireSupabaseAuth` + checagem `has_role('admin')`.
- Antes de deletar, gravar snapshot em `contact_audit_log` (ação `hard_delete`, com JSON completo do contato) usando `contact_id = null` + `user_id = admin` para preservar rastro fora do FK.
- Deletar dependências na ordem: `contact_tags`, `direct_messages`, `inbound_messages`, `message_events`, `campaign_recipients`, `conversations`, `contact_audit_log`, `territory_contact_logs`, `contact_duplicates`, `contact_merges` (marcar como órfão), `contacts`.
- Retornar `{ deleted, skipped, errors[] }`.

**Segurança:**
- RLS: já temos admin-only via `has_role`. Adicionar policy `DELETE` explícita em `contacts` restrita a admin.
- Nada muda para operador/vrm/leitor — eles continuam vendo só "Arquivar".

---

## 2) Unificar Mapa + Território em um único módulo "Território"

**Diagnóstico atual:**
- `/mapa` (desktop) e `/territorio` (mobile-first) fazem coisas parecidas mas com dados e ações diferentes. Confunde. Zoom lento no mapa é causado por `fitBounds` disparado em todo re-render (deps `rows`) + re-criação do cluster inteiro a cada filtro.

**Novo módulo `/territorio` (responsivo):**

Layout único, adaptado ao viewport:

```text
Desktop (≥1024px)                 Mobile (<1024px)
┌─────────────┬───────────────┐   ┌───────────────────┐
│ Filtros +   │               │   │ [Mapa] [Lista]    │  ← abas
│ KPIs +      │    MAPA       │   ├───────────────────┤
│ Lista       │  (fullscreen  │   │  Filtros compact. │
│ (scrollável)│   toggle)     │   │  KPIs             │
│             │               │   │  Mapa OU Lista    │
└─────────────┴───────────────┘   └───────────────────┘
```

**Melhorias de mapa (perf + UX):**
- Manter uma única instância do `Map` e do `MarkerClusterGroup` — só substituir marcadores quando `rows` mudarem, sem recriar o mapa. Corrige o zoom lento.
- `fitBounds` só quando os filtros mudarem, não a cada re-render. Zoom/pan do usuário preservados.
- Debounce de 250 ms nos filtros antes de refazer a query.
- Ícones diferenciados por `lifecycle_status` (cor do pin) e por tipo (apoiador/militante/liderança).
- Legenda flutuante no canto inferior.
- Botão **tela cheia** (ícone maximize no canto do mapa) usando Fullscreen API — funciona em desktop e mobile.
- Botão **"Localizar-me"** (geolocation) para o modo campo.
- Cache de tiles do OSM via `maxZoom: 19` + `keepBuffer: 4`.
- Cluster com `chunkedLoading: true` para não travar quando houver 500+ pins.

**Ações unificadas (mesmo cartão em mapa e lista):**
- Abrir WhatsApp (com log automático) — botão grande, primeiro.
- Contato feito / Não encontrado / Observação (do território atual).
- Enviar mensagem rápida (do mapa atual, com templates).
- Abrir ficha completa.
- Rota até o endereço (link `https://www.google.com/maps/dir/?api=1&destination=lat,lng`) — útil na rua.

**Escopo por papel (mantém a lógica atual):**
- Admin/Operador/VRM: vê tudo, sem restrição de território.
- Território: só vê contatos dentro do escopo `user_territory_scopes`.
- Filtros e KPIs respeitam o escopo — a UI é a mesma para todos.

**Migração de rota:**
- `/mapa` passa a ser um redirect para `/territorio`.
- Item de menu "Mapa" some; "Território" ganha ícone de mapa e passa a ser o ponto único.

---

## 3) Fluxo de convite: tornar claro para quem recebe

**Diagnóstico do caso Ezequiel:**
- O convite é enviado via `supabaseAdmin.auth.admin.inviteUserByEmail` com `redirectTo=/aceitar-convite`. O link tem token no hash. Prováveis causas de falha:
  1. Link do Supabase expira rápido (padrão 24 h) — se demorou, a página fica travada em "Validando…".
  2. Se abriu num navegador que já tinha outra sessão Supabase, o hash pode não ter sido processado.
  3. A página `/aceitar-convite` hoje só mostra "peça um novo convite" — sem botão para pedir reenvio, sem contato do admin, sem passo-a-passo.

**Melhorias na página `/aceitar-convite`:**
- Renomear título visível para **"Criar sua conta"** (é o que o usuário espera).
- Fluxo em 3 estados claros com feedback visual:
  1. **Validando** (spinner + "Confirmando seu convite…").
  2. **Convite válido** → mostra e-mail + formulário de senha + regras claras ("mínimo 8 caracteres, uma letra e um número"). Botão "Criar conta e entrar".
  3. **Convite expirado/inválido** → mensagem específica + botão **"Solicitar novo convite"** (input de e-mail → chama nova rota pública `/api/public/request-invite-resend` que apenas registra pedido e notifica admin, sem revelar se o e-mail existe) + link `mailto:` do admin configurado.
- Tratar timeout do hash: se após 6 s não houver sessão, ir automaticamente para o estado "expirado".
- Após salvar senha, redirecionar por papel (usar `pickHome` já existente em `/auth`), não fixo em `/dashboard`.

**Melhorias no envio (`inviteUser`):**
- Corpo do e-mail padrão do Supabase é genérico. Personalizar via template do Supabase (documentar como) e/ou já preparar o `data` do convite com `full_name` no metadata para a saudação.
- Depois do envio, mostrar no painel um bloco copiável com: link direto do convite (via `generateInviteLink` — já existe), instruções para o admin colar no WhatsApp/pessoalmente caso o e-mail não chegue. Isso salva o caso "não recebi o e-mail".
- Adicionar coluna "Último convite enviado em" na tabela de pendentes e um badge "expira em X dias".

**Rota `/primeiro-acesso`:** só existe para bootstrap do admin inicial. Adicionar aviso no topo: "Esta página só funciona uma vez, para criar o primeiro administrador. Convites posteriores usam `/aceitar-convite`."

---

## 4) Definição de papéis (documentação viva + reforço técnico)

Nova rota admin `/usuarios/papeis` (aba dentro de `/usuarios`) com a matriz abaixo, em português claro:

| Papel | Base de contatos | Comunicação | Território | Configuração |
|---|---|---|---|---|
| **Admin** | Tudo (ler, editar, importar, exportar, mesclar, **excluir**) | Tudo (inbox, campanhas, automações, templates) | Tudo, sem restrição geográfica | Usuários, papéis, escopos, integrações, secrets |
| **Operador** | Tudo exceto excluir e gerir usuários. Importa, edita, arquiva, mescla, exporta. | Envia campanhas, gerencia automações e templates, usa inbox. | Vê tudo. | — |
| **VRM (Relacionamento)** | Lê tudo, edita ficha (tags, notas, status de relacionamento), sem importar/excluir. | Inbox completo, envios individuais, sem disparar campanhas em massa nem editar templates. | Vê tudo, mas sem ações de campo em lote. | — |
| **Comunicação** | Só leitura da base para segmentar. | Cria e envia campanhas, gerencia templates e automações, usa inbox. | — | — |
| **Território** | Só contatos dentro do seu escopo (`user_territory_scopes`). Edita notas e status básicos. | Abre WhatsApp e registra ações de campo. Sem inbox global nem campanhas. | `/territorio` (é a home dele). | — |
| **Leitor** | Só leitura. | Só leitura do inbox e do histórico de campanhas. | Só leitura. | — |

**Reforço técnico junto com a documentação:**
- Auditar as `serverFn` sensíveis (`deleteContact`, `sendCampaign`, `inviteUser`, `runAutomation`, `importContacts`) e garantir que cada uma valida o papel correto — não confiar só na UI que esconde botões.
- Onde faltar, adicionar checagem via `has_role`.
- Criar helper `assertRole(context, roles[])` em `src/lib/rbac.server.ts` para padronizar as verificações e evitar duplicação.
- Sidebar (`AppShell`): esconder itens que o papel não pode usar (hoje só o Território tem essa lógica). Ex.: VRM não vê "Importar", Comunicação não vê "Duplicidades".

---

## Ordem de execução sugerida

1. **Convite / criar conta** (mais crítico — bloqueia onboarding de novos usuários).
2. **Excluir contato** (rápido, isolado).
3. **Papéis: matriz de documentação + `assertRole` + esconder itens do sidebar** (baixo risco, alto valor).
4. **Território unificado** (maior, dividido em: rota+layout → performance do mapa → tela cheia/legenda/rota → deprecar /mapa).

Cada etapa entrega valor sozinha e pode ser testada antes da próxima.

---

## Detalhes técnicos

- Deletar contato em cascata: as FKs atuais em `direct_messages`, `inbound_messages`, `message_events`, `contact_tags`, `campaign_recipients`, `conversations`, `territory_contact_logs` provavelmente têm `ON DELETE` variados. Vou verificar antes de escrever a migration e padronizar `ON DELETE CASCADE` onde faz sentido (mensagens ficam órfãs de `contact_id` para preservar log auditável — usar `SET NULL`). `contact_audit_log`: adicionar coluna `snapshot_contact jsonb` para gravar o snapshot antes do delete, com `contact_id` nulo após a exclusão.
- Fullscreen do mapa: `document.fullscreenElement` + `element.requestFullscreen()`; após entrar/sair, chamar `map.invalidateSize()` para o Leaflet recalcular.
- `MarkerClusterGroup` reuso: guardar `clusterRef`; em vez de `removeLayer`+`addLayer`, usar `clusterRef.clearLayers()` + `clusterRef.addLayers(markers)` (batch — muito mais rápido).
- `useServerFn`: manter o padrão atual, sem quebrar cache de queries existentes.
- `/aceitar-convite`: usar `onAuthStateChange` com timeout controlado por `AbortController`; após sucesso, chamar `router.invalidate()` + `navigate({ to: home })`.
- Nenhuma mudança em `src/integrations/supabase/*` (arquivos auto-gerados).
