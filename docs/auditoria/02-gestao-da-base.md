# 02 — Diagnóstico da Gestão da Base

> Auditoria conceitual — Entrega 1. Cada afirmação abaixo foi conferida no
> código e validada com consulta ao banco. Nenhuma alteração foi feita.

## Resumo executivo

Foram confirmados **9 problemas**, sendo 4 críticos. Todos têm a mesma causa de
fundo: **regras de leitura duplicadas em vez de centralizadas**. O motor de
filtros (`crm-filters.ts`) é único, mas os valores padrão, os rótulos e as
listas de opções são montados de forma independente por cada tela.

| # | Problema | Gravidade | Sintoma que o usuário vê |
| --- | --- | --- | --- |
| 1 | Opção de filtro que nunca tem resultado | Crítico | "cliquei e não veio nada" |
| 2 | Contato com telefone contado como "sem telefone" | Crítico | número aparece na ficha, não na tabela |
| 3 | Padrão de arquivados divergente entre telas | Crítico | totais diferentes para a mesma pergunta |
| 4 | Cópia/seleção em massa trunca silenciosamente | Crítico | copiou 2.000, veio menos |
| 5 | Busca geral ignora acento | Alto | "jose" acha 28 de 41 |
| 6 | Busca geral ignora telefone bruto e campos secundários | Alto | busca por número não acha quem tem número inválido |
| 7 | Chip "Precisa revisão" não conta os inválidos | Alto | chip diz 16, existem 59 problemas reais |
| 8 | Usuários do sistema misturados com apoiadores | Médio | 27 registros inflam toda contagem |
| 9 | Caracteres especiais removidos da busca | Médio | busca por nome com parênteses falha |

---

## 1. Opções de filtro que nunca retornam nada — CRÍTICO

O menu de status oferece valores do tipo do banco, não valores que existem na
base. Medição real (contatos ativos):

| Valor oferecido no filtro de Número | Contatos que existem |
| --- | --- |
| válido | 3.193 |
| inválido | 59 |
| sem nono dígito | 14 |
| precisa revisão | 2 |
| **sem DDD** | **0** |
| duplicado possível | 0 |

**`sem_ddd` nunca é gravado por nenhuma rotina do sistema.** Os contatos que de
fato estão sem DDD recebem `invalido`. Por isso o filtro "sem DDD" — justamente
o que o usuário mais tentou usar — devolve lista vazia, embora o problema exista
na base. O mesmo vale para `duplicado_possivel` em `phone_status`.

Efeito colateral: o usuário conclui que "o filtro está quebrado", quando na
verdade **o rótulo não corresponde ao dado gravado**.

## 2. Contato com telefone contado como "sem telefone" — CRÍTICO

O filtro "(Vazio)" de telefone testa `phone_e164` e `phone_raw` de forma
inconsistente com o que a tabela exibe. Medição:

- Contatos que o sistema classifica como sem telefone: **72**
- Contatos que realmente não têm nenhum número: **61**
- Diferença: **11 contatos que têm número digitado mas nenhum número formatado**

Esses 11 são exatamente os casos relatados: a ficha mostra o número (ela lê o
campo bruto), a tabela não mostra (ela lia só o formatado) e o filtro os joga no
balde "vazio". A tabela já foi corrigida em turno anterior para exibir o número
bruto; **o filtro e as contagens ainda não foram**.

## 3. Padrão de arquivados divergente entre telas — CRÍTICO

| Tela | Padrão | Total exibido |
| --- | --- | --- |
| Gestão da Base | inclui arquivados | 3.289 |
| Planilha / BI | exclui arquivados | 3.270 |
| Mapa, Segmentos, Campanhas | não define padrão | depende do que o chamador enviar |

Além disso, os esquemas de validação das funções de servidor usam
`crmFilterSchema.partial()`, o que **remove o valor padrão** definido no esquema.
Resultado: quando o front não manda `archived` explicitamente, o servidor não
aplica nenhum recorte e arquivados entram. Isso afeta contagem de segmento,
audiência de campanha e exportação.

Consequência prática: um contato arquivado pode ser **incluído numa campanha**
mesmo tendo sido arquivado justamente para não receber mensagens.

## 4. Seleção e cópia em massa truncam silenciosamente — CRÍTICO

A função que copia contatos formatados busca todos os IDs selecionados numa
única consulta, sem dividir em lotes e **sem checar erro de retorno**. Com
seleção grande (a interface permite "selecionar todos os filtrados"), a consulta
excede o limite de tamanho aceito pelo banco e retorna vazio ou parcial — e o
código segue adiante como se estivesse tudo certo.

