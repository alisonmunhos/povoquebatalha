## Etapa 1 — Barra de ações em massa no celular

Onde: `src/routes/_authenticated/contatos.index.tsx` (barra fixa por volta das linhas 453-580) e a barra de busca/ações logo acima (linha ~390).

O que causa o arrasto lateral: os blocos internos usam `flex-wrap`, mas dentro deles há elementos com largura mínima fixa (a busca tem `min-w-[260px]`, os grupos "Tags / Status / Ações / Exportar" ficam lado a lado sem permissão de encolher). Em tela de ~360px isso já estoura sozinho.

Mudança:
- Em telas pequenas, empilhar: cada grupo vira uma linha inteira (grid de 1 coluna no mobile, linha horizontal a partir de `sm:`).
- Trocar larguras mínimas fixas por `min-w-0` + `w-full` no mobile.
- Selects e botões com largura total no mobile, para caber sem rolagem.
- Contador de selecionados em linha própria, com truncagem.

Verificação: emulação em 360px e 390px, conferindo que não existe rolagem horizontal. Depois, typecheck.

---

## Etapa 2 — Correções de alta prioridade nos filtros

Arquivos: `src/lib/crm-filters.ts`, `src/lib/crm-filter-options.functions.ts`, `src/components/ContactFiltersPanel.tsx`.

1. **Vazio sumindo**: nos filtros "Bloqueado = Não" e "Apto para envio = Sim", trocar a negação simples por uma condição que aceite também o campo vazio (`situação diferente de "não enviar"` OU `situação vazia`). Conferir antes/depois com contagem real no banco (~15 contatos hoje).
2. **Caracteres especiais**: `safe()` hoje apaga `, ( ) " %`. Passar a envolver o valor em aspas e escapar aspas internas (formato aceito pelo PostgREST), preservando o texto original. Testar com um valor que contenha parênteses e vírgula.
3. **Contagem em todas as listas**: o servidor já devolve contagem para canal, tipo de formulário, módulo de origem, formas de ajuda e disponibilidade — falta a UI usar. Passar `count` para esses seletores e desabilitar opção com zero, igual já é feito em "Cadastro (ciclo de vida)".

Ao final: typecheck + teste real dos 3 pontos.

---

## Etapa 3 — Filtros "contém" viram seleção de respostas existentes

Boa notícia confirmada na leitura: o servidor **já** calcula e devolve a lista de respostas distintas com contagem para profissão, quem indicou, rede social, zona eleitoral, como conheceu e movimento social (`getContactFilterOptions`), e o motor de filtros **já** aceita seleção múltipla (`profissoes`, `quem_indicou_values`, `zona_eleitoral_values`, `como_conheceu_values`, `movimentos_sociais`, `instituicoes`). Ou seja: quase tudo que falta é a interface.

Trabalho:
- Em `ContactFiltersPanel.tsx`, trocar as caixas de texto de profissão, instituição/onde trabalha, rede social, quem indicou, zona eleitoral, como conheceu e movimento social pelo mesmo componente de múltipla escolha usado em Tags/Disponibilidade (busca dentro do menu, seleção múltipla, combinação por OU, opção "(Vazio)").
- Em `crm-filters.ts`, criar a chave plural que falta (`rede_social_values`) seguindo o padrão das outras; manter as chaves antigas funcionando por compatibilidade de links já compartilhados.
- Manter texto livre em nome, e-mail, telefone e observações (valor único por pessoa).

Eficiência: nada de consulta a cada tecla — a lista de respostas vem de uma única chamada já existente, cacheada por 5 minutos; a digitação filtra a lista **no navegador**.

Risco conhecido: "quem indicou" e "profissão" podem ter centenas de valores distintos. Mitigação no mesmo componente: lista virtualizada/limitada às 200 mais frequentes com aviso "refine a busca para ver mais", e a busca interna passa a consultar a lista completa carregada.

---

## Etapa 4 — Filtros que faltam

Cada um envolve `crm-filters.ts` (motor), `crm-filter-options.functions.ts` (opções) e `ContactFiltersPanel.tsx` (interface).

1. **Recebeu mensagem de missão de agitação** — Sim/Não + escolha da missão específica (lista das missões não arquivadas). Base: tarefas de agitação marcadas como enviadas/concluídas.
2. **Confirmou presença em evento** — Confirmou / Recusou / Não respondeu, com escolha do evento. Base: RSVPs.
3. **Veio de um formulário específico** — lista de formulários do construtor (o dado já existe no contato).
4. **Data de cadastro** — período com atalhos (7/30/90 dias, personalizado). O motor já entende faixa de data; falta o controle no painel.
5. **Respondeu alguma mensagem** — Sim/Não, com base em mensagens recebidas do contato.

Como os três primeiros e o quinto dependem de outras tabelas, a filtragem será feita por lista de IDs em memória, com paginação interna (mesmo padrão já usado para segmentos/campanhas), evitando estourar limites da API.

---

## Etapa 5 — Reorganização das seções + segurança

1. **Seis grupos por pergunta**, conforme a seção 2 do estudo: Quem é / Onde está / Como entrou / Posso falar com essa pessoa? / O que já aconteceu / Qualidade do cadastro. Inclui as renomeações ("Cadastro (ciclo de vida)" → "Situação do cadastro", separando as marcações manuais). Os filtros novos da Etapa 4 entram em "Como entrou" (formulário), "O que já aconteceu" (missão, evento, respondeu) e "Qualidade do cadastro" (data de cadastro). Só reorganização visual — as chaves de filtro e os links já compartilhados continuam válidos.
2. **E-mail em "Captado por" / "Importado por"**: nunca usar e-mail como rótulo; quando não houver nome, mostrar "Usuário sem nome" com um identificador curto. Além disso, restringir a lista completa de usuários a admin/operador; outros papéis veem apenas a si mesmos.

---

## Etapa 6 — Limpeza final

1. Marcar com um texto pequeno "informativo — não afeta envios" os filtros que são só etiqueta: tipo de contato, rede social, zona eleitoral, como conheceu, quem indicou, coletivo, movimento social, faixa etária, disponibilidade.
2. Remover os pares singular/plural redundantes no motor (`cidade`/`cidades`, `origem`/`origens`, `phone_status`/`phone_statuses` etc.), mantendo o plural, **após** confirmar por busca no código que nenhuma outra tela (planilha BI, exportação, segmentos, campanhas) usa a forma singular. Se algum link público antigo depender, manter uma conversão silenciosa da forma antiga.

Ao final: typecheck.

---

## Decisões que preciso confirmar

1. Na Etapa 3, para campos com muitos valores distintos (profissão, quem indicou): tudo bem limitar a lista às 200 respostas mais frequentes, com busca cobrindo o restante?
2. Na Etapa 5, restringir a lista de usuários em "Captado por"/"Importado por" a admin e operador é aceitável, ou outros papéis também precisam ver todos?
3. Ordem de execução: sigo 1 → 2 → 3 → 4 → 5 → 6 numa sequência só, ou prefere aprovar etapa por etapa?
