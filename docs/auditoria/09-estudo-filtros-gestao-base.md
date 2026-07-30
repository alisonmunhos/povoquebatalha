# 09 — Estudo da experiência de filtros (Gestão da Base)

> Diagnóstico e sugestões. Nada foi alterado no código.
> Fontes conferidas: `ContactFiltersPanel.tsx`, `crm-filters.ts`,
> `crm-filter-options.functions.ts`, `crm-bulk.functions.ts`,
> `contacts.functions.ts`, `users.functions.ts`.

---

## 1. Inventário completo

### Filtros rápidos (aberto por padrão)

| Filtro | O que é de fato | Resultado que traz |
| --- | --- | --- |
| Arquivados | `arquivado_at` preenchido ou não | Somente ativos (padrão), somente arquivados, ou todos |
| Tags | vínculo em `contact_tags` (OR entre tags) | Quem tem pelo menos uma das tags marcadas; aceita "(Vazio)" = sem nenhuma tag |
| Cadastro (ciclo de vida) | `lifecycle_status` | Estágio do contato no fluxo de recadastro **e também** marcações manuais (bloqueado, duplicado, telefone inválido) |
| Status do número | `phone_status` | Qualidade técnica do telefone (válido, falta DDD, falta 9º dígito, inválido) |
| Confirmado no WhatsApp? | `whatsapp_status` | Resultado da verificação de WhatsApp |

**Ambíguos aqui:** "Cadastro (ciclo de vida)" é o pior nome do painel — mistura
duas coisas diferentes: *progresso do recadastro* (importado → link enviado →
iniciado → concluído) e *marcações de qualidade/decisão* (bloqueado, duplicado,
telefone inválido). São dois eixos empilhados num campo só.

### Localização
| Filtro | O que é | Resultado |
| --- | --- | --- |
| UF / Cidade / Bairro | `uf`, `cidade`, `bairro` (texto exato, sem acento-insensibilidade) | Lista montada a partir dos valores existentes; Bairro se estreita quando há cidade escolhida |

### Perfil
| Filtro | O que é | Resultado |
| --- | --- | --- |
| Tipo de contato | `tipo_contato` (etiqueta livre) | Apoiador / Voluntário / Lista / Importado / Outro |
| Nome social contém | `nome_social` | Busca parcial |
| Profissão contém | `profissao` | Busca parcial |
| Onde trabalha contém | `instituicao` | Busca parcial |
| Coletivo Alicerce | booleano | Sim / Não |
| Participa de movimento social | booleano | Sim / Não |
| Movimento contém | `movimento_social_nome` | Busca parcial |
| Faixa etária | `faixa_etaria` | Faixa declarada no formulário |
| Rede social contém | `rede_social` | Busca parcial |
| Quem indicou contém | `quem_indicou` | Busca parcial |
| Zona eleitoral contém | `zona_eleitoral` | Busca parcial |
| Como conheceu contém | `como_conheceu` | Busca parcial |

**Ambíguos aqui:** "Tipo de contato" (não diz de onde vem nem para que serve),
"Coletivo Alicerce" (jargão interno sem explicação no painel), "Zona eleitoral /
local de votação" (dois conceitos diferentes no mesmo campo de texto).

### Participação
| Filtro | O que é | Resultado |
| --- | --- | --- |
| Formas de ajuda | array JSON `formas_ajuda` | OR entre opções marcadas |
| Disponibilidade | array JSON `disponibilidade` | OR entre dias/períodos |

### Comunicação
| Filtro | O que é | Resultado |
| --- | --- | --- |
| Apto para envio | atalho composto: consentimento sim + sem opt-out + não bloqueado + telefone válido | Quem pode receber mensagem hoje |
| E-mail contém | `email` | Busca parcial |
| Tem e-mail secundário / telefone secundário | campo preenchido ou não | Sim / Não |
| Consentimento WhatsApp | `consentimento_whatsapp` | Sim / Não |
| Consentimento LGPD | `consentimento_lgpd` | Sim / Não |
| Dados sensíveis | `consentimento_dados_sensiveis` | Sim / Não |
| Opt-out | `opt_out_at` preenchido | Quem pediu para não receber |
| Bloqueado para envio | `lifecycle_status = nao_enviar` | Bloqueio manual |

