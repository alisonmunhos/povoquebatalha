## Objetivo

Eliminar a necessidade de "escopo territorial" por usuário, unificar Território + Mapa em um único módulo, e garantir que o papel **Território** enxergue o mapa.

## Mudanças

### 1. Remover restrição por escopo (todos veem tudo)

- `src/lib/map.functions.ts` (`listMapContacts`): remover bloco `restrict` / `applyScopeFilter` / `noScope`. Sempre listar todos os contatos com lat/long (respeitando filtros normais do CRM).
- `src/lib/territory.functions.ts` (`getTerritoryOverview`, `listTerritoryContacts`): remover `restrict` e `applyScopeFilter`. KPIs e listagem passam a considerar toda a base.
- Manter as funções `listMyScopes`, `addScope`, `removeScope` existindo (não quebrar chamadas), mas a UI de gestão de escopos deixa de ser oferecida como pré-requisito. Mensagem "(sem escopo definido)" some.

### 2. Unificar Território + Mapa em um módulo único

- `src/routes/_authenticated/territorio.tsx`: transformar em página com **abas** (Tabs):
  - **Ação de Campo** (conteúdo atual: KPIs, busca, lista de contatos, registrar visita).
  - **Mapa** (embutir o conteúdo hoje em `/mapa`: mapa Leaflet com clusters, filtros, fullscreen).
- `src/routes/_authenticated/mapa.tsx`: manter como rota redirecionando para `/territorio?tab=mapa` (preserva links antigos e o menu atual sem quebrar).
- Extrair o componente do mapa para `src/components/TerritoryMap.tsx` para reuso dentro da aba.

### 3. Menu lateral (AppShell)

- `src/components/AppShell.tsx`: grupo "Território" passa a ter **um único item**: "Território" (ícone Compass) apontando para `/territorio`. Remover item "Mapa Geral".
- Ajustar `hint` para: "Ação de campo + mapa geral da base."
- Permitir o item Território para os papéis `admin`, `operador`, `vrm`, `territorio` (já é o caso).

### 4. Papel Território enxergando o mapa

- Com a unificação, o usuário `territorio` já entra em `/territorio` e vê a aba Mapa disponível.
- Confirmar em `_authenticated/route.tsx` que `TERRITORIO_ALLOWED_PREFIXES` inclui `/territorio` (já inclui). Não precisa liberar `/mapa` porque vira redirect para `/territorio`.
- Remover qualquer gate por escopo dentro das telas: usuária Território verá todos os contatos e todo o mapa automaticamente.

### 5. Limpeza suave (sem migração destrutiva)

- Não apagar tabela `user_territory_scopes` nem dados existentes (preservação de dados).
- Esconder da UI a seção de "Escopos" em `/usuarios` (se estiver visível), com nota "Escopos desativados — todos os usuários com acesso ao Território veem toda a base."

## Fora do escopo

- Não altero policies do banco nem estrutura de papéis.
- Não mexo em Comunicação/Inbox/CRM além do menu lateral.

## Onde testar depois

Logar como usuária Território → menu mostra "Território" → abrir → alternar abas "Ação de Campo" e "Mapa" → confirmar contatos e pins visíveis sem precisar de escopo.

- Logar como Admin → mesma tela unificada; link antigo `/mapa` redireciona para `/territorio`.