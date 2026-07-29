# 05 — Fonte Única da Verdade

> Auditoria conceitual — Entrega 2. Levantamento das regras de negócio que hoje
> têm **mais de uma implementação concorrente**, com indicação de qual delas é a
> referência natural para virar a implementação única.

## Como ler este documento

Para cada regra:
- **Implementações concorrentes** — onde a mesma decisão é tomada de novo;
- **Divergência real** — o que muda de uma para outra, com número medido;
- **Referência natural** — a implementação existente mais completa e mais bem
  posicionada para virar a única;
- **Custo** — se resolver exige só centralizar, ou também mexer em banco/tela.

---

## Regra 1 — "Contato ativo" (arquivado entra ou não?)

**Implementações concorrentes:** 20+ arquivos. Cada função de servidor decide
sozinha se acrescenta o recorte de não arquivado.

| Local | Comportamento |
| --- | --- |
| Gestão da Base | inclui arquivados por padrão (3.289) |
| Planilha / BI | exclui (3.270) |
| Motor de filtros | só aplica se o chamador pedir explicitamente |
| Mapa, segmentos, campanhas | não pedem → arquivados entram |
| Opções dos menus de filtro | exclui |
| Painel principal | mistura os dois na mesma tela |

**Divergência real:** 19 contatos entram e saem conforme a tela. Três deles
passam como aptos a receber campanha.