### Histórico de mensagens
Recebeu campanha / NÃO recebeu campanha / Erro em campanha / Recebeu mensagem
salva / NÃO recebeu mensagem salva — todos cruzam `campaign_recipients` e
`direct_messages` por campanha ou modelo escolhido.

### Origem e captação
Canal (público x atribuído), Ponto de rastreio, Captado por, Módulo de origem,
Tipo de formulário, Sem rastreio fino, Captado desde/até.

**Ambíguos aqui:** "Módulo de origem" x "Ponto de rastreio" x "Tipo de
formulário" x "Canal" — quatro filtros vizinhos que respondem perguntas
parecidas e nenhum deles diz, sozinho, *de qual formulário a pessoa veio*.

### Importação
Foi importado? / Importado por / Lote(s) / Importado desde / até.

### Existem no motor, mas não aparecem no painel
`segment_id`, `is_system_user`, `system_roles`, `nome`/`nome_empty`,
`email_empty`, `phone_contains`/`phone_empty`, `endereco_contains`/`_empty`,
`created_desde`/`_ate`/`_contem`, `origem`/`origens`, `origem_detalhe`,
`formas_ajuda_outro`, `profissoes`, `instituicoes`, `movimentos_sociais`.
São usados pela planilha BI e pelos filtros de coluna, mas ficam invisíveis
para quem só usa o painel lateral — inclusive **data de cadastro**, que é uma
das perguntas mais óbvias e hoje não existe no painel.

---

## 2. Reorganização das seções

O agrupamento atual é razoável, mas tem três problemas: nove seções (rolagem
longa), critérios misturados (qualidade de dado junto com perfil da pessoa) e
quatro filtros de origem que competem entre si.

Proposta de agrupamento por **pergunta que a pessoa está fazendo**:

1. **Quem é** — nome, tipo de contato, faixa etária, profissão, onde trabalha,
   movimento social, coletivo, nome social, rede social.
2. **Onde está** — UF, cidade, bairro, zona eleitoral, geocodificação.
3. **Como entrou na base** — canal, formulário/ponto de rastreio, captado por,
   quem indicou, como conheceu, importação (lote, quem importou, datas),
   data de cadastro. *Fundir "Origem e captação" + "Importação".*
4. **Posso falar com essa pessoa?** — apto para envio (destaque), consentimentos,
   opt-out, bloqueado, status do número, WhatsApp confirmado, tem e-mail.
   *Aqui entram os filtros hoje espalhados entre "Filtros rápidos" e "Comunicação".*
5. **O que já aconteceu com ela** — campanhas, mensagens salvas, missões de
   agitação, eventos, contatos de território, última interação.
6. **Qualidade do cadastro** — ciclo de vida (renomeado), duplicidade pendente,
   sem rastreio fino, arquivados.

Ganho principal: "Apto para envio" e "Status do número" deixam de estar em duas
seções diferentes, e "ciclo de vida" sai do topo (onde induz o novato a usá-lo
como se fosse status geral do contato).

Renomeações sugeridas:
- "Cadastro (ciclo de vida)" → **"Situação do cadastro"**, separando as
  marcações manuais para um filtro próprio ("Marcação manual").
- "Tipo de contato" → **"Etiqueta de tipo (informativa)"**.
- "Sem rastreio fino" → **"Sem origem identificada"**.
- "Módulo de origem" → **"Tela onde foi cadastrado"**.

---

## 3. Fidelidade — pontos frágeis encontrados

Ordenados por risco de virar bug relatado.

