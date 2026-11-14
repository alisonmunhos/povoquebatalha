---
name: Acesso ao MCP protegido por OAuth
description: Decisão do usuário sobre quem pode chamar o servidor MCP do app — só contas autenticadas, nunca público.
type: constraint
---

O servidor MCP do app (usado pelo Claude como conector) é protegido por OAuth, escolha explícita do usuário.

- Chamadores precisam entrar na conta do app e as ferramentas agem como esse usuário, respeitando as permissões e as regras de acesso do banco.
- Não tornar as ferramentas públicas, não abrir políticas de acesso anônimo, não expor dados de usuários, nem usar tokens de sessão copiados como mecanismo de integração.
- Se um pedido futuro pedir "sem login" para esses dados, oferecer o caminho OAuth ou deixar o dado fora, em vez de abrir o acesso.
