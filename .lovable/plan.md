# Construtor de cadastro pelo WhatsApp: layout intuitivo e regras como no construtor de formulário

## Por que hoje é confuso

O editor atual é um único modal comprido com uma lista plana de perguntas numeradas. O motor do robô já entende tipos de etapa (pergunta, menu de opções, passar para atendimento, encerrar e salvar) e caminhos com destino por opção, mas **a tela não tem nenhum controle para criar isso** — ela apenas mostra uma etiqueta cinza quando a etapa já veio assim do roteiro padrão. Ou seja: as regras existem no motor e não existem no construtor. Daí a sensação de não entender como funciona.

## Como vai ficar (mesma lógica do construtor de formulário, adaptada ao chat)

No formulário público a lógica é: **seções** em sequência, e uma pergunta de escolha pode desviar para outra seção. No WhatsApp o equivalente natural é: **caminhos** (trilhas de conversa) em sequência, e um **menu** desvia para outro caminho.

Tela em duas colunas (empilha no celular):

```text
+-------------------------------+-----------------------------+
| CAMINHOS DA CONVERSA          |  PRÉVIA NO WHATSAPP         |
|                               |                             |
| Início (menu)            (1)  |  [bolha] Como podemos       |
|  -> Quero apoiar: Cadastro    |          te ajudar hoje?    |
|  -> Informações: Só infos     |  [ Quero apoiar ]           |
|  -> Falar: Atendimento        |  [ Quero informações ]      |
|                               |  [ Falar com alguém ]       |
| Cadastro completo        (8)  |                             |
| Só informações           (5)  |  ...перguntas seguintes     |
| Atendimento humano       (1)  |                             |
+-------------------------------+-----------------------------+
```

- **Lista de caminhos** à esquerda: cada caminho é um cartão dobrável com nome editável, contador de etapas e resumo de saída ("depois deste caminho: encerrar e salvar" / "vai para X"), igual ao resumo de fluxo das seções do formulário.
- **Prévia de conversa** à direita: as etapas do caminho aberto renderizadas como bolhas de WhatsApp, com os botões e a lista clicável exatamente como a pessoa vai ver. É aqui que a pessoa "entende como funciona" sem precisar testar no celular.
- **Aviso de rótulo longo** na prévia: opção acima de 24 caracteres mostra como a Meta vai cortar o título.

## Como criar regras

Cada etapa passa a ter, em linguagem simples:

1. **O que esta etapa faz** (seletor visível, hoje inexistente na tela):
   - Fazer uma pergunta e guardar na ficha
   - Mostrar um menu de opções (ramificar)
   - Passar para atendimento humano
   - Encerrar e salvar o cadastro
2. **Se for menu**: lista de opções editáveis (rótulo) e, ao lado de cada opção, um seletor **"Depois desta opção, ir para…"** com os caminhos existentes + "Criar novo caminho…" + "Encerrar e salvar". É o mesmo padrão de "destino por opção" das regras de ramificação do formulário.
3. **Se for pergunta de escolha única**: mesmo seletor de destino por opção (ex.: "É do Coletivo Alicerce? Não → pular direto para consentimentos").
4. **Se for encerrar**: escolha do tipo de cadastro gravado (cadastro completo / receber informações).
5. Regras já existentes ficam visíveis como frases: "Quando responder *Quero receber informações* → ir para **Só informações**", com botão de remover.

Validações mostradas na hora, antes de salvar:
- caminho sem nenhuma etapa;
- caminho que ninguém alcança (nenhum menu aponta para ele);
- opção de menu sem destino;
- caminho sem etapa final de encerramento ou atendimento (a conversa terminaria no vazio);
- pergunta obrigatória depois do ponto em que o cadastro já é válido (aviso de desistência).

## Ajudas de entendimento

- Cabeçalho da tela com 3 linhas explicando o modelo: gatilho → menu → caminho → cadastro gravado igual ao do link público.
- Botão **"Começar do modelo pronto"** (o roteiro FAÇA PARTE DA NOSSA CAMPANHA, já com menu e os três caminhos) e **"Começar do zero"**.
- Botões de teste existentes ("Testar no meu WhatsApp" e envio em lote) mantidos, agora no topo do editor junto da prévia.

## Detalhes técnicos

- Sem migração: `whatsapp_flow_steps` já tem `kind`, `path_key` e `option_routes`; `whatsapp_flow_sessions` já tem `path_key`. O trabalho é de interface + validação.
- Novos componentes em `src/components/whatsapp-flows/`: `FlowPathList.tsx`, `FlowStepEditor.tsx` (seletor de tipo de etapa, opções e destino por opção), `FlowChatPreview.tsx` (bolhas/botões/lista), `FlowRulesSummary.tsx`.
- `src/routes/_authenticated/fluxos-whatsapp.tsx`: substituir o modal monolítico por layout de duas colunas usando esses componentes; agrupar `draft.steps` por `path_key` mantendo `order_index` global na gravação (ordem = caminhos na ordem declarada, etapas na ordem interna).
- `src/lib/whatsapp-flow-shared.ts`: adicionar helpers puros `groupStepsByPath`, `validateFlowDraft` (retorna avisos/erros em português) e `pathDestinationsFor`, espelhando `src/lib/form-builder-branching.ts` / `form-sections-routing.ts`; `FLOW_PATH_LABELS` passa a aceitar nomes livres definidos pelo usuário.
- `src/lib/whatsapp-flows.functions.ts`: aceitar nome de caminho livre e persistir `option_routes` vindos da UI; validar no servidor os mesmos erros bloqueantes.
- Motor (`src/lib/whatsapp-flow.server.ts`): sem mudança de comportamento; apenas passa a receber roteiros com destino por opção também em perguntas de escolha única (usa a rota se existir, senão segue a ordem do caminho).
