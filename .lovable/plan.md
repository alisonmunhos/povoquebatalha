
## Objetivo
Deixar o módulo **Território** impecável focando em: (1) card rico ao clicar no pin do mapa com as mesmas ações da aba "Ação de Campo", (2) integrações com WhatsApp e Google Maps do celular, (3) navegação fluida no mapa (desktop + mobile), (4) refinamento geral de UX.

---

## 1. Card do contato no mapa (principal)

Ao clicar no pin, abrir um painel (bottom sheet no mobile, lateral no desktop) com **todas** as informações e ações que o usuário tem hoje na aba *Ação de Campo*, sem precisar sair do mapa.

**Cabeçalho**
- Nome, foto (iniciais coloridas), badges de status (WhatsApp OK, opt-out, recadastro pendente, tipo de contato).
- Selo do último status de campo (Contato feito / Não encontrado / Observação) com data relativa.

**Bloco de contato**
- Telefone formatado + botão "Copiar".
- Endereço completo em linhas (logradouro, número, bairro, cidade/UF, CEP).
- Botão **"Copiar endereço"** (área de transferência para colar no Waze/Maps).
- Botão **"Abrir no Google Maps"** que usa `geo:lat,lng?q=endereço` no mobile (abre o app nativo — Google Maps/Waze/Apple Maps) e `https://www.google.com/maps/dir/?...` no desktop.
- Botão **"Como chegar"** (rota a partir da localização atual do usuário quando GPS ativo).

**Ações de campo (mesmas da aba "Ação de Campo")**
- ✅ Contato feito
- 🚫 Não encontrado
- 📝 Observação (com textarea inline, salva no histórico)
- 💬 Abrir WhatsApp (registra `whatsapp_aberto` automaticamente)
- ↩️ Voltar para "Ainda não abordado"
- 📜 Ver histórico completo (abre o `TerritoryContactLogDrawer` existente).

**Envio rápido de WhatsApp** (mantém o bloco atual com templates + variáveis).

**"Abrir ficha completa"** continua como link para `/contatos/$id`.

Reaproveitar `logTerritoryAction`, `undoLastTerritoryLog`, `resetTerritoryContact` e `TerritoryContactLogDrawer` — sem duplicar lógica.

---

## 2. Tooltip / popup nativo do pin

- Tooltip do marker mostra: **nome + bairro** (não só nome).
- Cor do pin por status de campo (cinza = não abordado, verde = contato feito, âmbar = não encontrado, azul = observação). Ícone SVG customizado leve.
- Clusters continuam com contagem; ao passar do zoom mínimo abre pin individual.

---

## 3. Navegação e zoom do mapa

**Desktop**
- Ativar `scrollWheelZoom` com **modificador**: zoom com Ctrl+scroll ou scroll direto, e exibir hint "Use Ctrl + scroll para dar zoom" quando o usuário rolar sem Ctrl (padrão Google Maps embed) — evita capturar acidentalmente o scroll da página.
- `doubleClickZoom` ativado.
- Botões **+ / −** e **⌂ Enquadrar tudo** mais visíveis no canto (substituindo o atual controle padrão).
- Cursor `grab` / `grabbing` durante arraste.

**Mobile**
- `tap: true`, `touchZoom: true`, `bounceAtZoomLimits: false`.
- Aumentar `tapTolerance` para não confundir toque com arraste em pins.
- Bottom sheet com "handle" arrastável (arrastar para baixo fecha, arrastar para cima expande — usando `vaul` ou implementação simples via touch events).
- Botão de GPS já existe; adicionar botão **+ / −** flutuante no canto oposto (polegar direito).
- Ao selecionar contato, centralizar o pin com offset vertical (para não ficar atrás do sheet).

---

## 4. Refinamentos gerais

- **Persistir última posição/zoom** no `localStorage` para reabrir onde estava.
- **Contagem visível** de pins renderizados vs. total filtrado (ex.: "312 no mapa · 47 sem coordenada").
- **Loading skeleton** ao trocar filtros (evita mapa "piscar").
- **Fechar card** ao pressionar `Esc` (desktop) ou swipe-down (mobile).
- **Preservar zoom/centro** ao abrir/fechar o card (não refazer `fitBounds`).
- Botão "Tela cheia" continua, mas reposicionado no cluster de controles top-right.

---

## 5. Detalhes técnicos

- Ajustar `getMapContactDetail` em `src/lib/map.functions.ts` para retornar também: `logradouro`, `numero`, `complemento`, `cep`, `latitude`, `longitude`, `last_action` (com `note`), e contagem de pendentes — para o card não precisar de outra chamada.
- Ícones customizados: `L.divIcon` com SVG por status (sem imagens externas).
- Google Maps deep link:
  - Mobile: `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(nome)})` com fallback para `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`.
  - Rota: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`.
- Reaproveitar mutations de `territorio.tsx` extraindo um hook `useFieldActions(contactId)` compartilhado entre `FieldAction` e o card do mapa (evita duplicação).
- Bottom sheet mobile: implementação leve com `touchstart`/`touchmove` no cabeçalho — sem adicionar biblioteca nova.
- Persistência: `localStorage` chave `territorio:mapa:view` com `{ lat, lng, zoom }`.

---

## Arquivos afetados
- `src/components/TerritoryMapView.tsx` — reescrita do `MapDetailPanel` + controles + pins coloridos + persistência.
- `src/hooks/useFieldActions.ts` — **novo**, hook compartilhado com as ações de campo.
- `src/lib/map.functions.ts` — expandir `getMapContactDetail`.
- `src/routes/_authenticated/territorio.tsx` — usar o novo hook para não repetir lógica.

## Fora de escopo
- Rotas otimizadas entre múltiplos contatos (roteirização de visita) — pode virar próxima etapa.
- Substituir Leaflet por Google Maps JS — mantém Leaflet + OSM (grátis).
