# Disparar o fluxo direto na conversa do Inbox (como uma resposta pronta)

Hoje o disparo manual só existe na tela **Cadastro pelo WhatsApp** (`/fluxos-whatsapp`), e lá os botões ficam apertados numa linha do topo do cartão que não quebra em tela estreita — por isso passam desapercebidos. O que você quer é enviar o fluxo de dentro da conversa, no mesmo lugar das respostas prontas.

## 1) No Inbox: "Iniciar fluxo" ao lado das respostas prontas

No composer da conversa, junto do botão de resposta rápida, entra um botão **"Iniciar fluxo"** (ícone de robô) que abre uma lista igual à das respostas prontas:

- Lista dos fluxos ligados, com nome e descrição curta; busca por nome quando houver muitos.
- Ao escolher, uma confirmação curta: "Iniciar o fluxo *Cadastro completo* com Lucas Rafael Lima? Ele recebe agora a mensagem de abertura e a 1ª pergunta."
- Depois do envio, aviso de sucesso e o histórico da conversa recarrega mostrando as mensagens do robô.
- Se a pessoa já estiver respondendo um fluxo, a confirmação avisa que a conversa em andamento será reiniciada.
- Se a janela de 24h estiver fechada (ninguém escreveu nas últimas 24h nessa conversa), o botão fica desativado com a explicação: "Só é possível iniciar o fluxo até 24h depois da última mensagem da pessoa. Use um modelo aprovado para reabrir a conversa."

## 2) Na tela de fluxos: deixar os botões visíveis

- Barra de ações própria abaixo do nome do fluxo, que quebra em várias linhas em vez de sair da tela.
- Ação principal em destaque: **"Enviar para quem falou nas últimas 24h"**; ao lado, **"Testar em um número"**.
- Liga/desliga, "Editar" e "Excluir" ficam numa linha separada, discreta.

## Detalhes técnicos

- `src/components/CommunicationInbox.tsx`: novo Popover no composer, no mesmo grupo do de resposta rápida, reaproveitando o padrão de busca + lista já existente ali.
- Consulta dos fluxos ativos pela função já existente `listWhatsappFlows` (filtrando `active`); disparo pela `startWhatsappFlowManually` de `src/lib/whatsapp-flows.functions.ts`, via `useServerFn` + `useMutation`, seguido de `invalidateQueries` da timeline da conversa.
- A janela de 24h é decidida pela data da última mensagem recebida já presente nos dados da conversa carregada — sem chamada extra.
- `src/routes/_authenticated/fluxos-whatsapp.tsx`: apenas reorganização do cartão (`flex-wrap`, `w-full sm:w-auto`).
- Sem mudança de banco de dados e sem alteração no motor do fluxo (`whatsapp-flow.server.ts`).

## Cuidados

- Iniciar um fluxo assume a conversa: o robô passa a responder as próximas mensagens dessa pessoa até concluir ou ela pedir atendimento humano.
- Fluxo desligado não aparece na lista do Inbox — para usar, ligue-o antes na tela de fluxos.
