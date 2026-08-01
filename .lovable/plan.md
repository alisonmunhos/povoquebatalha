## Diagnóstico (confirmado no banco)

O cartão do faylon mostra **3 conexões (0 mensagens + 3 cadastros)**, mas o correto é **8**.

Consulta ao banco:

- faylon tem **5 tarefas com status "enviado"**, todas atribuídas ao **contato** dele (`assigned_contact_id`), nenhuma ao usuário (`assigned_user_id`).
- O cálculo da jornada (`src/lib/impact-stats.server.ts`) conta mensagens **somente** por `assigned_user_id`. Por isso aparece 0 mensagens.
- Os 3 cadastros estão certos: 3 contatos captados por ele (eventos `contato_criado`/`cadastro_completo` fora de importação, já sem duplicar o mesmo contato).

Ou seja: a tela de desempenho já foi corrigida para ligar contato → usuário, mas a **jornada não recebeu a mesma correção**. Afetados hoje: **faylon (5), Iago Cunha (5), Ezequiel (2), Matheus Bertolo (1), Betina (1), Tzusy (1)** — todos aparecem com 0 mensagens na jornada.

Também confirmei que a atribuição de cadastro sempre usa o usuário (`source_user_id`); não há evento órfão ligado só ao contato. E que 35 das 117 tarefas "enviado" não têm data de conclusão preenchida — o cálculo já usa a data de atualização como reserva, então o gráfico dos 7 dias não quebra, mas conta a data da última alteração.

## Correção

**1. Jornada passa a contar as mensagens atribuídas por link** (`impact-stats.server.ts`)
- Buscar o `contact_id` do perfil do usuário e somar as tarefas com `assigned_contact_id = contact_id`, além das já contadas por `assigned_user_id`.
- Remover duplicatas por id de tarefa (uma tarefa nunca conta duas vezes).
- Isso corrige de uma vez: cartão geral, cartão do dia, cartão da semana, gráfico dos 7 dias, ofensiva (dias seguidos), faixa da jornada na tela de Agitação e a notificação de sábado — todos usam esse mesmo cálculo.

**2. Regra única de "conexões"**
- Deixar explícito no código, num único lugar comentado, que conexão = mensagem enviada em missão (autodeclarada) + contato adicionado pela pessoa, sem repetir o mesmo contato.
- A tela de desempenho passa a usar exatamente a mesma resolução contato → usuário que a jornada, para os dois números nunca divergirem.

**3. Clareza do período (evita a sensação de número errado)**
- Na tela de desempenho, o filtro de período (7/30/90 dias) limita cadastros e missões, enquanto o cartão da jornada é sempre o total desde o começo. Vou rotular as colunas como "no período selecionado" e avisar, ao abrir "Mandar jornada", que o cartão mostra o total geral. Assim a diferença fica compreensível em vez de parecer inconsistência.

**4. Transparência no próprio cartão/jornada**
- Manter o rodapé com a quebra "X mensagens · Y cadastros" (já existe) e garantir que a soma sempre feche com o número grande de conexões — inclusive no singular/plural.

## Qualidade e segurança das informações (verificação)

- A jornada de outra pessoa (`?userId=`) só carrega depois de checagem de papel no servidor (admin/vrm/operador); usuário comum só vê a própria. Vou reconferir esse caminho e manter assim.
- Nada nesta mudança escreve no banco: é só leitura e apresentação. Sem migration, sem alteração de permissões, sem mexer em rotas públicas.
- Usuários com acesso revogado continuam fora do ranking; contatos marcados como usuários internos continuam fora da contagem de cadastros.

## Onde testar

- `/meu-impacto` e `/minha-semana` com `?userId=` do faylon: deve mostrar **8 conexões (5 mensagens · 3 cadastros)**.
- `/missoes-agitacao/desempenho`: coluna Conexões dos 6 nomes citados deve bater com o cartão (considerando o período selecionado).
- `/agitacao` com um desses usuários: faixa da jornada com o número novo.
