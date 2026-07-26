
## Problema

Hoje o convite para instalar só aparece na landing `/`, e só pra quem não está logado. Quem já entra direto no `/dashboard` (a maioria da equipe) nunca vê o botão. Além disso, quando o navegador não dispara o evento automático (iOS Safari, Firefox, alguns Androids), o guia manual fica escondido atrás de um segundo clique.

## Objetivo

Um único botão "Instalar app" **sempre visível** enquanto o app não estiver rodando como PWA, tanto na landing quanto dentro do sistema logado, com fallback claro por navegador (iOS, Chrome Android, Samsung, desktop).

## Mudanças

### 1. Componente global `InstallAppButton` (novo)
Arquivo novo: `src/components/InstallAppButton.tsx`.

Responsabilidades:
- Detectar `display-mode: standalone` (ou `navigator.standalone` no iOS) → se já instalado, não renderiza nada.
- Escutar `beforeinstallprompt` e `appinstalled` uma única vez (listener global montado no primeiro uso).
- Detectar navegador (iOS Safari, Chrome Android, Samsung, Firefox, Edge, Chrome desktop).
- Renderizar um botão compacto ("Instalar app") que:
  - Se tiver o evento salvo → chama `prompt()` direto.
  - Se não tiver → abre um modal (`Dialog` do shadcn) com instruções passo a passo específicas do navegador detectado, incluindo ilustração do ícone Compartilhar do iOS.
- Aceita prop `variant` (`"card"` para landing, `"chip"` para topbar do app) para se adaptar ao contexto visual.

### 2. Landing (`src/routes/index.tsx`)
- Substitui o card atual de instalação pelo novo `<InstallAppButton variant="card" />`.
- Mantém o mesmo layout/copy, só que a lógica de detecção sai do arquivo e vira reutilizável.

### 3. AppShell (`src/components/AppShell.tsx`)
- Adiciona `<InstallAppButton variant="chip" />` na topbar (desktop e mobile), ao lado do sino de notificação.
- Só aparece se o app não estiver instalado — se estiver, o componente retorna `null` e não ocupa espaço.
- Também aparece no shell do modo Agitador (mini-app), no mesmo lugar do sino.

### 4. Modal de instruções por navegador
Dentro do `InstallAppButton`, quando o clique não tem evento nativo pra disparar:
- iOS Safari: passo a passo com ícone do botão Compartilhar (SVG inline) → "Adicionar à Tela de Início".
- Chrome Android: menu ⋮ → "Instalar aplicativo".
- Samsung Internet: menu ☰ → "Adicionar página a" → "Tela inicial".
- Firefox/Edge/Chrome desktop: texto curto com a ação equivalente.
- Botão "Entendi" pra fechar.

### 5. Consistência do Service Worker
Nenhuma mudança de código no SW. Só valido que o registro em `src/routes/__root.tsx` já roda no domínio publicado (`povoquebatalha.lovable.app`) — que é onde o `beforeinstallprompt` é elegível. Nada é registrado no editor/preview, que é o comportamento correto.

### Detalhes técnicos
- O evento `beforeinstallprompt` só dispara uma vez. O componente guarda o evento em estado local; se o usuário fechar o modal sem instalar, o evento continua disponível para o próximo clique.
- No iOS não existe `beforeinstallprompt` — o botão sempre abre o modal com instruções.
- Detecção standalone é feita no `useEffect` (client-only) pra não quebrar SSR.
- O componente usa `sessionStorage` só pra lembrar se o usuário já viu o modal na sessão (não pra esconder o botão — o botão continua visível pra reentrada, só evita reabrir automático).

## O que NÃO muda

- Nada de push notification, sino, som, ou service worker é alterado.
- O manifest, ícones e meta tags PWA continuam iguais.
- Nenhuma migration, nenhuma função de servidor.

## Onde testar depois de publicar

- Abrir `povoquebatalha.lovable.app` no celular (Android Chrome ou iPhone Safari): o botão "Instalar app" aparece na landing e também na topbar depois de logar.
- Clicar no botão: Android abre o prompt nativo; iPhone abre o modal com o passo a passo do Safari.
- Depois de instalar e abrir pelo ícone da tela inicial: o botão some (porque `display-mode: standalone` fica true).