O usuário copia 2.000 contatos e recebe menos, sem nenhum aviso. Este é o mesmo
padrão de falha que já causou o bug da exportação CSV que voltava só com
cabeçalho.

## 5. Busca geral ignora acentos — ALTO

A busca usa comparação simples, sem remover acentuação:

- buscar `jose` encontra **28** contatos
- existem **41** contatos cujo nome contém "josé/jose"
- **13 pessoas ficam invisíveis** para quem digita sem acento

Em uma base brasileira montada por digitação e importação, isso é perda
sistemática, não caso isolado.

## 6. Busca geral não cobre todos os campos de contato — ALTO

Os campos varridos pela busca não incluem `phone_raw`, `email_secundario`,
`phone_secundario` nem `nome_social`. Efeito medido: **10 contatos só podem ser
encontrados pelo número bruto** — exatamente os que têm número com problema, ou
seja, os que mais precisam ser localizados para correção.

## 7. Chip "Precisa revisão" subconta o problema — ALTO

O chip soma `precisa_revisao + sem_ddd + sem_nono_digito` = 2 + 0 + 14 = **16**.
Ficam de fora os **59 contatos com número inválido** e os 59 marcados como
`telefone_invalido` no cadastro. O painel diz que há 16 números a arrumar; há
pelo menos 75.

## 8. Usuários do sistema misturados aos apoiadores — MÉDIO

27 contatos são contas do próprio sistema (`is_system_user`). Nenhuma listagem
os separa por padrão. Eles entram em contagem de base, em audiência de campanha
e em missão de agitação — o coordenador pode receber a tarefa de "agitar" a si
mesmo.

## 9. Sanitização agressiva da busca — MÉDIO

Antes de consultar, o sistema remove caracteres como vírgula, parênteses,
aspas e `%` do termo digitado. **15 contatos têm esses caracteres no nome**
(ex.: apelido entre parênteses). Buscar pelo nome exato falha. O caractere `%`
tem o problema oposto: quando vem de uma opção de menu, é interpretado como
curinga e amplia o resultado silenciosamente.

---

## Correspondência filtro → resultado

Verificação de que cada filtro tem contrapartida real no banco:

| Grupo de filtro | Corresponde a dado real? | Observação |
| --- | --- | --- |
| Cadastro (lifecycle) | Sim | 4 dos 10 valores possíveis existem hoje |
| Número (phone_status) | **Parcial** | `sem_ddd` e `duplicado_possivel` sempre vazios |
| WhatsApp | **Sem uso** | 100% dos contatos estão como "desconhecido" |
| Origem | Sim | 4 valores em uso |
| Geocodificação | Sim | 97% pendente |
| Cidade / Bairro / Profissão | Sim | menu monta a partir dos dados reais |
| Tags, Segmentos, Campanhas | Sim | listas vindas das próprias tabelas |
| Datas | Sim | — |

Sobre os menus montados a partir dos dados (cidade, bairro, profissão): eles
agrupam variações ignorando acento e maiúscula para contar, mas filtram pelo
texto de um único rótulo. Hoje isso é inofensivo (só 2 casos de variação, ambos
resolvidos por diferença de maiúscula), mas o mecanismo é frágil: se surgir
"São Paulo" e "Sao Paulo" na mesma base, o menu mostrará contagem somada e o
filtro trará só metade.

---

## Onde os registros podem "sumir"

1. **Filtro com valor que não existe** (`sem_ddd`) → lista vazia.
2. **Termo de busca com acento ou caractere especial** → registros omitidos.
3. **Combinação de filtros em blocos separados** → cada bloco é obrigatório
   simultaneamente; um contato com o campo em branco cai fora de todos.
4. **Seleção em massa acima do limite** → cópia/ação parcial sem aviso.
5. **Arquivado incluído ou excluído conforme a tela** → total muda de tela para tela.

## Pontos fortes confirmados

- Motor de filtros único e reaproveitado por CRM, BI, mapa, segmentos e campanhas.
- Histórico de alterações e de origem gravado de forma consistente.
- Filtros, ordenação e paginação já sincronizados com a URL (estado compartilhável).
- Regras de permissão ativas em todas as tabelas sensíveis.
- Detecção automática de duplicados por gatilho no banco.

## Prioridade sugerida (sem implementar nada agora)

1. Alinhar um padrão único de arquivados e aplicá-lo no servidor, não na tela.
2. Fazer o conceito de "tem telefone" ser um só, usado por tabela, filtro e contagem.
3. Esconder ou renomear opções de filtro sem correspondência real.
4. Lotear toda operação em massa e nunca ignorar erro de consulta.
5. Tornar a busca insensível a acento e cobrir os campos secundários.
