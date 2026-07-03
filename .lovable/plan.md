# Precisão de geocodificação + indicação visual no mapa

## Problema
Hoje usamos uma única chamada ao Nominatim que devolve qualquer resultado — normalmente o centro da rua, não o número exato. Resultado: o pin cai "na rua certa mas na casa errada". Também não distinguimos visualmente um endereço geolocalizado com precisão de um aproximado (só CEP/cidade).

## Estratégia

### 1. Geocodificador em cascata com validação (`src/lib/cep.server.ts`)
Reescrever `geocodeAddress` para tentar, em ordem, e parar no primeiro resultado que confirme o número da casa:

1. **Nominatim estruturado** — enviar `street=<rua>, <número>`, `postalcode=<cep>`, `city=<cidade>`, `state=<uf>`, `country=Brasil`, `addressdetails=1`. Consulta estruturada é bem mais precisa que a string única atual.
2. **Nominatim busca livre** (fallback atual) — só se a estruturada não retornar nada.
3. **Photon (Komoot, grátis, base OSM)** — `https://photon.komoot.io/api/?q=...&limit=5&lang=pt&osm_tag=place:house`. Photon costuma indexar `addr:housenumber` em cidades pequenas onde o Nominatim falha.
4. **Fallback só-CEP** — geocodificar só o CEP quando nenhuma tentativa devolver o número.

Cada retorno inclui `addressdetails.house_number`. Comparamos com o número informado e classificamos precisão em 4 níveis:

| Nível | Critério |
|---|---|
| `exato` | número da casa retornado bate com o do cadastro (tolerância: mesmo número, ou pertence a um `housenumbers` range do OSM) |
| `rua` | rua e CEP conferem, mas número não veio / não bateu |
| `cep` | apenas CEP resolvido (cidade pequena, CEP único) |
| `cidade` | só cidade/UF resolvidos |
| `erro` | nada resolvido |

### 2. Schema
Migration adiciona `contacts.geocoding_precision` (enum `exato | rua | cep | cidade`) e `contacts.geocoding_match_score` (numeric, 0–1). `geocode_cache` ganha as mesmas colunas para não perder o nível de precisão ao usar cache. Recomputa a coluna dentro do batch existente — não altera comportamento do trigger de re-geocode ao editar endereço.

### 3. Re-geocodificação automática dos completos
Um serverFn `regeocodeIncompletePins` marca como `pendente` todos os contatos com `endereco_completo IS NOT NULL` E (`geocoding_precision IN ('cep','cidade')` OU `geocoding_precision IS NULL` OU `geocoding_status = 'aproximado'`). Assim toda a base migrada passa pelo novo pipeline sem apagar quem já está com `exato`. Botão "Re-geocodificar imprecisos" na tela `/mapa` (ou dentro da aba Território → Mapa) dispara em lotes de 20 (respeitando 1 req/s do Nominatim).

Também exponho um botão por-contato "Re-geocodificar este endereço" no card do mapa, para o seu caso específico (Sarmento Leite 1011).

### 4. Camada visual — segunda dimensão além da cor de status
As cores atuais (verde/âmbar/azul/cinza) continuam representando **status da ação de campo**. Precisão vira uma **borda + forma**, para não conflitar:

- `exato` → pin cheio, borda branca sólida grossa, sombra normal.
- `rua` → pin cheio, borda **tracejada** branca.
- `cep` → pin cheio, borda tracejada + **ponto de interrogação pequeno** sobreposto (canto sup. dir.).
- `cidade` → pin **oco/translúcido** (opacidade 55%) com ponto de interrogação.

Implementado no `L.divIcon` já existente em `TerritoryMapView.tsx` — só amplia o SVG para receber `precision` além de `status`. Adiciono legenda discreta no rodapé do mapa: "● Exato · ◐ Rua · ◌ Aproximado".

Filtros do mapa ganham chip **"Só endereços exatos"** para quando você quiser só visitar quem tem certeza da localização.

### 5. Contadores no cabeçalho do mapa
Substituo a contagem atual por: "N pins · X exatos · Y na rua · Z aproximados · W sem coordenada", com o número de aproximados clicável abrindo a lista dos que precisam de conferência.

## Arquivos afetados
- `src/lib/cep.server.ts` — nova cascata + Photon + classificação de precisão.
- `src/lib/geocoding.functions.ts` — grava `geocoding_precision`, novo serverFn `regeocodeImprecise` e `regeocodeOne`.
- `src/lib/map.functions.ts` — retorna `geocoding_precision` em `listMapContacts` e `getMapContactDetail`.
- `src/components/TerritoryMapView.tsx` — ícone com dupla codificação (cor=status, borda/forma=precisão), legenda, filtro "só exatos", botão "Re-geocodificar este pin".
- `src/routes/_authenticated/territorio.tsx` — botão "Re-geocodificar imprecisos" com progresso.
- Migration: coluna `geocoding_precision` em `contacts` e `geocode_cache`.

## Limitações honestas
- Nominatim/Photon são base OSM. Ruas sem `addr:housenumber` mapeado no OSM (comum em cidades pequenas e interior) simplesmente **não têm** o número no banco — nenhum provedor grátis resolve isso. Nesses casos o pin vai ficar como `rua` ou `cep` mesmo com endereço completo. É por isso que a segunda camada visual é essencial: você saberá de antemão em quem confiar antes de sair para entregar material.
- Para o seu endereço (Porto Alegre, Rua Sarmento Leite 1011), a consulta estruturada + Photon quase certamente retorna `exato` — vou validar rodando um teste real assim que aprovar.

## Fora de escopo (a pedido)
- Arrastar o pin para ajuste manual — fica anotado para depois se a precisão automática não bastar.
