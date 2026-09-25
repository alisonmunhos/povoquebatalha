# Corrigir visualização pública de PDFs

## O que será alterado

- Criar um visualizador próprio com PDF.js para carregar o endereço salvo em `pdf_url` e desenhar todas as páginas em sequência.
- Ajustar cada página à largura disponível, mantendo a proporção e a nitidez em telas de alta densidade.
- Dividir páginas muito altas em trechos de até 4.000 px para evitar falhas em iPhone/iPad.
- Exibir carregamento durante o processamento e, se houver falha, oferecer um link para abrir o PDF diretamente.
- Nas páginas com PDF, usar toda a largura útil no celular e limitar o conteúdo a 900 px no computador; preservar título e botão “Baixar PDF”.
- Melhorar o título de compartilhamento usando uma versão legível do slug, já que esta rota não é renderizada no servidor.

## Preservação

- Páginas sem PDF continuarão com o mesmo layout e comportamento de texto.
- A página `termo-de-consentimento-para-tratamento-de-dados-pessoais` não terá seu conteúdo nem seu fluxo alterados.

## Detalhes técnicos

- Instalar `pdfjs-dist` e configurar seu worker como recurso empacotado pelo Vite.
- Encapsular a renderização em um componente cliente, com cancelamento e limpeza ao trocar de documento ou sair da página.
- Aplicar a largura ampliada somente quando `pdf_url` estiver preenchido.
- Validar no navegador em telas de computador e celular e conferir a compilação final.
