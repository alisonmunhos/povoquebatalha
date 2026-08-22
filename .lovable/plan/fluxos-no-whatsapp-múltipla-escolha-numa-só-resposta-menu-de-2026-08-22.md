# Fluxos no WhatsApp: múltipla escolha numa só resposta, menu de ramificação e opções sem corte

Três ajustes no cadastro pelo chat, a partir do que o teste mostrou.

## 1. Marcar várias opções numa única mensagem

Hoje a pergunta "Como você pode ajudar?" usa a lista clicável do WhatsApp, e essa lista aceita **um item por toque** — é limite da própria Meta, não do nosso código. Por isso vira uma mensagem por opção.

O que passa a acontecer:

- A pergunta mostra as opções numeradas no texto e pede: **"Responda com os números, separados por vírgula (ex.: 1, 3, 5)"**.
- A pessoa manda `1,3,5` (ou `1 3 5`, ou `1-3`) e todas entram de uma vez, com uma confirmação: "Anotei: Panfletagem, Doação, Grupo de WhatsApp."
- Quem preferir tocar continua podendo: o botão de lista segue disponível e cada toque **acumula** em vez de exigir nova pergunta; ao final a pessoa toca em "Pronto, terminei".
- Também aceita nomes escritos ("panfletagem e doação").

Observação honesta: caixinhas de seleção múltipla dentro de uma única mensagem só existem no recurso "WhatsApp Flows" (formulário nativo publicado e aprovado dentro da Meta). Isso é um projeto separado, com formulário versionado no painel da Meta. A solução acima resolve em uma mensagem sem essa dependência.

## 2. Menu de introdução com ramificações

Nova primeira etapa do tipo **Menu**, com até 3 botões (ou lista, se tiver mais):

```text
Olá! Como podemos te ajudar?
[ Quero apoiar a campanha ]  [ Quero receber informações ]  [ Quero falar com alguém ]
```

Cada opção do menu aponta para um caminho:

- **Quero apoiar a campanha** → segue o roteiro completo de cadastro (como hoje).
- **Quero receber informações** → caminho curto: confirma nome, confirma o WhatsApp e pede os dois consentimentos; salva o cadastro com origem "receber informações" e envia a confirmação ("pronto, você vai receber as novidades por aqui").
- **Quero falar com alguém** → não faz perguntas: responde "já avisei a equipe, alguém te responde por aqui", encerra o fluxo e deixa a conversa **Em aberto** no Inbox (com sinalização e etiqueta de motivo), para atendimento humano.

Na tela de administração de fluxos cada etapa ganha um seletor de **destino por opção**, e o fluxo passa a ter caminhos nomeados (ex.: "Cadastro completo", "Só informações", "Atendimento humano"), com liga/desliga por caminho. O novo fluxo padrão já vem com esse menu montado.

## 3. Frases longas cortadas no seletor

A lista da Meta corta o título de cada item em 24 caracteres. Correção:

- O item passa a mostrar um **título curto** (24 caracteres, gerado a partir do rótulo) e o **texto completo na descrição** do item (até 72 caracteres), que aparece logo abaixo sem corte.
- O texto da pergunta continua trazendo a lista numerada completa, então nada fica escondido.
- Rótulos maiores que 72 caracteres passam a ser sinalizados na tela de edição do fluxo, com sugestão de encurtar.

## Detalhes técnicos

- Banco: em `whatsapp_flow_steps`, adicionar `kind` ("question" | "menu" | "handoff" | "finish"), `path_key` (a qual caminho a etapa pertence) e `option_routes` (jsonb: valor da opção → caminho de destino). Em `whatsapp_flow_sessions`, adicionar `path_key` para saber em que trilha a pessoa está. Migração aditiva, sem perda de dados; fluxos existentes ficam no caminho padrão.
- `src/lib/whatsapp-flow-shared.ts`: novos tipos (`FlowStepKind`, rotas), roteiro padrão com menu e os três caminhos.
- `src/lib/whatsapp-flow.server.ts`: parser de múltiplos números/rótulos numa só resposta; acúmulo em `pending_multi` sem reenviar a pergunta a cada toque; avanço por caminho (`path_key`) em vez de índice linear; etapa de handoff que marca a conversa como `aberta` + `flagged` e encerra a sessão; envio de lista com `description` para não cortar texto.
- `src/lib/public-form-contact.server.ts` (uso existente): caminho "só informações" salva com `source_form_type: 'receber_informacoes'`.
- `src/routes/_authenticated/fluxos-whatsapp.tsx`: editor de etapas com tipo de etapa, caminho e destino por opção; aviso de rótulo longo.
- Sem mudanças nos templates aprovados na Meta; tudo dentro da janela de 24h já usada pelo fluxo.
