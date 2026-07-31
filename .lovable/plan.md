## Diagnóstico confirmado

Há três falhas combinadas:

1. O banco ainda mantém **duas versões** de `release_mission_pending`. A versão antiga, com 1 parâmetro, continua liberando **todas** as tarefas pendentes e marcando levas abertas como concluídas. A interface pode continuar chamando justamente essa versão.
2. A nova leva do Ezequiel foi aceita às 15:25 e registrou `task_count = 10`, porém hoje possui **zero tarefas vinculadas**; os 10 contatos voltaram para o conjunto de 240 disponíveis. A leva ficou aberta, mas vazia — por isso “Abrir minha missão” não encontra nada.
3. O briefing usa leitura protegida no servidor, mas “Minhas missões” ainda depende de consultas incompatíveis com as permissões do agitador. A navegação chega à rota, porém a missão pode não ser reconstruída corretamente. Além disso, o parâmetro `?mission=` hoje serve apenas para rolar a tela, não garante a abertura/restauração da missão.

## Plano de correção

### 1. Corrigir definitivamente o banco
- Remover a assinatura antiga `release_mission_pending(uuid)`.
- Manter uma única função segura, com idade mínima, que nunca conclui uma leva automaticamente.
- Tornar o aceite atômico: só criar a leva se ao menos um contato for realmente atribuído; `task_count` será a contagem real, nunca uma estimativa.
- Tornar “Avisar que concluí” a única ação normal que define `completed_at`; tarefas ainda pendentes não serão falsamente marcadas como enviadas.

### 2. Reparar a missão atual sem recriá-la
- Reatribuir 10 contatos disponíveis à leva aberta do Ezequiel, preservando a leva já aceita.
- Recalcular `task_count` a partir dos vínculos reais.
- Não apagar contatos, envios ou resultados existentes.

### 3. Unificar a leitura da experiência do agitador
- Fazer `listMyMissions` retornar missão, leva aberta e tarefas do próprio usuário por uma única função protegida no servidor.
- Considerar uma missão “aberta para o usuário” enquanto houver uma leva não concluída e não cancelada.
- Se existir uma leva aberta inconsistente/vazia, reparar automaticamente com contatos disponíveis ou retornar um estado claro, sem cooldown e sem falso “concluído”.

### 4. Garantir abertura pelos dois botões
- “Aceitar missão”: aceitar, validar que contatos foram atribuídos, atualizar os dados e navegar para `/minhas-missoes?mission=<id>`.
- “Abrir minha missão”: navegar diretamente sem tentar aceitar novamente.
- Na tela de destino, usar `mission` para localizar, expandir e focar a missão correta; manter isso funcionando ao voltar à notificação ou recarregar a página.
- Fechar o modal somente depois que a navegação for iniciada, evitando clique sem efeito.

### 5. Confiabilidade e validação
- Painel do admin passa a usar contagens reais de tarefas vinculadas e resultados registrados, não apenas `task_count` ou `completed_at`.
- Testar os fluxos: primeiro aceite, reabertura pela notificação, reabertura por “Minhas missões”, recarregamento, conclusão manual e tentativa de pegar nova leva.
- Confirmar no banco que uma leva aberta conserva seus contatos e só recebe `completed_at` após confirmação explícita do usuário.