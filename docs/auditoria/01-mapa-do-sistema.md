# 01 — Mapa do Sistema

> Auditoria conceitual — Entrega 1. Documento descritivo: nada aqui altera o
> comportamento do sistema. Números medidos direto no banco em 30/07/2026.

## 1. Retrato atual da base

| Medida | Valor |
| --- | --- |
| Contatos no total | 3.289 |
| Contatos ativos (não arquivados) | 3.270 |
| Arquivados | 19 |
| Marcados como duplicado mesclado | 17 |
| Opt-out registrado | 16 |
| Contatos que são também usuários do sistema | 27 |
| Sem nenhum telefone (nem bruto, nem formatado) | 61 |
| Com telefone bruto mas sem número formatado | 11 |
| Com coordenadas no mapa | 101 |

Distribuição por status (contatos ativos):

| Dimensão | Valores encontrados |
| --- | --- |
| Cadastro (lifecycle) | importado_aguardando_recadastro 3.122 · recadastro_concluido 74 · telefone_invalido 59 · sem valor 15 |
| Número (phone_status) | valido 3.193 · invalido 59 · sem_nono_digito 14 · precisa_revisao 2 · sem valor 2 |
| WhatsApp | desconhecido 3.270 (nenhuma verificação executada até hoje) |
| Origem | import 3.180 · recadastro 79 · inscricao 9 · manual 2 |
| Geocodificação | pendente 3.172 · aproximado 88 · localizado 9 · erro 1 |

Leitura imediata: a base é hoje **quase inteiramente uma base importada e ainda
não recadastrada**, sem verificação de WhatsApp e praticamente sem
geolocalização. Qualquer indicador que dependa dessas três dimensões está
medindo o estágio da importação, não o engajamento real.

## 2. Entidades principais

```text
contacts (pessoa — registro central)
 ├─ contact_tags → tags                     marcação livre
 ├─ contact_source_events                   histórico de onde a pessoa veio
 ├─ contact_audit_log                       histórico de alterações
 ├─ contact_duplicates / contact_merges     detecção e fusão de duplicados
 ├─ campaign_recipients → campaigns         envios em massa
 ├─ direct_messages / inbound_messages      conversas 1-a-1
 ├─ conversations                           caixa de entrada consolidada
 ├─ agitacao_contact_logs                   ações de agitação
 ├─ territory_contact_logs                  ações de território
 ├─ agitation_tasks → agitation_missions    missões distribuídas
 ├─ event_rsvps → events                    confirmações de presença
 └─ profiles (quando a pessoa vira usuário) → user_roles
```

Regra estrutural relevante: **contato e usuário não são a mesma entidade**.
`profiles.contact_id` liga um login a uma pessoa da base, e `contacts.is_system_user`
marca o inverso. Hoje 27 contatos são usuários — e eles aparecem misturados nas
listagens da Gestão da Base como se fossem apoiadores comuns.

## 3. Como um contato entra na base

| Caminho | Módulo | Origem gravada |
| --- | --- | --- |
| Importação de planilha | Importação | `import` |
| Formulário público (construtor) | Link público | `inscricao` / `recadastro` |
| Link rastreado de agitador/território | Agitação, Território | `inscricao` + link de origem |
| Cadastro manual na ficha | Gestão da Base | `manual` |
| Criação de conta de usuário | Formulário com seção de conta | vira também `profiles` |

Todos esses caminhos gravam na **mesma tabela `contacts`** — isso é um ponto
forte: não existe base paralela. O risco não está na entrada, está na leitura.

## 4. Como a base é lida (os quatro caminhos de consulta)

```text
                    ┌────────────────────────────┐
                    │   crm-filters.ts           │  motor único de filtros
                    │   (crmFilterSchema +       │
                    │    applyCrmFilters)        │
                    └──────────┬─────────────────┘
        ┌──────────────┬───────┴───────┬──────────────┬─────────────┐
        │              │               │              │             │
  Gestão da Base   Planilha/BI      Mapa          Segmentos     Campanhas
  contatos.index   contatos-bi   listMapContacts  countSegment  audiência
   archived:       archived:      sem default      sem default   sem default
   "todos"          "nao"          de archived     de archived    de archived
```

O motor é compartilhado — bom. **O valor inicial dos filtros não é.** Cada tela
decide sozinha se arquivados entram, e por isso a mesma pergunta ("quantos
contatos eu tenho?") responde 3.289 na Gestão da Base e 3.270 no BI.

## 5. Módulos e o que cada um assume

| Módulo | Pergunta que responde | Assume por conta própria |
| --- | --- | --- |
| Gestão da Base | "quem está na base?" | inclui arquivados por padrão |
| Planilha / BI | "como estão os dados campo a campo?" | exclui arquivados |
| Mapa | "onde estão?" | só quem tem coordenada (101 de 3.270) |
| Segmentos | "quem é o público X?" | herda o filtro salvo, sem normalizar arquivados |
| Campanhas | "para quem vou enviar?" | consentimento + opt-out, mas não arquivado |
| Agitação / Território | "quem eu preciso contatar?" | escopo por missão / território |
| Caixa de entrada | "quem falou comigo?" | telefone como chave de ligação |

## 6. Conclusão do mapa

O sistema tem uma arquitetura sólida: **uma tabela central, um motor de filtros
compartilhado, histórico auditável em quase toda ação**. Os problemas relatados
(filtros que não trazem nada, número que some da tabela, contagens que não
batem) não vêm de falta de estrutura — vêm de **cada tela aplicar uma variação
própria das mesmas regras**. O detalhamento está em `02-gestao-da-base.md`.
