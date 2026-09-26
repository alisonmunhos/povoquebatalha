# Converter o PDF em feed contínuo de imagens

## O que será feito

- Criar um script Node reproduzível para renderizar o PDF anexado em largura original, cortar a página em fatias de 1.500 px e gerar WebP com qualidade 80.
- Executar o script uma vez e salvar as fatias finais em `public/feed/`, incluindo dimensões previsíveis para cada arquivo.
- Substituir o visualizador de PDF na página desse material por uma coluna contínua de imagens, sem espaços, com largura máxima de 892 px e carregamento progressivo.
- Reservar a proporção de cada fatia antes do carregamento para impedir saltos durante a rolagem.
- Usar a primeira fatia como imagem de compartilhamento do WhatsApp por uma URL pública absoluta.

## Preservação

- Páginas legais somente de texto continuarão iguais.
- A página do termo de consentimento não será alterada.
- O PDF original continuará disponível para download, mas não será renderizado na página.

## Validação

- Conferir a quantidade, dimensões e tamanho das fatias geradas.
- Testar a leitura contínua no computador e no celular, verificando encaixe, ausência de espaços e estabilidade da rolagem.
- Conferir as informações de compartilhamento e a compilação final.