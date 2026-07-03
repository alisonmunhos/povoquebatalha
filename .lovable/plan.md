# Plano — Captação rastreável, Usuário-Contato e Módulo Agitação

Entendi o escopo. Nada de refazer CRM, Campanhas, Inbox, Território, Mapa ou Z-API. Vou entregar em 5 blocos incrementais, cada um testável isoladamente. Aviso: é bastante coisa — sugiro aprovar o plano inteiro e eu executo bloco a bloco, pausando entre eles se você quiser validar.

## Bloco A — Banco de dados (1 migration)

Novas tabelas + colunas, sem quebrar nada existente:

- `tracked_form_links` — token seguro (nanoid 24), `created_by_user_id`, `source_module`, `source_form_type` (`cadastro_completo` | `receber_informacoes`), `label`, `is_active`, `expires_at`, `metadata jsonb`.
- `contact_source_events` — histórico append-only de captações (`contact_id`, `source_user_id`, `source_module`, `source_form_type`, `source_link_id`, `event_type`, `metadata`).
- `agitacao_contact_logs` — logs simples do agitador (`whatsapp_aberto`, `contato_realizado`, `observacao`, `pediu_atualizacao`, `nao_respondeu`).
- `contacts`: novas colunas resumo — `primary_source_module`, `last_source_module`, `created_by_source_user_id`, `last_source_user_id`, `source_form_type`, `source_link_id`, `source_captured_at`, `is_system_user boolean`.
- `profiles.contact_id uuid` (FK para `contacts.id`, nullable, ON DELETE SET NULL).
- Enum `app_role`: adicionar valor `'agitador'`.
- RLS + GRANTs em todas as novas tabelas. Políticas: agitador só enxerga contatos/logs cujo `source_user_id = auth.uid()` (via `contact_source_events`); admin/vrm veem tudo.
- Função `resolve_tracked_link(token)` SECURITY DEFINER retornando só o necessário para o form público.
- Função `link_or_create_user_contact(user_id, email, phone, full_name)` para o fluxo de convite.

## Bloco B — Botão global "Adicionar contato" + links rastreáveis

- Componente `<AddContactButton />` reutilizável, mostrado no AppShell para papéis autorizados (admin, vrm, territorio, agitador).
- Modal com 2 cards grandes (estilo do print): "Formulário de cadastro" / "Receber informações".
- Ao abrir, cria um `tracked_form_links` via server fn `createTrackedLink({ source_module, source_form_type })` — deriva `source_module` da rota atual.
- Ações: Abrir, Copiar, Compartilhar WhatsApp (wa.me).
- Mostra "Este link será registrado como criado por: [Nome] · Origem: [Módulo]".
- Rotas `/atualizacao` e `/inscrever` passam a ler `?ref=TOKEN`, resolvem via `resolve_tracked_link`, e ao submeter chamam server fn que cria/atualiza contato + insere `contact_source_events` + atualiza campos resumo em `contacts`. Deduplicação atual (telefone/e-mail) preservada.

## Bloco C — Ficha do contato + filtros Gestão da Base

- Nova seção "Origem e captação" na ficha do contato: origem principal, última origem, captado por (nome), módulo, data, link, e histórico completo (lista de `contact_source_events`).
- Filtros novos em `/contatos` no grupo "Origem e captação":
  - Módulo de origem (enum estruturado)
  - Tipo de formulário
  - Captado por (dropdown com nomes de usuários)
  - Última origem
  - Data de captação (range)
  - Sem origem rastreada
- Chips ativos no padrão atual.

## Bloco D — Usuário-contato + fluxo de convite