**A. `Bloqueado = Não` e `Apto para envio = Sim` somem com quem tem ciclo de
vida vazio.** Ambos usam `NOT (lifecycle_status = 'nao_enviar')`. No banco,
`NULL = 'x'` não é falso, é nulo — então todo contato sem `lifecycle_status`
preenchido é descartado silenciosamente. É exatamente o mesmo padrão dos dois
bugs já corrigidos: resultado a menos, sem aviso.

**B. Valores com vírgula, parênteses, aspas ou `%` quebram os filtros de lista.**
A função `safe()` apaga esses caracteres antes de montar a consulta. Isso vale
para cidade, bairro, profissão, instituição, ponto de rastreio, movimento
social, quem indicou. Um bairro chamado "Jardim América (Zona 2)" nunca casa
com ele mesmo — a opção aparece no menu e devolve zero.

**C. Filtros de lista usam `ilike` sem curinga como se fosse igualdade.** Se a
base tiver "São Paulo" e "Sao Paulo", o menu conta as duas juntas e o filtro
traz só uma. Já registrado na auditoria 02 e continua válido.

**D. "Módulo de origem" olha só `primary_source_module`.** Quem foi criado num
módulo e recapturado em outro não aparece pelo módulo mais recente
(`last_source_module` existe e é ignorado). A lista do painel também tem 9
opções, enquanto o banco tem 12 (`importacao`, `manual`, `outro` ficaram fora).

**E. Contagem real só existe para três listas.** Ciclo de vida, status do número
e WhatsApp mostram quantidade e desabilitam opções vazias. Canal, tipo de
formulário, módulo de origem, formas de ajuda e disponibilidade não — então
continuam existindo opções que só devolvem lista vazia, que foi a queixa
original.

**F. Cruzamentos grandes rodam em memória.** Quando o filtro de tags casa muitos
contatos, o sistema baixa até 100 mil IDs por página para cruzar. Funciona, mas
fica lento e tem teto silencioso; vale monitorar antes que vire "a tela travou".

**G. Filtros duplicados no motor.** Existem pares singular/plural
(`cidade`/`cidades`, `origem`/`origens`, `phone_status`/`phone_statuses`…). O
painel usa o plural; o singular continua aceito por URL e por outras telas. Duas
portas para a mesma regra é a receita conhecida de divergência entre telas.

**H. `formas_ajuda` tem tratamento especial só para um valor legado**
(`panfletagem`). Se outros slugs mudaram de nome em algum momento, esses ficam
invisíveis.

**I. `Foi importado = Não`** exige `import_id` e `imported_by_user_id` nulos —
correto hoje, mas depende de as duas colunas serem sempre preenchidas juntas na
importação.

---

## 4. Segurança e visibilidade por papel

Hoje **o painel é idêntico para admin, operador, vrm, comunicação e território**
— não há nenhuma diferenciação por papel na Gestão da Base (a única checagem de
papel na tela é para um botão de exclusão). A proteção real está no banco (RLS),
não na composição do painel.

Dois pontos merecem decisão:

1. **"Captado por" e "Importado por" listam todos os usuários do sistema.** A
   função que alimenta essas listas roda com privilégio administrativo e devolve
   nome e, quando não há nome, **o e-mail** de cada usuário — para qualquer
   pessoa autenticada. É o único ponto onde o painel expõe dado de outro
   usuário. Sugestão: nunca cair no e-mail como rótulo, e restringir a lista
   completa a admin/operador.
2. **"Dados sensíveis" e "Consentimento LGPD"** são filtros de conformidade.
   Filtrar por eles é legítimo, mas hoje qualquer papel pode montar uma lista de
   "quem autorizou dados sensíveis". Vale avaliar se isso deveria ser de
   admin/operador.

Fora isso, os filtros em si não expõem informação além da que a tabela já
mostra. Não há filtro que revele dado que o papel não pudesse ver de outro jeito.

---

## 5. Campos sem função real (decorativos)

Confirmado: **`tipo_contato` é só etiqueta** — é gravado na importação e nos
formulários, aparece na ficha e no filtro, e não altera nenhum comportamento
(não afeta envio, missão, campanha nem permissão).

Na mesma situação:

