# Avaliação: Astryx (Meta) para reconstruir o Inbox

## Resposta direta sobre o React

O projeto **já está no React 19+**. No `package.json`:

- `react: ^19.2.0`
- `react-dom: ^19.2.0`
- `@types/react` e `@types/react-dom`: `^19.2.0`

Ou seja, o peer dependency de React 19+ do Astryx já está satisfeito — **nenhum upgrade de React é necessário**.

## O que existe no Astryx

Confirmado na documentação oficial (astryx.atmeta.com / facebook/astryx, beta, MIT): há uma família de componentes de Chat — Chat Layout, Chat Composer, Chat Message / Chat Message Bubble, Chat Message List, Chat Message Metadata, Chat System Message, Chat Tool Calls. Estilo via StyleX + pacote de tema (`@astryxdesign/theme-neutral`).

## Ponto de atenção principal (antes de decidir)

O projeto todo é estilizado com **Tailwind v4 + shadcn/Radix** e um design system próprio da campanha (amarelo/ink/roxo, `shadow-punch`, fontes Anton/Archivo). Astryx traz **StyleX**, um segundo motor de estilo, com tema neutro próprio. Consequências:

- Duas engines de estilo no mesmo bundle (peso e complexidade de build no Vite/Cloudflare Worker).
- O Inbox passaria a ter aparência "neutra Meta", diferente do resto do painel, a menos que se invista em customizar o tema Astryx com as cores da campanha.
- StyleX normalmente exige plugin de build; é preciso validar compatibilidade com o preset Vite gerenciado (`@lovable.dev/vite-tanstack-config`) e com SSR do TanStack Start.

Recomendação: fazer um **piloto isolado só na tela do Inbox** (rota nova, sem mexer no Inbox atual) antes de adotar de vez.

## Plano de instalação e integração (a executar só após sua aprovação)

1. **Instalar dependências**
   - `@astryxdesign/core`, `@astryxdesign/theme-neutral`, `@stylexjs/stylex`
   - `@astryxdesign/cli` como dev dependency e rodar o `init` para gerar a documentação de componentes.

2. **Build / StyleX**
   - Usar o CSS pré-compilado do Astryx (sem compilador StyleX no build), carregando-o via `links` no `head()` da rota do piloto ou no `__root.tsx`.
   - Só adicionar plugin StyleX ao Vite se o pré-compilado não bastar — e nunca duplicando plugins do preset gerenciado.

3. **Provider de tema**
   - Envolver apenas a subárvore do piloto com o provider de tema do Astryx + `theme-neutral`, para não afetar o restante do app.
   - Se o piloto for aprovado, avaliar mover o provider para `src/routes/__root.tsx`.

4. **Piloto do Inbox**
   - Nova rota `/_authenticated/comunicacao/inbox-astryx` (o `/comunicacao/inbox` atual continua intacto).
   - Reaproveitar 100% da lógica existente: `src/lib/inbox.functions.ts`, `src/lib/communication.functions.ts`, o parâmetro de busca `contact`, janela de 24h (`describeSendError`), templates e botões.
   - Trocar apenas a camada visual: `ChatLayout` (lista de conversas + painel), `ChatMessageList` + `ChatMessageBubble` (histórico, incluindo botões de template) e `ChatComposer` (envio).

5. **Verificação**
   - Typecheck + build de produção (para pegar erro de SSR/Worker cedo).
   - Teste da tela no preview: seleção por `?contact=`, envio, aviso de janela de 24h, botões de template.

6. **Decisão**
   - Comparar piloto vs. Inbox atual (aparência, peso do bundle, esforço de tematização). Se aprovado, redirecionar a rota antiga; se não, remover a rota e as dependências.

## Riscos e como reagimos

- **StyleX incompatível com o build gerenciado** → ficamos só no CSS pré-compilado; se ainda falhar, abortamos o piloto sem impacto no app.
- **Conflito visual com o design da campanha** → tematizar o Astryx com os tokens atuais (amarelo `#F0AA04`, ink, roxo) ou manter a adoção restrita ao Inbox.
- **Astryx em beta** → fixar versões exatas para evitar quebras em atualizações.

## Cuidados

- Nada do Inbox atual é alterado no piloto; nenhuma rota pública é quebrada.
- Nenhuma mudança de banco, RLS ou regras de envio nesta etapa — é só camada visual.
