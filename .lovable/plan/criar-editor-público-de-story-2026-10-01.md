# Criar editor público de Story

## O que será feito
- Adicionar a rota pública `/story`, sem login e sem cabeçalho da área interna.
- Guardar a moldura enviada em `src/assets`, como solicitado, sem usar armazenamento externo.
- Exibir um editor 9:16 com a foto atrás da moldura, ocupando a largura do celular e limitado a 420 px no computador.
- Permitir escolher ou trocar a foto, arrastar com mouse ou dedo, ampliar com pinça ou rolagem e manter o enquadramento sempre cobrindo o Story.
- Corrigir a orientação de fotos de celular antes da edição, inteiramente no navegador.
- Gerar o resultado final em PNG 1080×1920 e abrir o compartilhamento nativo quando disponível; caso contrário, baixar a imagem e orientar a publicação no Instagram.
- Incluir o texto de privacidade, o link “Veja como eu voto” e as informações de compartilhamento da página usando a própria moldura.

## Validação
- Testar a página pública em computador e celular.
- Executar o fluxo completo: escolher foto, arrastar, aplicar zoom e gerar o PNG final.
- Conferir que nenhuma foto é enviada pela rede e que as outras rotas permanecem inalteradas.

## Detalhes técnicos
- Usar Pointer Events e um listener de rolagem não passivo, preservando o ponto sob o cursor durante o zoom.
- Ler a foto no navegador, respeitar a orientação EXIF e renderizar foto + moldura no canvas final.
- Manter dimensões reservadas no editor para evitar mudanças de layout.
