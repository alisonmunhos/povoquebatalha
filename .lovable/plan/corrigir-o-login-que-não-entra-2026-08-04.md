# Corrigir o login que "não entra"

## O que descobrimos

Sua senha está certa e o login **está funcionando** no servidor: a conta
`alisonmunhos@gmail.com` registrou entrada hoje às 12:58 UTC, tem papel `admin`
e status `ativo`. Ou seja: o problema não é senha nem permissão — é a tela.
Depois de autenticar, o app não consegue completar a virada para o painel e
volta a mostrar o cartão de "Entrar" (na captura, a barra de endereço já está
em `/dashboard` mas o formulário continua na tela).

Duas causas prováveis, ambas no lado da interface:

1. A verificação de acesso do painel roda antes da sessão terminar de ser
   gravada no navegador; se essa checagem falha uma vez, o usuário é mandado de
   volta para a tela de entrar, mesmo já logado.
2. A tela de entrar apresenta um erro de renderização (o servidor e o navegador
   montam telas diferentes), o que faz a tela ser remontada e "engolir" a
   navegação para o painel.

## O que vamos fazer

1. **Garantir a entrada no painel**: após validar a senha, aguardar a sessão
   estar realmente disponível antes de navegar e, se a navegação interna não
   ocorrer, fazer a ida ao destino de forma direta (recarregando a rota). Assim
   a entrada acontece na primeira tentativa.
2. **Tornar a porta do painel tolerante**: a checagem de acesso passa a aceitar
   a sessão já existente e só manda para a tela de entrar quando realmente não
   há sessão (com uma segunda tentativa em caso de falha momentânea de rede),
   em vez de expulsar por um erro transitório.
3. **Corrigir o erro de renderização da tela de entrar**, eliminando a
   remontagem que atrapalha o redirecionamento.
4. **Mensagens claras**: quando o acesso for negado por papel/status, dizer
   exatamente isso; quando for falha de conexão, dizer para tentar novamente —
   nunca ficar em silêncio.

## Detalhes técnicos

- `src/routes/auth.tsx`: após `signInWithPassword`, confirmar a sessão
  (`getSession`) antes de consultar papéis; substituir a navegação frágil por
  navegação com fallback de `window.location.assign(dest)`; envolver o retorno
  para eliminar a divergência de hidratação (evitar diferença de árvore entre
  SSR e cliente nesta rota, tornando-a `ssr: false` se necessário).
- `src/routes/_authenticated/route.tsx`: no `beforeLoad`, usar sessão local
  primeiro e só então validar com `getUser`, com um retry curto; redirecionar
  para `/auth` apenas quando não houver sessão alguma.
- Sem mudanças de banco de dados, migrations ou regras de permissão.

## Como testar

Abrir `povoquebatalha.lovable.app`, entrar com e-mail e senha: deve cair direto
no painel. Recarregar a página do painel deve continuar logado. Sair deve voltar
para a tela de entrar.
