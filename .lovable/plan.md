## Diagnóstico

Rodei os dois builds (`bun run build` e `bun run build:dev`) e ambos completaram com sucesso. O servidor de dev também está respondendo `200 OK` em `http://localhost:8080/` com o HTML da aplicação, e não há erros nos logs do Vite.

Ou seja: **não existe erro de código no projeto agora**. A mensagem "Preview has not been built yet. Either your project has an error or the preview is currently being built." é uma mensagem da plataforma Lovable mostrada quando o iframe do preview não consegue carregar naquele instante — geralmente porque o processo do dev server ficou travado depois de mudanças recentes (renomes de arquivo `.client.ts` → `-browser.ts`, restarts anteriores).

## Ação proposta

1. Reiniciar o dev server do sandbox (`code--restart_dev_server`) para destravar o preview.
2. Confirmar depois que o iframe carrega — se por acaso aparecer algum erro real após o restart, aí sim investigar código.

Nenhuma alteração de código, banco, servidor ou automação está prevista. Se o problema persistir após o restart, o próximo passo é abrir o console do navegador e ver o erro real, porque o build local está limpo.