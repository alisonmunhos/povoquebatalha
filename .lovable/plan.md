## Diagnóstico (confirmado no código)

Na `src/routes/__root.tsx` existem metadados fixos aplicados ao app inteiro:

- `og:image` e `twitter:image` apontam para **um print antigo do preview** (arquivo `...-1782933848953.png` no R2) — é exatamente a miniatura com layout/cores antigos que aparece no seu WhatsApp.
- `description` / `og:description` em inglês: "WhatsApp Connect integrates with WhatsApp API for campaign management and mass messaging." — é o texto cinza do card.
- Título genérico "Campanha Do Povo Que Batalha" para qualquer página.

Além disso, a rota do formulário `src/routes/f.$slug.tsx` está com `ssr: false` e sem `head()` próprio: o robô do WhatsApp não executa JavaScript, então recebe só os metadados da raiz (a imagem velha). O mesmo vale para as demais páginas públicas (`/inscrever`, `/atualizacao`, `/recadastro`, `/termos/$slug`, `/`, etc.).

As rotas de evento e de missão já têm metadados corretos (feitos na etapa anterior) — o problema restante é a raiz contaminando todo o resto.

## Plano

**1. Limpar a raiz (`__root.tsx`)**
- Remover o `og:image`/`twitter:image` fixos com o print antigo.
- Trocar a descrição em inglês por texto em português da campanha.
- Manter apenas defaults sitewide (título, `og:type`, `og:site_name`, `twitter:card`).

**2. Imagem de compartilhamento padrão nova (1200×630)**
- Gerar uma capa de marca com as cores atuais (#F0AA04 / #16130F / #7B4B94), logo e o nome da campanha, salva em `public/og-default.png`.
- Usar essa imagem como `og:image` padrão nas páginas públicas que não têm imagem própria.

**3. Formulários (`/f/$slug`) com prévia real**
- Criar `getFormMeta` (server fn) buscando título e descrição do formulário publicado.
- Trocar a rota para `ssr: "data-only"` com `loader` + `head()`, emitindo título/descrição reais do formulário, `og:url`, canonical e a imagem padrão de marca.

**4. Demais páginas públicas**
- Adicionar/ajustar `head()` com título, descrição, `og:*`, `twitter:card` e imagem padrão em: `/` (index), `/inscrever`, `/atualizacao`, `/recadastro`, `/cadastro-agitador`, `/cadastro-usuario`, `/obrigado`, `/termos/$slug`, `/auth`.
- Revisar `/evento/$slug` e `/missao/...` para garantir que continuam com imagem própria (capa do evento / mídia da missão) e não herdam nada da raiz.

**5. Cache do WhatsApp**
- O WhatsApp guarda a prévia por link. Depois do deploy, links já enviados continuam mostrando a imagem antiga; reenviar com um parâmetro novo (ex.: `?v=2`) força a releitura. Vou avisar isso na entrega.

## Detalhes técnicos

- Metadados por rota via `head()` do `createFileRoute`; `og:image` só em rotas folha (nunca no `__root`), pois a raiz sobrescreveria as capas de evento/missão.
- URLs absolutas montadas com `getRequestOrigin()` (já existe em `src/lib/site-origin.functions.ts`).
- `ssr: "data-only"` nas rotas que precisam de prévia: o HTML sai do servidor com as meta tags, mas a renderização continua no cliente (sem risco de quebrar formulários que usam APIs do navegador).
- `form_definitions` não tem coluna de capa hoje; formulários usarão a imagem de marca padrão. Se quiser capa por formulário depois, dá pra adicionar coluna + rota de imagem igual à do evento.
- Sem mudanças de banco nesta etapa.
