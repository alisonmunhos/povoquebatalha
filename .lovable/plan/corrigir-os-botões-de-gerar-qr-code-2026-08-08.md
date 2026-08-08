# Corrigir os botões de gerar QR code

## O que está acontecendo

Verifiquei todos os botões de QR do sistema. Existem três lugares:

1. **Formulário → "Gerar QR code"** (topo da seção "Link e QR code") — funciona, mas só aparece depois que existe um link selecionado.
2. **Formulário → "Gerar QR deste link"** (na lista "Links deste formulário", o botão circulado no print) — **está quebrado**. Ele apenas seleciona o link e apaga o QR que estava na tela; não gera nada. O QR só aparece se a pessoa rolar de volta para cima e clicar em "Gerar QR code". Na prática parece que o botão não faz nada.
3. **Link avulso de WhatsApp → "Gerar QR code"** — funciona.

Ou seja: o botão que você testou não gera o QR por desenho, não por falha de biblioteca.

## O que vou fazer

- Fazer o botão **"Gerar QR deste link"** realmente gerar o QR daquele link, na hora, sem depender de outro clique.
- Mostrar o QR (com "Baixar PNG") **dentro do próprio cartão do link**, junto do botão que foi clicado, para não obrigar a rolar a tela.
- Mostrar estado "Gerando…" e desabilitar o botão durante a geração, além de mensagem de erro clara se falhar.
- Nomear o arquivo baixado com o nome do link (ex.: `qrcode-dia-da-plenaria.png`), facilitando na impressão.
- Manter o botão "Gerar QR code" do topo funcionando como hoje, para o link recém-criado.
- Conferir os outros pontos de QR (link avulso e conexão do WhatsApp) para garantir que continuam funcionando.

## Detalhes técnicos

- Arquivo: `src/routes/_authenticated/entrada-dados.$id.tsx`.
- Hoje o `onClick` do botão da lista faz só `setLinkToken(l.token); setQrDataUrl(null)`. Vou trocar por uma função `loadQrForToken(token)` que monta a URL com `buildPublicUrl(token)`, chama `generateQrDataUrl` (import dinâmico já existente em `src/lib/qr-code-browser.ts`, para não quebrar no SSR) e guarda o resultado em estado por link (`{ token, dataUrl }`), com um `loadingToken` para o feedback.
- A renderização do QR passa a ser condicional dentro do `<li>` de cada link, mantendo o bloco do topo para o token atual.
- Sem mudanças de banco, de rotas públicas ou de links já compartilhados.
