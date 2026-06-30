# Relatório de Status — Central de Mobilização

Visão geral do que já está pronto e do que ainda falta para fechar todas as especificações do projeto original (Lovable + Cloud + Z-API).

---

## 1. O que já está construído e funcionando

### 1.1 Infraestrutura e segurança
- Lovable Cloud habilitado (banco, auth, storage).
- Secrets configurados: `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`, `ZAPI_WEBHOOK_SECRET`.
- Bucket `imports` no Storage (backups de CSV de importação).
- Schema `private` para funções sensíveis (`has_role`, `parse_phone_br`) fora do alcance do Data API.
- RLS habilitado em todas as 18 tabelas de domínio, com GRANTs explícitos.
- Auth com e-mail/senha, signup público desabilitado.
- Sistema de convites por e-mail (`/usuarios`) e bootstrap de primeiro admin (`/primeiro-acesso`).
- Middleware `requireSupabaseAuth` em todas as server functions sensíveis.

### 1.2 Banco de dados (18 tabelas)
- `profiles`, `user_roles` (com enum `app_role`).
- `contacts` (55 colunas: dados básicos, endereço completo, geolocalização, perfil de mobilização, status técnicos, auditoria).
- `tags`, `contact_tags`, `segments` (dinâmicos e estáticos).
- `imports`, `import_rows`, `import_audit_log` (com backup CSV obrigatório no undo).
- `contact_duplicates`, `contact_merges` (mesclagem real campo a campo).
- `contact_audit_log` (histórico de alterações por contato).
- `campaigns`, `campaign_recipients` (estrutura criada, lógica ainda não).
- `inbound_messages`, `message_events`, `webhook_log` (estrutura pronta para inbox).
- `whatsapp_instances` (gestão de conexão Z-API).
- Funções: `parse_phone_br` (normalização BR com 9º dígito), `merge_contacts` (transferência total de histórico), trigger de `nome_normalizado` (unaccent + lower).

### 1.3 Páginas públicas (sem login, sem AppShell)
- `/recadastro` — formulário completo com CEP → ViaCEP, endereço, consentimento, suporta `?origem=` e `?t=<token>`.
- `/inscrever` — formulário simples (nome + WhatsApp) para lista de divulgação.
- `/obrigado` — confirmação pós-envio.
- `/opt-out/$token` — link de cancelamento individual.
- Endpoints em `/api/public/forms/*` com validação Zod, normalização de telefone e dedup não-destrutiva.
- Webhook receiver em `/api/public/zapi/$evento` (status, opt-out automático por palavra-chave).

### 1.4 Painel administrativo (`/_authenticated/*`, redireciona para `/auth` se não logado)
- **Dashboard** com KPIs básicos.
- **Contatos (`/contatos`)** — CRM com:
  - Busca, filtros avançados expansíveis (15+ campos), paginação.
  - Seleção em massa, "selecionar todos do filtro" (até 5000).
  - Barra de ações em massa organizada em grupos (Seleção / Tags / Status / Ações / Exportar) com confirmações para ações perigosas e tooltips em todos os ícones.
  - Exportação CSV com BOM UTF-8.
  - Salvar filtro como segmento.
- **Ficha individual (`/contatos/$id`)** — edição completa com CEP automático, perfil de mobilização, timeline de auditoria, picker de tags.
- **Importar (`/importar`)** — pipeline 4 passos (Upload → Mapeamento → Prévia visual → Resultado) com detecção de encoding (UTF-8 / Windows-1252), DDD padrão, estratégias de commit (importar tudo / só válidos / marcar revisão), histórico de importações e **desfazer importação** com backup CSV obrigatório e confirmação forte ("DESFAZER IMPORTAÇÃO").
- **Duplicidades (`/duplicidades`)** — diálogo de mesclagem comparativa campo a campo.
- **Links Públicos (`/links`)** — gerador de links com origem rastreada, presets, URL pública do sistema visível, links individuais com token de recadastro.
- **Tags (`/tags`)** — CRUD com categorias, cores, contagem de uso.
- **Segmentos (`/segmentos`)** — dinâmicos (recalculam pelos filtros) e estáticos (snapshot de IDs).
- **WhatsApp (`/whatsapp`)** — tela de gestão da instância Z-API.
- **Usuários (`/usuarios`)** — convites por e-mail, gestão de roles.

