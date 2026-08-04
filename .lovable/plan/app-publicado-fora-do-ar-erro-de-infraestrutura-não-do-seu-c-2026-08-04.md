# App publicado fora do ar: erro de infraestrutura, não do seu código

## O que os registros mostram

Todas as visitas ao site publicado (`povoquebatalha.lovable.app`) estão respondendo erro
desde 04/08 00:31 UTC — inclusive páginas simples como o ícone do site e a página do evento.
A mensagem registrada no servidor é sempre a mesma:

```text
The compatibility flag nodejs_compat became the default as of 2026-08-04
so does not need to be specified anymore.
```

Esse ajuste ("nodejs_compat") é uma configuração da infraestrutura que hospeda o app,
definida pela plataforma no momento da publicação. Ela virou padrão hoje (04/08) e agora
recusa quem ainda a envia — foi isso que derrubou o app. Confirmei que o projeto **não tem
nenhum arquivo de configuração** que defina essa opção, então não há nada no seu código,
nas migrations de hoje ou na última alteração de missões que tenha causado a queda.

Já reportei o problema para a equipe da plataforma com os detalhes do erro.

## Plano de ação

1. Tentar uma nova publicação do app. Uma publicação nova é gerada com a configuração
   atualizada da plataforma e, na maioria dos casos, isso já restabelece o site.
2. Conferir os registros do servidor logo depois para ver se o erro parou de aparecer e se
   as páginas voltam a responder normalmente (página inicial, página de evento e formulários
   públicos).
3. Se o erro continuar, o desbloqueio depende da correção da plataforma — nesse caso eu aviso
   você com clareza, sem gastar mudanças de código à toa, já que alterar o app não resolve
   esse tipo de falha.

## Observação importante

Não vou "consertar" isso mexendo em código do projeto: qualquer alteração inventada aqui
(dependências, configuração de build, rotas) tende a criar problemas novos sem resolver o
erro real, que é externo ao app.
