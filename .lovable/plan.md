## O que está acontecendo

Verifiquei o código e há duas causas somadas:

1. **O link do WhatsApp (`api.whatsapp.com/send?text=...`) só carrega texto.** Nenhum arquivo pode ser anexado por link — isso é limitação do WhatsApp, não do sistema. Hoje a imagem da missão só aparece em "Minhas missões" como um botão "Baixar" (e no link público do agitador ela nem aparece: o endpoint `/api/public/agitation-missions/$missionId/$contactId` não retorna `media_path`).
2. **Quando a mensagem tem um link, o WhatsApp tenta gerar a pré-visualização — mas nossas páginas não entregam imagem.** A página `/evento/$slug` está com `ssr: false` e só define `title`; não tem `og:image`. E a capa do evento é servida por **URL assinada que expira em 1 hora**, de um bucket privado — inutilizável para preview.

Ou seja: para a imagem "ir junto" sem Z-API, o caminho é o **preview rico do link**.

## Plano

### 1. URL pública e estável para as imagens
- Nova rota `GET /api/public/events/$slug/cover` que lê a capa do bucket (cliente admin, server-side) e devolve os bytes com `Cache-Control` longo e `Content-Type` correto.
- Nova rota equivalente `GET /api/public/agitation-missions/$missionId/media` para a imagem da missão.
- Nada de URL assinada: link fixo, sem expiração, servido pelo próprio domínio (requisito dos crawlers do WhatsApp).

### 2. Preview rico na página do evento
- Tirar o `ssr: false` de `/evento/$slug` (mantendo a parte interativa client-only) e adicionar um `loader` público leve que busca título, descrição e capa.
- `head()` passa a emitir: `og:title`, `og:description`, `og:image` (URL absoluta da rota do item 1), `og:image:width`/`height`, `og:type=website`, `twitter:card=summary_large_image`.
- Resultado: ao colar o link do evento no WhatsApp, aparece o card grande com a capa.

### 3. Preview do link da missão
- Se a mensagem da missão aponta para o link exclusivo `/missao/$missionId/contato/$contactId`, essa página também ganha `head()` com `og:image` apontando para a imagem da missão (rota do item 2 acima), para o card aparecer mesmo quando não há evento.

### 4. Ajudar o agitador nos dois fluxos
- Devolver `media_path`/`media_filename` no endpoint público da missão e exibir a imagem no link público (hoje ausente), com "Baixar imagem".
- No modal de criação/edição da missão, um aviso curto: "A imagem vai aparecer como capa do link na conversa. Para enviar o arquivo em si, o agitador precisa anexá-lo."

## Sobre "tamanho real da imagem"

O WhatsApp decide entre **card pequeno (miniatura quadrada)** e **card grande** pela proporção e resolução da imagem — não dá para forçar por código. Para sair grande, a capa precisa ter no mínimo ~600×315 px e proporção próxima de 1.91:1 (ex.: 1200×630). Vou:
- adicionar `og:image:width`/`height` e `twitter:card=summary_large_image` (o que maximiza a chance do card grande);
- avisar no upload da capa quando a imagem estiver abaixo do recomendado, sugerindo 1200×630.

Ele **não** mostra a imagem em tamanho original dentro do balão — isso só existe quando o arquivo é anexado de fato.

## Detalhes técnicos
- Rotas em `src/routes/api/public/...` com `createFileRoute` + handler `GET`, lendo do bucket `campaign-media` via `supabaseAdmin` importado dentro do handler.
- `head()` precisa de URL **absoluta** — montada a partir do domínio publicado.
- Sem alterações de banco e sem Z-API. Nenhuma rota pública existente muda de endereço.