- Ao aprovar/convidar usuário em `/usuarios`: campos nome completo + e-mail + papel (+ escopo se territorio). Botão gera link de convite (copiável) e envia e-mail via fluxo já existente.
- Tela de aceite: e-mail pré-preenchido e travado; pede nome, WhatsApp (opcional recomendado), senha.
- Ao aceitar: `link_or_create_user_contact` busca por e-mail → WhatsApp → cria contato novo se não achar. Marca `is_system_user=true`, `profiles.contact_id`, salva nome no perfil.
- Trigger `handle_new_user` ajustado para não criar contato duplicado quando o fluxo de convite já criou.
- Lista `/usuarios`: colunas nome, e-mail, papel, status (`convite_pendente`|`ativo`|`suspenso`|`revogado`|`convite_expirado`), contato vinculado (link para ficha), escopo, último acesso.
- `merge_contacts` (função já existente): adicionar preservação de `profiles.contact_id` — se o merged tinha vínculo, migrar para o survivor; bloquear mesclagem automática entre dois contatos ambos vinculados a usuários (marcar duplicidade como "requer_revisao_manual"). Alerta na ficha e na tela de duplicidades.

## Bloco E — Papel Agitador + módulo `/agitacao`

- Nova rota `/_authenticated/agitacao.tsx` mobile-first, cards estilo Território, **sem mapa**.
- Topo, botões "Formulário de cadastro" / "Receber informações" (reutilizam Bloco B com `source_module=agitacao`).
- KPIs: captados, cadastros completos, inscrições simples, pendentes de atualização, contatos realizados, novos 7 dias.
- Busca (nome/telefone/cidade/bairro) + filtros locais.
- Cards: nome, WhatsApp, cidade/bairro, tipo form, data captação, status cadastro, status contato realizado. Botões: Abrir WhatsApp (wa.me + log `whatsapp_aberto`), Marcar realizado, Observação, Detalhes simples.
- Server fns escopadas ao `auth.uid()` — RLS garante isolamento server-side.
- Redirect pós-login: se papel principal = agitador, cai em `/agitacao`. Menu do agitador oculta tudo menos `/agitacao`.
- Guard de rota: agitador barrado em `/contatos`, `/campanhas`, `/mensagens`, `/relacionamento`, `/inbox`, `/mapa`, `/territorio`, `/usuarios`, `/importar` (redirect + 403).
- Em `/usuarios` para papel agitador: resumo (total captados, últimos, link `/agitacao`, contato vinculado).
- Em `/contatos` (admin/vrm): filtros já cobrem "captado por agitador" via Bloco C.

## Auditoria

Reutilizar `contact_audit_log` e `access_audit_log` existentes. Novos eventos: `tracked_link_created`, `tracked_link_used`, `user_invite_accepted`, `user_contact_linked`, `merge_blocked_user_link`, `agitador_whatsapp_aberto`, `agitador_contato_realizado`, `agitador_observacao`.

## Fora deste plano

Preview de link, CEP novo, pg_cron, chatbot, heatmap, ranking, gamificação, edição completa pelo agitador, Z-API para agitador, exportação CSV para agitador, múltiplos papéis simultâneos, mapa em Agitação, mudanças destrutivas no schema.

## Ordem de execução sugerida

1. Bloco A (migration) — aprovação separada da migration.
2. Bloco B (botão + tracked links + resolução no form público).
3. Bloco C (ficha + filtros).
4. Bloco D (usuário-contato + convite + proteção de merge).
5. Bloco E (papel agitador + módulo `/agitacao`).

Cada bloco fica testável isoladamente conforme os 22 critérios da PARTE 19.

## Dúvidas rápidas antes de começar

1. **Papel único vs. múltiplos**: hoje `user_roles` já permite múltiplas linhas por usuário. Trato "papel principal" como o de maior privilégio (admin > vrm > territorio > agitador > user) para decidir landing page e menu — ok?
2. **Formulário `/inscrever`**: existe hoje? Se não, faço uma versão enxuta (nome + WhatsApp + consentimento + cidade) reaproveitando componentes de `/atualizacao`.
3. **Botão global em mobile**: FAB flutuante no canto inferior direito, ok?

Posso começar pelo Bloco A assim que aprovar.