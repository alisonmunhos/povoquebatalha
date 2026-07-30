## Objetivo

1. Trocar o texto do botão "Continuar" por "Confirmar presença" no contexto da página do evento.
2. Reformular a navegação entre etapas: hoje cada etapa nova aparece **abaixo** e o usuário precisa rolar. Passar a exibir cada etapa **por cima** da anterior, em tela cheia no celular, sempre com "Voltar".

## Parte 1 — Texto do botão

Na Seção 1 do formulário vinculado a um evento, o botão de envio passa a mostrar **"Confirmar presença"** (com ícone de check em vez de seta). Nas demais seções e nos formulários normais, o texto continua "Continuar" / "Enviar".

Se a pessoa entrou pelo caminho "não poderei ir", o botão dessa mesma seção mostra **"Enviar meus dados"**, para não sugerir confirmação.

## Parte 2 — Telas sobrepostas (a sugestão)

Proposta: transformar cada passo do fluxo público num **painel sobreposto** em vez de conteúdo empilhado na página.

- No celular: painel ocupa a tela inteira (100dvh), entra deslizando da direita.
- No desktop: painel centralizado sobre um fundo escurecido, largura máxima confortável.
- Cabeçalho fixo do painel: botão **Voltar** (seta) à esquerda, título curto da etapa no centro, indicador "Etapa 2 de 4" abaixo.
- Rodapé fixo com o botão de ação principal — no celular o botão fica sempre visível, sem rolagem.
- A cada troca de etapa, o foco vai para o topo do painel (sem "pulo" de scroll), e a etapa anterior permanece visível ao fundo, dando a sensação de avanço.
- Fechar (X) só existe onde faz sentido sair sem perder nada; nas etapas do cadastro o caminho de saída é "Voltar".

Comportamento do "Voltar":
- Volta à etapa anterior do formulário preservando o que já foi digitado (as respostas já ficam em memória).
- Na primeira etapa, "Voltar" fecha o painel e retorna à página do evento.
- Também responde ao botão físico/gesto de voltar do celular, para não sair da página sem querer.

Telas que passam a ser painéis sobrepostos:
1. Seção 1 do formulário (confirmar presença).
2. Mensagem de presença confirmada / mensagem de recusa configurada — aparece por cima, com o botão configurado ("Completar meu cadastro" ou "Quero continuar com vocês").
3. Seções seguintes do cadastro (dados, endereço etc.).
4. Criação de senha / finalizar cadastro — este é o caso citado: passa a abrir por cima, como pop-up fechável, com Voltar.
5. Tela final de sucesso.

## Detalhes técnicos

- Novo componente `src/components/StepOverlay.tsx`: wrapper acessível (Radix Dialog já usado no projeto) com variante full-screen no mobile via `sm:` breakpoints, cabeçalho/rodapé fixos, `aria-label` e travamento de scroll do fundo. Reaproveita o `useReleaseBodyPointerEvents` já existente em `dialog.tsx`.
- `PublicFormRenderer.tsx`: nova prop opcional `presentation: "inline" | "overlay"` (padrão `inline`, para não mexer nos formulários públicos autônomos). No modo `overlay`, o corpo da seção é renderizado dentro do `StepOverlay`, com o botão de ação no rodapé. Nova prop `submitLabel`/`primaryActionLabel` para o texto "Confirmar presença".
- Pilha de navegação: array de etapas visitadas em estado local + `history.pushState` por etapa para integrar com o botão voltar do Android; `popstate` recua uma etapa.
- `evento.$slug.tsx`: passa `presentation="overlay"`, define o rótulo do botão conforme `formMode`, e move os blocos `confirmedStop` / recusa para dentro do overlay. Remove os `window.scrollTo` que hoje tentam compensar o problema.
- Sem alteração de banco, de rotas ou de regras de negócio; mudança é de apresentação.

## Riscos e cuidados

- Teclado do celular sobre o rodapé fixo: usar `env(safe-area-inset-bottom)` e `100dvh` para evitar que o botão fique escondido.
- Formulários públicos fora do evento (`/f/$slug`, recadastro, inscrição) permanecem no modo inline nesta entrega — se quiser, aplico o overlay neles depois, num segundo passo controlado.
