## Diagnóstico confirmado

O link publicado já está retornando metadados corretos no HTML:

- `og:title` está com o título real do evento.
- `og:description` está com a descrição real do evento.
- `og:url` aponta para o próprio link do evento.
- `og:image` aponta para a capa pública do evento.
- A URL da capa responde `200`, como `image/jpeg`, com imagem real de `1059x1440`.

O problema mais provável não é ausência de meta tags agora; é que o WhatsApp está usando cache antigo da prévia e/ou rejeitando a imagem por formato/dimensão pouco ideal para card de link. A imagem atual é vertical (`1059x1440`), enquanto prévias grandes de WhatsApp/Open Graph funcionam melhor com imagem horizontal, normalmente `1200x630` ou similar.

## Plano de correção

### 1. Tornar a imagem da prévia compatível com WhatsApp

Criar uma rota pública específica para imagem de compartilhamento do evento, por exemplo:

```text
/api/public/events/$slug/og-image
```

Ela vai:

- Buscar a capa original do evento.
- Gerar uma versão horizontal em proporção Open Graph (`1200x630`).
- Manter a capa real visível sem distorcer.
- Usar fundo/recorte compatível com a identidade visual atual.
- Responder como `image/jpeg` ou `image/png` com cache público.

Assim o WhatsApp deixa de tentar montar a prévia a partir de uma imagem vertical crua.

### 2. Apontar `og:image` para a nova rota

Na rota pública do evento (`/evento/$slug`), trocar:

```text
/api/public/events/$slug/cover
```

por:

```text
/api/public/events/$slug/og-image
```

Manter:

- `og:image:width = 1200`
- `og:image:height = 630`
- `twitter:card = summary_large_image`
- `canonical` e `og:url` apontando para a própria página do evento.

### 3. Corrigir prévia antiga/cacheada

Adicionar um controle de versão simples na imagem ou no link de preview, por exemplo:

```text
/api/public/events/$slug/og-image?v=<updated_at/ou timestamp-da-capa>
```

Isso ajuda a forçar WhatsApp e outros apps a perceberem que a imagem mudou.

Importante: mesmo com isso, o WhatsApp pode manter cache por algum tempo para links já enviados. Para testar imediatamente, o ideal é enviar o link com um parâmetro novo, por exemplo:

```text
https://povoquebatalha.lovable.app/evento/...?...preview=2
```

sem alterar a página real.

### 4. Padronizar para qualquer link público do app

Aplicar o mesmo padrão às rotas públicas que geram prévia:

- Eventos.
- Missões públicas.
- Formulários públicos.
- Página inicial e páginas institucionais.

Regra única:

- Páginas com capa própria usam imagem OG gerada/normalizada.
- Páginas sem capa usam `og-default.png` atual.
- Nunca usar imagem antiga no `__root.tsx`.
- Nunca depender de JS para metadados.

### 5. Verificação antes de finalizar

Depois da implementação, verificar:

- HTML publicado/local contém apenas uma `og:image` correta.
- A imagem `og-image` abre diretamente no navegador.
- A imagem responde `200` para user agents tipo WhatsApp/Facebook.
- Dimensão real da imagem gerada é `1200x630`.
- Não há metadados antigos sobrescrevendo os novos.

## Resultado esperado

Ao reenviar o link com cache renovado, a prévia deve mostrar:

- Título real do evento.
- Descrição real do evento.
- Imagem de capa do evento em formato grande e horizontal.
- Visual alinhado com a identidade atual do app, sem voltar para o layout antigo.