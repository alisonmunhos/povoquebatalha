**Confirmação de acesso:** os 7 repositórios respondem como públicos (corteza, metabase, twenty, superset, civicrm-core, espocrm, appsmith). Serão usados apenas como referência conceitual, sem leitura profunda de código, conforme sua escolha.

**Regras desta auditoria:** nenhum código de aplicação será alterado, nenhuma migration será criada, nenhuma funcionalidade implementada. O único material produzido são documentos `.md` dentro de `docs/auditoria/`.

## Entrega por fases, com checkpoint

### Entrega 1 — Diagnóstico da Gestão da Base (prioridade que você definiu)

Documentos:
- `docs/auditoria/01-mapa-do-sistema.md` — entidades, módulos, telas, fluxo dos dados.
- `docs/auditoria/02-gestao-da-base.md` — o diagnóstico central.
- `docs/auditoria/03-glossario-e-definicoes.md` — **novo**: dicionário de conceitos.

O que será investigado, com evidência de arquivo e linha em cada afirmação:

1. **Anatomia dos filtros** — leitura completa de `crm-filters.ts` (577 linhas, onde parece concentrar a tradução de filtro→consulta), `column-filter-mapping.ts`, `column-sort-mapping.ts`, `sheet-filter-chips.ts`, `filters-encoding.ts`, `ContactFiltersPanel.tsx`, `ColumnFilterHeader.tsx` e os painéis em `components/contacts-sheet/`.
2. **Comparação de caminhos de consulta** — as consultas de contatos aparecem em pelo menos 6 lugares distintos: `contacts.functions.ts`, `contacts-sheet.functions.ts`, `crm-bulk.functions.ts` (`idsByFilter`, export CSV, cópia formatada), `map.functions.ts`, `territory.functions.ts`, `segments.functions.ts`. Matriz mostrando, para cada uma: quais filtros aplica, se respeita `arquivado_at`, `opt_out_at`, `is_system_user`, escopo territorial, e se o resultado bate com a tela principal.
3. **Registros que podem "sumir"** — filtros sobre coluna derivada (ex.: `phone_e164` nulo enquanto `phone_raw` tem valor), `.eq()` onde deveria considerar NULL, combinação de filtros que vira AND implícito, `.or()` mal parentizado, tetos de linhas em seleção em massa/exportação, e o default `archived: "nao"` aplicado em uma tela mas não em outra.
4. **Pesquisa geral × filtros equivalentes** — campos cobertos, acento, telefone, e-mail; verificar se "buscar João" retorna o mesmo conjunto que filtrar nome contém "João".
5. **Saved views** — hoje em `localStorage`: não compartilháveis, não versionadas, e podem carregar um estado de filtro cujo significado mudou desde que foi salvo.
6. **Ações em massa** — se "selecionar tudo pelo filtro" usa exatamente a mesma consulta da listagem.
7. **Validação contra o banco** — para cada divergência suspeita, consultas SQL de leitura reproduzindo as duas versões da lógica, com os números lado a lado. Nenhuma conclusão sem número.

**8. Consistência das definições de negócio (acréscimo)** — para cada conceito abaixo, levantar todas as definições operacionais em uso no código e no banco, e apontar onde divergem:

| Conceito | O que será verificado |
|---|---|
| Contato | inclui `is_system_user`? inclui arquivado? inclui duplicado mesclado? |
| Apoiador | existe distinção real de "contato" ou é o mesmo registro? |
| Usuário | `profiles` × `user_roles` × `contacts.is_system_user` × `contact_id` — quem é a autoridade |
| Arquivado | `arquivado_at` é o único marcador? interage com `lifecycle_status = duplicado_mesclado`? |
| Opt-out | `opt_out_at` × `consentimento_whatsapp` × `whatsapp_status` — qual regra bloqueia envio, e se é a mesma em campanha, disparo direto, automação e missão |
| Missão | elegibilidade, "aberta", "disponível", "concluída" — definição em SQL × definição na tela |
| Campanha | o que conta como "enviada", "entregue", "falha" |
| Segmento | dinâmico × estático; o filtro salvo usa a mesma engine dos filtros da tela? |
| Território | escopo por `user_territory_scopes` × filtro de cidade/bairro na Gestão da Base |
| Telefone válido | `phone_status` × `phone_e164` × `phone_whatsapp_candidate` |

