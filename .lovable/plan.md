## Objetivo

Simplificar a Central de Acesso: remover o escopo territorial (que ficou como resíduo), esclarecer as ações e dar ao admin controle total sobre convites e senhas.

## 1. Limpar o escopo territorial (o que sobrou da mudança anterior)

Quando você pediu para não exigir mais escopo, eu removi a **obrigatoriedade** (todos os usuários passaram a ver tudo), mas deixei a UI de "Escopos" ativa como filtro opcional — daí a coluna "1 regra(s)" / "sem escopo" e o botão **Escopos** que você está vendo.

- Remover a coluna **Escopos** e o botão **Escopos** da tabela de usuários.
- Remover o editor `ScopesEditor` da página `/usuarios`.
- Apagar automaticamente todos os registros existentes em `user_territory_scopes` (reset), já que não estão mais em uso.
- Manter a tabela no banco (por ora vazia) para não quebrar código legado, mas sem interface.

Resultado: nenhum usuário terá restrição territorial. Todos veem a base inteira.

## 2. Esclarecer Suspender vs. Revogar vs. Excluir

Hoje as duas ações estão parecidas e confundem. Vou deixar assim:

| Ação | O que faz | Reversível? | Quando usar |
|---|---|---|---|
| **Suspender** | Bloqueia login temporariamente. Papel e histórico ficam preservados. | Sim (botão "Reativar") | Afastamento, férias, desconfiança momentânea |
| **Revogar acesso** | Remove todos os papéis. O usuário perde acesso ao painel mas a conta existe (histórico preservado, pode ser reativado com novo papel). | Sim (dando novo papel) | Saída da equipe mantendo rastro |
| **Excluir conta** | Apaga o usuário do sistema (auth + papéis). Permite convidar o mesmo e-mail de novo do zero. | **Não** | Convite errado, e-mail digitado errado, quer reenviar convite limpo |

- Adicionar botão **Excluir** (ícone lixeira vermelho) também na aba **Ativos**, ao lado de Revogar, com confirmação dupla mostrando o e-mail.
- Trocar rótulos e adicionar tooltip curto em cada botão explicando a diferença.
- Renomear "Revogar" para "Revogar acesso" para diferenciar visualmente de Excluir.

## 3. Sempre gerar link de convite (não depender do e-mail)

Você relatou que os convites por e-mail não chegam. Solução: além de tentar enviar o e-mail, **sempre** gerar o link direto na hora do convite e mostrá-lo em um modal para você copiar e enviar manualmente (WhatsApp, etc.).

- Após clicar **Enviar convite**, abrir um modal com:
  - E-mail convidado + papel.
  - Campo com o **link de aceite** (URL pronta para o usuário definir a senha).
  - Botão **Copiar link**.
  - Botão **Copiar mensagem pronta** (texto tipo: "Olá! Você foi convidado para a Central. Clique aqui para criar sua senha: [link]. O link expira em 7 dias.").
- Na aba **Convites pendentes**, manter o botão "Copiar link" (para gerar novo link se o antigo expirou) e reforçar visualmente o botão.
- No convite, guardar internamente o `redirectTo` para `/aceitar-convite` (já existe).

## 4. Reset de senha pelo admin

Adicionar ação **"Redefinir senha"** para usuários **ativos**:

- Botão com ícone de chave 🔑 na linha do usuário.
- Ao clicar, o admin escolhe entre duas opções em um pequeno modal:
  1. **Enviar e-mail de redefinição** (padrão do Supabase — pode falhar como o convite).
  2. **Gerar link de redefinição** (recomendado): gera uma URL única via `generateLink({ type: 'recovery' })` que você copia e envia por WhatsApp. O usuário abre, define nova senha e entra.
- Nova rota pública `/redefinir-senha` que trata o token de recovery e mostra formulário de nova senha.
- Registrar no log de auditoria (`senha_redefinida_por_admin`).

## 5. Detalhes técnicos (para referência)

- **Frontend**: `src/routes/_authenticated/usuarios.tsx` — remover coluna Escopos, adicionar botões Excluir e Redefinir senha, criar modal reutilizável `InviteLinkModal` e `ResetPasswordModal`.
- **Server functions** em `src/lib/users.functions.ts`:
  - Alterar `inviteUser` para retornar `{ userId, actionLink }` (gera link junto).
  - Nova `generatePasswordResetLink({ userId })` — usa `supabaseAdmin.auth.admin.generateLink({ type: 'recovery' })`.
  - Nova `sendPasswordResetEmail({ userId })` — usa `resetPasswordForEmail`.
- **Nova rota pública**: `src/routes/redefinir-senha.tsx` (fora de `_authenticated`), trata `type=recovery` no hash e chama `supabase.auth.updateUser({ password })`.
- **Migration**: `DELETE FROM public.user_territory_scopes;` para zerar os escopos existentes.
- Sem mudança de schema; tabela `user_territory_scopes` fica lá dormindo.

## O que NÃO vou mexer

- Fluxo de aceite de convite existente (`/aceitar-convite`).
- Sistema de papéis (`user_roles`) e permissões.
- Cadastro público continua desabilitado — só convite.
