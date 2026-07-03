## Objetivo

Deixar `/territorio` totalmente fluido no celular (aba **Ação de Campo** + aba **Mapa**), sem quebras de layout, com filtros retráteis e um mapa fácil de manipular — incluindo um botão "Minha localização" estilo GPS que centraliza o mapa no ponto onde o usuário está.

## Mudanças

### 1. Shell (menu lateral no mobile) — `src/components/AppShell.tsx`

- Garantir que o sidebar entre em modo off-canvas retrátil em telas `< md` (drawer sobreposto ao conteúdo, com backdrop e botão hamburger fixo no topo).
- Botão hambúrguer visível no header em mobile; fecha automaticamente ao navegar.
- Preservar comportamento desktop (fixo).

### 2. Aba Ação de Campo — `src/routes/_authenticated/territorio.tsx`

- **KPIs**: manter `grid-cols-2`, mas reduzir padding e fonte no mobile para caber sem overflow horizontal.
- **Barra de filtros retrátil**: no mobile transformar o cartão de filtros em um bloco colapsável (`<details>` ou botão "Filtros ▾") — começa fechado; mostra apenas contagem de filtros ativos. Chips e selects aparecem quando expande.
- **Cards de contato**:
  - Botões de ação viram `grid-cols-2` com altura mínima `h-11` (tap target 44px) — já está próximo, mas ajustar espaçamentos e evitar wrap com `min-w-0` + `truncate`.
  - Chips de status (opt-out, WhatsApp, recadastro) com `flex-wrap` seguro.
- **Resumo do dia**: quebrar em linhas no mobile em vez de flex-wrap denso.
- **Aviso/dica** (Smartphone icon): virar `<details>` colapsável — economiza espaço vertical.

### 3. Aba Mapa — `src/components/TerritoryMapView.tsx`

- **Layout responsivo**:
  - Container principal muda de `flex` para `flex-col md:flex-row`, para o painel de detalhes empilhar abaixo no mobile em vez de espremer o mapa.
  - Stats: `grid-cols-2 md:grid-cols-5` (já é). Reduzir padding em mobile.
  - Filtros: envolver em `<details>` colapsável no mobile (fechado por padrão, com resumo dos filtros ativos).
- **Painel lateral do contato selecionado (`MapDetailPanel`)** no mobile: virar **bottom sheet** deslizante (fixo em `bottom-0`, `inset-x-0`, com backdrop, arrastável para fechar/fechar no `X`) em vez de ocupar a largura toda empurrando o mapa para cima.
- **Altura do mapa no mobile**: usar `h-[calc(100dvh-14rem)]` (usa `dvh` — dynamic viewport, evita corte com barra do Safari) e ficar próximo de tela cheia.
- **Fullscreen**: manter botão de tela cheia já existente.

### 4. Botão "Minha localização" (GPS) no mapa — `LeafletMap`

- Novo botão flutuante no canto inferior direito (`bottom-4 right-2`) com ícone `Crosshair`/`LocateFixed`.
- Ao clicar:
  1. `navigator.geolocation.getCurrentPosition({ enableHighAccuracy: true })`.
  2. Se autorizado, adicionar/atualizar um marcador azul distinto ("Você está aqui") com círculo de precisão.
  3. Centralizar o mapa em `[lat, lng]` com `zoom 16` (rua).
  4. Se negado, mostrar `toast.error("Precisamos da sua localização — habilite no navegador.")`.
- Segundo clique alterna modo **"Seguir minha localização"**: usa `watchPosition` e move o marcador em tempo real; terceiro clique desliga.
- Estado do modo mostrado no botão (cinza → azul preenchido → azul pulsante).
- Cleanup do `watch` no unmount.

### 5. Detalhes técnicos

- Nada de novas libs — `navigator.geolocation` é nativo; marcador de usuário usa `L.circleMarker` (círculo) + `L.circle` (raio de precisão), sem novos assets.
- HTTPS já é garantido no preview/publicado — geolocation funciona.
- Sem migrations. Sem mudanças no banco.
- Manter comportamento desktop intacto (o layout mobile é ativado por breakpoints `md:`).

## Fora de escopo

- Rota/traçado (Directions) até o contato — pode entrar depois se pedido.
- Cache/histórico de localização do usuário.
- Modo escuro do mapa.
