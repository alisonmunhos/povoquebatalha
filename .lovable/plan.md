## Sobre o "10": confirmado no código

O `10` não está escrito na tela — é o valor da coluna `batch_size` da missão. O problema real é **onde ele pode ser definido**:

- `CreateMissionModal.tsx` e `EditMissionModal.tsx` **não têm nenhum campo** de tamanho da leva nem de cooldown (verificado: nenhuma ocorrência de `batch_size`/`cooldown`). Então toda missão nasce com o padrão do banco: leva 10, cooldown 60 min.
- O operador só consegue escolher esses valores **depois**, no modal "Abrir para auto-atribuição" (`OpenMissionModal.tsx`).
- Pior: o alerta de notificação mostra "leva de 10" mesmo em missão de **atribuição direta** (como "Convite Plenária", que está `is_open = false` e teve os 53 contatos atribuídos de uma vez pelo coordenador). Aí o número não significa nada.

Já o **53** é o `contact_count` do briefing: conta todas as tarefas da missão, não o que é seu.

---

## Plano revisado

### 1. Operador define o tamanho da leva e o cooldown na criação
- Adicionar em `CreateMissionModal` (e em `EditMissionModal`, enquanto a missão não estiver arquivada) os campos **"Contatos por leva"** e **"Cooldown entre levas (minutos)"**, com os mesmos limites já usados no `OpenMissionModal` (leva 1–100, cooldown 0–1440) e os padrões atuais como valor inicial.
- A função de criação/edição de missão passa a gravar `batch_size` e `cooldown_minutes`.
- O `OpenMissionModal` continua existindo e passa a **pré-carregar os valores já definidos na missão** (em vez de recomeçar em 10/60), permitindo ajustar na hora de abrir.
- Nenhum número fixo em tela: tudo lê `mission.batch_size` / `mission.cooldown_minutes`.

### 2. Briefing da notificação com números reais
`getMissionNotificationBriefing` passa a devolver também: tipo da missão (aberta x atribuição direta), se o usuário já tem leva aberta e quantas tarefas dela estão pendentes/enviadas/não enviadas, contatos livres no pool, se pode pegar novo lote, motivo do bloqueio e horário de liberação do cooldown.

### 3. Texto do alerta ajustado ao caso
- **Com leva aberta**: "Sua leva: 53 contato(s) · 47 pendente(s)" — sem "público-alvo" e sem "leva de N".
- **Missão aberta e sem leva**: "Você vai receber uma leva de {batch_size} contato(s) · {N} disponíveis".
- **Atribuição direta**: nunca exibir "leva de N".

### 4. Botão contextual (o pedido principal)
- **Já tem leva / contatos atribuídos** → "Abrir minha missão (N pendentes)" — entra na missão, não cria lote novo.
- **Pode pegar lote** → "Aceitar missão (leva de {batch_size})".
- **Em cooldown** → botão desabilitado com "Disponível em Xh Ymin" + link "Ver minhas missões".
- **Fechada / pausada / sem contatos** → aviso explicativo e link para minhas missões.

### 5. Erros deixam de ser engolidos
Hoje o `catch` faz `console.error` e redireciona, parecendo sucesso. Passa a exibir a mensagem do servidor (toast) e manter o alerta aberto.

### 6. Entrar direto na missão pela notificação
`/minhas-missoes` aceita `?mission=<id>`: ao abrir, rola e destaca a missão correspondente.

### 7. Cooldown visível em "Minhas missões"
Contagem regressiva ("Novo lote disponível em X min") no cartão, com o botão de pegar lote desabilitado enquanto durar.

## Detalhes técnicos
- Arquivos: `src/lib/agitation-missions.functions.ts`, `src/components/CreateMissionModal.tsx`, `src/components/EditMissionModal.tsx`, `src/components/OpenMissionModal.tsx`, `src/components/NotificationBell.tsx`, `src/routes/_authenticated/minhas-missoes.tsx`.
- Sem migration: as colunas `batch_size` e `cooldown_minutes` já existem em `agitation_missions`, e `claim_mission_batch` já bloqueia leva aberta e cooldown. O que falta é a interface deixar configurar e respeitar isso.
- Sem mudança no modelo de dados e sem impacto em links públicos.
