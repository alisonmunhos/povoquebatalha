## Parte 1 — Ícone nos cartões "Minha Jornada"

Aprovando a versão em anexo (`opcao-c-icone-do-celular.png`), farei:

- Publicar essa imagem como asset do projeto (`app-icon-squircle.png`) e usá-la em `src/components/ImpactShareCard.tsx` no lugar do `fist-mark-transparent.png` atual, que estava cortando o pulso.
- Exibir como selo do app: quadradinho arredondado (como no celular), tamanho controlado, posicionado entre o headline e o gráfico, mantendo o efeito de burst atrás.
- Aplicar nas 3 variações do cartão (geral, do dia, da semana).
- Remover o asset antigo `fist-mark-transparent.png` se não houver outro uso.

## Parte 2 — Jornada dos responsáveis atribuídos por link

Diagnóstico confirmado por consulta ao banco: as tarefas de faylon, Iago, Ezequiel, Betina, Tzusy e Matheus Bertolo foram atribuídas ao **contato** (`assigned_contact_id`), não ao usuário. Todos eles **têm conta**, ligada por `profiles.contact_id`. A tela de desempenho só monta o link da jornada quando existe `assigned_user_id`, por isso aparece "—" mesmo com 100% de envios.

Correção:

- Em `src/lib/agitation-performance.functions.ts`, ao montar a lista de responsáveis, resolver o `userId` também pelo caminho contato → `profiles.contact_id`.
- Consolidar linhas duplicadas do mesmo responsável (hoje Diego Masiero aparece duas vezes: uma por conta, uma por link), somando atribuídos/enviados.
- `AssigneeRanking.tsx` passa a exibir o botão "Ver jornada" para esses casos; quem realmente não tem conta continua com "—" e um tooltip explicando que a pessoa não tem cadastro no app.

## Detalhes técnicos

- A jornada já conta as tarefas autodeclaradas como enviadas (`impact-stats.server.ts` usa `agitation_tasks.status = 'enviado'`), então os números da jornada vão bater com o ranking — não há mudança de regra de cálculo.
- Nenhuma migration necessária; a mudança é de leitura/apresentação.
- Sem alterações em RLS, dados ou rotas públicas.

## Onde testar

- `/missoes-agitacao/desempenho` → coluna Jornada dos 6 responsáveis citados.
- `/meu-impacto` e `/minha-semana` → novo selo do app nos cartões de compartilhamento.
