## Status atual — o que já está pronto

**Fundação (100%)**
- Lovable Cloud + secrets Z-API + bucket `imports`
- Schema completo (14 tabelas), RLS, funções de normalização BR, papéis em schema `private`
- Auth por convite (signup público desativado), `/primeiro-acesso`, `/usuarios`, `/aceitar-convite`
- AppShell + Dashboard com KPIs + tela WhatsApp (QR + status)

**Integração Z-API (parcial)**
- Cliente server-side `zapi/client.server.ts`
- Webhook universal `/api/public/zapi/$evento` com opt-out automático
- Formulários públicos `/recadastro` e `/inscrever` + `/obrigado` + `/opt-out/:token`

**O que ainda não existe**
- Importação CSV/XLSX
- Tags / segmentos salvos (UI)
- Composer de campanha + prévia
- Worker de fila (`pg_cron`) + envio com jitter
- Inbox / chat de respostas
- Templates HSM
- Mapa e calendário (módulos futuros)

---

## Próximos passos (ordem recomendada)

### Etapa 1 — Importação de contatos (CSV/XLSX)
- Página `/_authenticated/importacoes` com upload para bucket `imports`
- Server fn que lê o arquivo, escreve em `import_rows`, normaliza telefone (`normalize_phone_br`), deduplica por `phone_last8` + similaridade de nome
- Tela de revisão: novos / duplicados / inválidos, com botão "Confirmar importação"
- Atribuição opcional de tags na importação

### Etapa 2 — Tags e segmentos
- CRUD de `tags` (cor, nome) e atribuição em massa no CRM
- Construtor visual de `segments` (filtros: tags, cidade/UF, consentimento, data de cadastro, última interação)
- Preview de contagem em tempo real + salvar segmento nomeado

### Etapa 3 — Campanhas + fila de envio
- Composer: tipo (texto / mídia / template HSM), variáveis (`{{nome}}`, `{{cidade}}`), prévia renderizada
- Seleção de público: segmento salvo ou filtro ad-hoc
- Configuração de envio: janela horária, intervalo entre mensagens (jitter 3–15s), limite diário
- Materializa `campaign_recipients` (status `pending`)
- Worker via `pg_cron` (1×/min) processa lote, chama Z-API, grava `message_events`
- Tela de acompanhamento: enviados / entregues / lidos / falhas / opt-outs

### Etapa 4 — Inbox de respostas
- Lista de conversas (agrupadas por contato) com últimas mensagens de `inbound_messages`
- Painel de chat (enviar resposta manual via Z-API)
- Marcadores: não lido / respondido / arquivado
- Vínculo opcional com a campanha de origem

### Etapa 5 — Templates HSM e boas-vindas
- CRUD de templates aprovados (texto base + variáveis)
- Mensagem automática de boas-vindas no fluxo de recadastro/inscrição (trigger no webhook ou no submit do form)

### Etapa 6 — Módulos futuros
- Calendário de campanhas agendadas
- Mapa (geolocalização por CEP / cidade)
- Relatórios exportáveis

---

## Decisão necessária antes de iniciar

Por onde começo agora? Sugiro **Etapa 1 (Importação CSV/XLSX)** porque sem contatos no banco nada mais faz sentido testar de ponta a ponta. Confirma essa ordem ou prefere pular direto para outra etapa (ex: testar uma campanha pequena com contatos inseridos manualmente)?