---

## 2. O que ainda falta para fechar o escopo original

Lista das especificações pendentes, agrupadas por prioridade prática.

### 2.1 Geolocalização e endereço (parcial)
- Geocoding server-side via Nominatim/OSM: **código existe**, mas precisa rodar em background para os 93 contatos já importados (job de backfill) e validar que está sendo chamado em todos os pontos de update.

### 2.2 Boas-vindas automáticas
- Spec aprovada (mensagem automática após `/recadastro` e `/inscrever`).
- Falta: trigger pós-cadastro que enfileira mensagem de boas-vindas via Z-API.

### 2.3 Campanhas + fila de envio (módulo central, ainda não construído)
- Tela `/campanhas` com:
  - Criação (texto / mídia / template HSM).
  - Seleção de público (segmento dinâmico/estático).
  - Prévia da mensagem com variáveis (`{{nome}}`, `{{cidade}}`).
  - Botão "Enviar" e botão vermelho **"Cancelar envio"** (item de backlog confirmado).
- Worker de fila: cron a cada minuto processa `campaign_recipients` pendentes com intervalo/jitter configurável.
- Tabelas `campaigns` e `campaign_recipients` já existem; falta toda a lógica de processamento.
- Habilitar `pg_cron` + função `process_campaign_queue()`.

### 2.4 Inbox de respostas (estrutura pronta, UI faltando)
- `inbound_messages` e webhook Z-API já gravam dados.
- Falta: tela `/inbox` com lista de conversas, threading por contato, ação "Responder", marcar lida/não lida.

### 2.5 Templates HSM
- Falta: CRUD de templates aprovados, vinculação com Z-API/Meta, validação de variáveis no momento do envio.

### 2.6 Calendário de campanhas
- Tela `/calendario` (item já no menu, mas vazia).
- Visualização mês/semana, agendamento de disparo futuro, drag para reagendar.

### 2.7 Mapa com pins (módulo futuro)
- Visualização geográfica dos contatos por bairro/cidade (Leaflet + dados de geocoding).
- Filtros por tag/segmento sobre o mapa.
- Dependência: backfill de geocoding (2.1).

### 2.8 Polimento e operação
- Backfill de `nome_normalizado` / `phone_*` para contatos antigos (se houver gaps).
- Relatório de auditoria global (quem fez o quê).
- Indicadores no Dashboard: taxa de recadastro, mensagens enviadas/recebidas, opt-outs.
- Habilitar HIBP (proteção contra senhas vazadas) no Auth.
- Publicar o projeto na URL `.lovable.app` definitiva (hoje só preview).

---

## 3. Ordem sugerida das próximas etapas

1. **Boas-vindas automáticas** (rápido, fecha 2.2 + ativa Z-API real ponta a ponta).
2. **Campanhas + fila** (módulo central, 2.3 — desbloqueia tudo).
3. **Inbox** (2.4 — completa o ciclo de comunicação).
4. **Templates HSM** (2.5).
5. **Calendário** (2.6).
6. **Mapa** (2.7, depende de backfill de geocoding).
7. **Polimento + publicação** (2.8).

Backlog mantido conforme combinado: botão vermelho "Cancelar envio" entra junto com o módulo de Campanhas (etapa 2).

---

Este é um relatório, não uma proposta de implementação. Aprove para que eu trate a próxima etapa (sugiro a 2.1/2.2 — backfill de geocoding + boas-vindas automáticas) como tarefa de build, ou indique qual etapa quer atacar primeiro.