| Campo | Situação |
| --- | --- |
| `tipo_contato` | etiqueta pura |
| `rede_social` | texto livre, nunca lido por lógica |
| `zona_eleitoral` | texto livre, nunca usado |
| `como_conheceu` | texto livre, nunca usado |
| `quem_indicou` | texto livre, nunca usado |
| `coletivo_alicerce` | booleano informativo |
| `participa_movimento_social` / `movimento_social_nome` | informativo |
| `faixa_etaria` | informativo |
| `disponibilidade` | aparece na cópia de contatos para missão, mas não filtra nem prioriza nada automaticamente |
| `whatsapp_status` | tecnicamente funcional, mas **hoje 100% "desconhecido"** — o filtro existe e nunca separa nada, porque a verificação não é rodada |

Isso não é necessariamente errado — segmentar manualmente é um uso legítimo. O
problema é que nada no painel diz "isto é só etiqueta", então a pessoa supõe que
marcar "Voluntário" muda alguma coisa no sistema. Sugestão: marcar visualmente
os campos informativos e agrupá-los, separando-os dos que têm efeito real
(consentimento, opt-out, bloqueio, status do número, arquivado).

---

## 6. Lacunas de filtro

**Os três apontados estão confirmados:**

1. **"Recebeu mensagem de missão de agitação"** — não existe. Os dados existem
   (`agitation_tasks`, `agitacao_contact_logs`), mas o painel só cruza campanhas
   e mensagens salvas. Hoje não dá para responder "quem já foi abordado numa
   missão?" nem "quem nunca foi?".
2. **"Confirmou presença em evento"** — não existe. `event_rsvps` tem os dados,
   inclusive a recusa, e nenhum filtro alcança.
3. **"Veio de um formulário específico"** — só há aproximação. "Ponto de
   rastreio" usa um rótulo de texto e "Tipo de formulário" só distingue completo
   x curto. Não há filtro por `form_definition_id`.

**Outras lacunas do mesmo tipo:**

4. **Data de cadastro** — `created_at` não está no painel (só nos filtros de
   coluna da planilha). É provavelmente a lacuna mais sentida no dia a dia.
5. **Última interação** — não há "sem contato há X dias", nem por campanha, nem
   por território, nem por agitação.
6. **Respondeu alguma mensagem** — `conversations` e `inbound_messages` guardam
   isso; nenhum filtro usa. "Quem já respondeu alguma vez" é a segmentação de
   maior valor da base e está inacessível.
7. **Geocodificação** — `geocoding_status` e ter/não ter coordenadas não estão
   no painel, embora o Mapa dependa disso.
8. **Duplicidade pendente** — não há como listar, na Gestão da Base, quem está
   com par pendente em `contact_duplicates`.
9. **Instalou o app / aceita notificação** — `push_subscriptions` existe e não
   é filtrável.
10. **Pertence a um segmento** — o motor aceita `segment_id`, o painel não expõe.
11. **É usuário do sistema** — o motor aceita `is_system_user` e `system_roles`,
    o painel não expõe, apesar de a auditoria 02 ter apontado a mistura entre
    usuários internos e apoiadores.
12. **Contato de território** — `territory_contact_logs` registra visitas e
    tentativas; nenhum filtro alcança.

---

## Resumo para decisão

| Prioridade | Item |
| --- | --- |
| Alta | Corrigir a exclusão silenciosa de contatos com ciclo de vida vazio (item 3-A) |
| Alta | Tratar caracteres especiais em vez de apagá-los (3-B) |
| Alta | Contagem real em todas as listas, desabilitando opções vazias (3-E) |
| Média | Filtros que faltam: data de cadastro, evento, missão, formulário específico, respondeu |
| Média | Reagrupar as seções por pergunta e renomear os quatro nomes ambíguos |
| Média | Restringir a lista de usuários em "Captado por"/"Importado por" e nunca mostrar e-mail |
| Baixa | Marcar visualmente os campos informativos |
| Baixa | Eliminar os pares singular/plural do motor |