O resultado vira o glossário `03-glossario-e-definicoes.md`, com uma linha por conceito: definição encontrada, variações por módulo, e risco de interpretação errada.

**9. Ciclo de vida de cada informação importante (acréscimo)** — ficha padronizada para cada campo/indicador crítico:

```text
Campo: contacts.opt_out_at
Nasce em .......: rota pública /opt-out, merge_contacts, edição manual
Alterado por ...: <lista de funções e triggers>
Consumido por ..: envio de campanha, disparo direto, automações
Exibido em .....: ficha, tabela, BI, dashboard
Exportado em ...: CSV, cópia formatada
Depende dele ...: contagem "Opt-out" do dashboard, filtros de audiência
Fonte da verdade: sim / não — se não, onde diverge
```

Serão fichadas no mínimo: identidade do contato, telefone, consentimento/opt-out, arquivamento, `lifecycle_status`, origem/captação, geolocalização, tags, papéis de usuário e status de missão.

Ao final da Entrega 1 eu paro e trago a lista de **perguntas de regra de negócio** que o código não permite inferir. Só sigo depois das suas respostas.

### Entrega 2 — Indicadores, fonte única da verdade e dependências entre módulos

- `04-indicadores.md` — cada indicador (dashboard, KPIs de agitação, contadores de campanha, mapa, território) com pergunta que responde, fórmula exata, origem, onde mais o mesmo número é calculado, e classificação Alta / Média / Baixa confiança. Já há sinal de risco: `dashboard.functions.ts` conta contatos com regras próprias (`arquivado_at`, `latitude`) que podem não coincidir com as da Gestão da Base.
- `05-fonte-unica-da-verdade.md` — **acréscimo formalizado**: para toda informação usada em mais de um lugar, dizer explicitamente se existe implementação única ou duplicada, listando cada implementação concorrente e a diferença entre elas.
- `06-mapa-de-dependencias.md` — **novo**: mapa de impacto entre módulos. Para cada peça de lógica compartilhada (a engine de filtros, a normalização de telefone, a regra de arquivado, a regra de opt-out, o escopo territorial), listar todas as telas, dashboards, exportações, segmentos, missões e relatórios que quebrariam ou mudariam de número se ela fosse alterada. Inclui um diagrama Mermaid de dependências e uma tabela "se eu mexer em X, tenho que reconferir Y, Z, W".

### Entrega 3 — Referências externas, UX e relatório final

- `00-referencias-open-source.md` — tabela comparativa dos 7 projetos (organização de dados, filtros, saved views, governança, fonte única da verdade), somente conceitos aplicáveis sem mexer na sua arquitetura.
- `07-experiencia-uso.md` — previsibilidade, modelo mental, clareza; sem redesign.
- `08-relatorio-final.md` — os 15 itens que você listou, com as sugestões separadas em correções críticas / consistência / usabilidade / evoluções futuras. Cada sugestão com custo estimado e risco de regressão, nenhuma implementada.

## Detalhes técnicos

- Leitura apenas: `code--view`, `rg`, e `supabase--read_query` para conferir dados reais. Nenhuma escrita no banco.
- Toda afirmação de estado atual virá com referência `arquivo:linha` ou com o resultado da consulta que a comprova. Onde eu não conseguir confirmar, o texto dirá explicitamente **hipótese** ou **dúvida**, nunca fato.
- Os documentos ficam versionados no projeto, servindo de base para as próximas conversas sem reprocessar tudo.

## O que fica de fora

Não haverá alteração de código, migration, refatoração ou proposta de redesenho nesta auditoria. Melhorias só serão descritas, priorizadas e estimadas — a decisão de executar qualquer uma delas é sua, em uma conversa separada.
