## Relatório verificado — missão "Convite Plenária PPB" (criada 31/07 13:05 BRT)

Dados lidos direto do banco (tarefas, levas e notificações da missão).

| Pessoa | Recebeu | Leu | Pegou leva | Enviou | Arquivou (erro nº) | Sem ação | Situação real |
|---|---|---|---|---|---|---|---|
| Rafael José dos Santos | sim | 13:06 | 13:06 | 10 | 0 | 0 | Leva fechada 14:45 — 100% enviado |
| Diego Masiero | sim | 13:09 | 13:09 | 6 | 4 | 0 | Leva fechada 14:43 — tudo tratado |
| Mateus Ballardin | sim | 13:55 | 13:55 | 4 | 3 | 3 | Leva fechada 15:12 com 3 contatos sem toque |
| Alison Munhos | sim | — | 13:19 | 1 | 0 | 9 | Leva ainda aberta (em andamento) |
| "Sistema" (conta interna) | sim | — | 14:03 | 0 | 2 | 8 | Leva aberta, 8 contatos travados nessa conta |
| Fabíola Barcelos | sim | 15:57 | não pegou | 0 | 0 | 0 | Só abriu a notificação |

Além disso, 66 contatos da missão nunca foram atribuídos a ninguém.

## O que cada etiqueta do painel do admin significa hoje

- **Não lida** — a pessoa recebeu a notificação e nunca abriu.
- **Lida** — abriu o briefing, mas não clicou em "aceitar/pegar contatos" (caso da Fabíola).
- **Em andamento** — tem leva aberta, sem ter clicado em "avisei que terminei" (Alison e "Sistema").
- **Concluída** — fechou a leva e enviou ao menos 1 mensagem (Rafael, Diego, Mateus).
- **Fechou sem enviar** — fechou a leva com 0 envios (ninguém nesta missão).
- **Liberada pela organização** — o admin liberou a leva parada dela.
- **Cancelada** — a notificação foi cancelada.

Ou seja: as etiquetas medem o **ciclo da leva**, não a qualidade do trabalho. Por isso "Concluída" não garante que os 10 contatos foram tratados — o Mateus fechou com 3 intocados.

## Sobre o relato do Mateus ("0 pendentes" e "apagou meu histórico")

Nada foi apagado: os 4 envios dele estão registrados (13:59, 14:08, 14:08, 14:09) e os 3 arquivamentos por número inválido também. O que causou a confusão são duas palavras diferentes usadas para coisas diferentes na mesma tela:

- **"Pendente"** na barra de filtros = só os que ele marcou "vou enviar depois" → ele tem **0**, então o filtro aparece vazio.
- **"Não enviados"** = os que nunca foram tocados → ele tem **3**.
- O cartão da missão e o painel do admin usam ainda um terceiro texto ("sem envio", "pendentes") para esse mesmo grupo.

Some-se a isso que a atualização de vocabulário de status rodou às **14:47**, no meio da missão: quem estava com a tela aberta antes disso viu rótulos antigos e depois rótulos novos para os mesmos contatos — daí a sensação de "mudou meu histórico". Os dados em si foram convertidos corretamente, sem perda.

## Plano de correção proposto

1. **Um único dicionário de palavras nas três telas** (agitador, cartão de missão, painel do admin), usando `src/lib/agitation-task-status.ts` como fonte única: "Não enviado", "Vou enviar depois", "Enviado", "Arquivado". Fim de "pendente/sem envio/pendentes" com significados diferentes.
2. **Contadores explícitos na tela do agitador**: trocar a linha "X não enviado(s) · Y pendente(s) de envio" por "Enviados X de N · Não enviados Y · Vou enviar depois Z · Arquivados W", para nunca dar "0" sem explicação.
3. **Aviso ao fechar a leva** deixar de dizer "pendentes" e passar a listar exatamente: "Você ainda tem 3 contatos não enviados. Fechar mesmo assim?" — e, se fechar, registrar isso.
4. **Painel do admin — etiqueta honesta**: quando a leva é fechada com contatos intocados, mostrar "Concluída parcialmente (4 de 10)" em vez de só "Concluída", com a legenda das etiquetas visível na tela (tooltip/ajuda) explicando Lida / Em andamento / Fechou sem enviar.
5. **Recuperar os contatos travados**: 8 contatos na conta "Sistema" e 9 na leva aberta do Alison; e 66 nunca distribuídos. Ação: liberar as levas paradas dessas contas (função já existente, que não mexe em arquivados) e redistribuir, deixando claro no painel quantos voltaram para o pool.
6. **Investigar a conta "Sistema"** aparecendo como destinatária de missão — provavelmente não deveria receber notificação nem pegar contatos; se confirmar, excluí-la da lista de elegíveis.

### Detalhes técnicos
- Arquivos: `src/lib/agitation-task-status.ts` (rótulos únicos), `src/routes/_authenticated/minhas-missoes.tsx` (contadores/confirmação), `src/routes/_authenticated/missoes-agitacao.$missionId.tsx` (etiqueta parcial + legenda), `src/lib/agitation-missions.functions.ts` (expor `awaiting`/`pending`/`sent` com nomes coerentes).
- Sem mudança de schema; itens 5 e 6 usam `release_mission_pending` e a lista de elegíveis existentes.
