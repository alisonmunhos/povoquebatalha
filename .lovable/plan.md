## Objetivo

Fazer o módulo Agitação se comportar como um app próprio: sempre com **botão Início**, **seta de voltar** e atalhos fixos, tanto para quem só tem acesso à Agitação quanto para quem usa o sistema completo.

## O que já existe (verificado no código)

- `AppShell.tsx` já tem um modo "mini-app" para quem só tem o papel *agitador* (cabeçalho "Modo Agitação" com sino, instalar app, novo contato e sair) — mas **sem botão Início e sem voltar**.
- `route.tsx` restringe o agitador a `/agitacao`, `/minhas-missoes`, `/meu-impacto`, `/minha-semana` e ficha de contato.
- Voltar existe só de forma solta: `/meu-impacto` e `/minha-semana` têm seta para `/agitacao`; `/minhas-missoes` tem link interno; `/missoes-agitacao/$id` e `/desempenho` têm "Voltar" próprio. `/agitacao` e a ficha de contato não têm nada.

## Plano

### 1. Componente único de navegação (`src/components/AgitacaoNav.tsx`)
Barra reutilizável com:
- **Seta Voltar** — volta no histórico quando houver de onde voltar; caso contrário vai para a tela inicial da Agitação (`/agitacao`). Nunca fica sem destino.
- **Botão Início (ícone de casa)** — vai para `/agitacao`.
- **Botão "Sistema"** — aparece **só** para quem tem outros papéis (admin/operador/vrm/comunicação) e leva ao Dashboard geral. Para o agitador puro esse botão não existe (ele não tem acesso).
- Título da tela atual, para o usuário saber onde está.

### 2. Cabeçalho do "Modo Agitação"
No cabeçalho mini-app do `AppShell`, o bloco "Modo Agitação" passa a ser clicável (leva a `/agitacao`) e ganha o ícone de Início ao lado da seta de voltar. Mantém sino, instalar app, novo contato e sair.

### 3. Barra inferior de abas (mobile) no modo Agitação
Abas fixas no rodapé, no padrão de app: **Início** (`/agitacao`), **Missões** (`/minhas-missoes`), **Impacto** (`/meu-impacto`), **Semana** (`/minha-semana`), com aba ativa destacada. Aparece para o agitador puro e também para os outros papéis enquanto navegam em telas da Agitação (no celular).

### 4. Aplicar a barra nas telas
Inserir `AgitacaoNav` no topo de: `/agitacao` (só Início/Sistema, sem voltar), `/minhas-missoes`, `/meu-impacto`, `/minha-semana` (substituindo as setas soltas atuais) e na ficha de contato quando aberta por um agitador (voltar → lista de captados).

### 5. Botão de voltar físico do celular
Garantir que a navegação use o histórico do router (sem `replace`) nessas telas, para o gesto/botão nativo de voltar funcionar como esperado.

## Detalhes técnicos

- Lógica de papéis reaproveitada de `useAuth`/`useRoles`; o "modo agitador puro" continua definido no mesmo critério de `route.tsx` e `AppShell.tsx` — extraio esse cálculo para um hook `useIsAgitadorOnly` para não duplicar a regra em três lugares.
- Voltar usa `router.history.canGoBack()` com fallback para `/agitacao`.
- Sem mudanças de banco, permissões ou regras de negócio: alteração puramente de interface e navegação.
- Rodapé com `padding-bottom` seguro (safe-area) para não cobrir conteúdo nem os botões de ação das telas.