**Causa técnica:** o esquema de filtros define um padrão sensato ("não
arquivado"), mas todas as funções de servidor usam a variante `.partial()`, que
**descarta os padrões**. O padrão existe e nunca é aplicado.

**Referência natural:** o próprio `crmFilterSchema` / `applyCrmFilters`
(`src/lib/crm-filters.ts`). É o único ponto por onde os cinco módulos já
passam. Basta que a normalização do padrão aconteça **dentro** do motor, e não
em cada chamador.

**Custo:** só centralização. Nenhuma mudança de banco ou de tela.

---

## Regra 2 — "Apto a receber mensagem"

**Implementações concorrentes: 6.**

| Local | Consentimento | Opt-out | Arquivado | Telefone usado | `nao_enviar` |
| --- | --- | --- | --- | --- | --- |
| Prévia da audiência | sim | sim | sim | formatado | não |
| Criação da campanha | sim | sim | sim | formatado | não |
| Detalhe da campanha | sim | sim | sim | formatado | não |
| Preparação de destinatários | sim | sim | sim | formatado | não |
| Pré-checagem do lote | sim | sim | **não** | formatado | não |
| **Motor de envio** | sim (só campanha) | sim | **não** | **candidato → formatado** | não |

**Divergência real:** o motor de envio aceita arquivado; a pré-checagem do lote
usa um campo de telefone diferente do motor; ninguém respeita o bloqueio manual
`nao_enviar`.

**Referência natural:** `src/lib/wa-send.server.ts`. Ele já é o funil por onde
todo envio passa, já documenta a precedência correta do telefone
(candidato de WhatsApp → número formatado) e já padroniza o motivo da recusa.
É o candidato óbvio a expor uma função única `podeReceberMensagem(contato)` que
os outros cinco pontos consumiriam em vez de reescrever.

**Custo:** só centralização.

---

## Regra 3 — "Tem telefone"

**Implementações concorrentes: 4 definições diferentes.**

| Local | Definição |
| --- | --- |
| Tabela da Gestão da Base | número formatado, com o bruto como reserva |
| Filtro "(Vazio)" | testa os dois campos, mas com combinação diferente |
| Campanhas / missões | só o número formatado |
| Motor de envio | candidato de WhatsApp → número formatado |

**Divergência real:** 11 contatos têm número digitado e nenhum número
formatado. Aparecem na ficha, aparecem na tabela (após a correção recente),
mas somem do filtro, das campanhas e das missões.

**Referência natural:** a precedência do motor de envio
(candidato → formatado → bruto), porque é a única que reflete o que de fato
pode ser usado para contatar a pessoa. Ela deveria virar um único helper de
leitura usado por tabela, filtro, exportação, campanha e missão.

**Custo:** só centralização.

---

## Regra 4 — "Número precisa de revisão"

**Implementações concorrentes: 2.**

| Local | Lista de status considerada |
| --- | --- |
| Chip rápido | precisa_revisao, sem_ddd, sem_nono_digito → 16 |
| Coluna / filtro de número | todos os valores do tipo, inclusive os que nunca ocorrem |

**Divergência real:** 59 contatos com número inválido — os que realmente estão
sem DDD — não entram em nenhum dos dois. E `sem_ddd` é oferecido no menu apesar
de nunca ser gravado (0 registros).

**Referência natural:** a rotina de normalização do banco (gatilho de telefone)
é quem define os estados possíveis. A lista exibida na interface deveria ser
derivada dela + das contagens reais, não escrita à mão em dois lugares.

**Custo:** centralização resolve a inconsistência. Renomear/retirar `sem_ddd` do
menu é ajuste de rótulo (sem mudança de modelo).

---

## Regra 5 — Busca textual

**Implementações concorrentes: 4.**

| Local | Campos varridos | Acento |
| --- | --- | --- |
| Motor de filtros (CRM/BI) | nome, e-mail, telefone formatado, cidade, bairro… | ignora acento? **não** |
| Território | nome, telefone formatado, cidade, bairro | não |
| Agitação | nome, telefone formatado, cidade, bairro | não |
| Caixa de entrada | telefone e nome do remetente | não |

**Divergência real:** buscar `jose` encontra 28 de 41 pessoas. 10 contatos só
são localizáveis pelo número bruto, que nenhuma das quatro buscas cobre. 15
contatos têm caracteres no nome que a sanitização remove.

**Referência natural:** a busca do motor de filtros (`crm-filters.ts`) — é a
mais completa e a única que já trata sanitização. Território, agitação e caixa
de entrada deveriam consumi-la em vez de montar a própria.

**Custo:** centralização resolve a duplicação. Tornar a busca insensível a
acento é a única mudança que se beneficia de apoio do banco (índice), mas
funciona sem ele.

---

## Regra 6 — Consultas em lote (seleção grande)

**Implementações concorrentes: uma correta, várias ausentes.**

| Local | Divide em lotes? | Checa erro? |
| --- | --- | --- |
| Exportação CSV (`fetchContactsBatched`) | **sim** | sim |
| Desfazer importação | sim | sim |
| Cópia de contatos formatados | **não** | **não** |
| Audiência de campanha | não (corta em 20.000) | parcial |
| Criação de missão | não (corta em 20.000) | parcial |
| Ações em massa da planilha | não | parcial |

**Divergência real:** operações acima de ~1.000 itens podem retornar parcial ou
vazio **sem erro visível**. Foi exatamente essa a causa do bug do CSV que voltava
só com cabeçalho — corrigido em um lugar, mantido em cinco outros.

**Referência natural:** `fetchContactsBatched` em `src/lib/crm-bulk.functions.ts`.
Já está pronto, já divide em lotes e já propaga erro. É o padrão a ser adotado
por toda leitura por lista de IDs.

**Custo:** só centralização. É provavelmente a correção de maior impacto por
menor esforço de toda a auditoria.

---

## Regra 7 — Contagem de público (segmento × campanha)

**Implementações concorrentes: 3** (contagem do segmento, prévia da campanha,
audiência final do disparo). Cada uma resolve tags de um jeito e nenhuma
normaliza arquivado.

**Divergência real:** o número mostrado ao salvar um segmento não é
necessariamente o número que a campanha vai enviar.

**Referência natural:** a resolução de audiência da campanha
(`buildAudienceIds`), que já cobre os três casos (lista fixa, segmento
estático, segmento dinâmico). A contagem do segmento deveria chamá-la em vez de
refazer a consulta.

**Custo:** só centralização.

---

## Regra 8 — Usuário do sistema como contato

**Implementação: nenhuma.** Não existe nenhum ponto que separe os 27 contatos
que são contas do sistema. Eles entram em contagem, em audiência de campanha e
em missão de agitação.

**Referência natural:** o campo já existe (`is_system_user`). Falta uma única
decisão de produto ("usuário conta como apoiador?") e um único lugar que a
aplique — de novo, o motor de filtros.

**Custo:** só centralização, **depois** de uma decisão sua.

---

## Quadro-resumo

| # | Regra | Implementações | Referência natural | Resolve só centralizando? |
| --- | --- | --- | --- | --- |
| 1 | Contato ativo | 20+ | `crm-filters.ts` | Sim |
| 2 | Apto a receber | 6 | `wa-send.server.ts` | Sim |
| 3 | Tem telefone | 4 | precedência do motor de envio | Sim |
| 4 | Número a revisar | 2 | gatilho de normalização do banco | Sim |
| 5 | Busca textual | 4 | busca do `crm-filters.ts` | Sim (acento: melhor com índice) |
| 6 | Consulta em lote | 6 | `fetchContactsBatched` | Sim |
| 7 | Contagem de público | 3 | `buildAudienceIds` | Sim |
| 8 | Usuário como contato | 0 | `crm-filters.ts` | Sim, após decisão |

**Conclusão:** das 8 regras concorrentes, **8 são resolvíveis apenas
centralizando lógica que já existe**. Nenhuma exige mudança no modelo de dados.
Nenhuma exige redesenho de tela. Duas exigem uma decisão de produto antes
(o que é "apoiador"; se arquivado entra no total) — mas a decisão é de uma
linha, e o efeito é global justamente porque passaria a existir um só lugar
onde ela vive.

## Padrão-alvo sugerido (conceitual)

```text
                 ┌───────────────────────────────┐
                 │  regras-de-contato (um lugar) │
                 │  · contatoAtivo()             │
                 │  · temTelefone()              │
                 │  · telefonePreferido()        │
                 │  · podeReceberMensagem()      │
                 │  · numeroPrecisaRevisao()     │
                 │  · buscaTextual()             │
                 │  · lerEmLotes()               │
                 └───────────────┬───────────────┘
   Gestão da Base · BI · Mapa · Segmentos · Campanhas · Missões ·
   Território · Relacionamento · Painel · Exportação · Caixa de entrada
```

Hoje cada caixa de baixo tem a sua cópia. O trabalho não é escrever regra nova —
é **eleger a versão existente mais correta e apagar as outras**.
