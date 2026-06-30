## Como você vai testar agora

A tela `/auth` atual já permite **Criar conta** com e-mail + senha. Para o primeiro acesso:

1. Acesse `/auth` no preview
2. Clique em **Criar** (modo signup)
3. Use seu e-mail real + senha (mín. 6 caracteres)
4. Como a confirmação por e-mail está desativada por padrão no Cloud, você entra direto
5. Esse primeiro usuário será promovido a **admin** automaticamente (trigger já existente)

## Como travar o cadastro para só você autorizar

Hoje qualquer pessoa que abrir `/auth` consegue se cadastrar. Para virar **acesso por convite/autorização**, proponho:

### Mudanças

1. **Desabilitar signup público no Cloud Auth**
   - Via `configure_auth`: `disable_signup: true`
   - Resultado: o endpoint `signup` do Supabase passa a rejeitar qualquer tentativa direta pela tela

2. **Remover o modo "Criar conta" da tela `/auth`**
   - `src/routes/auth.tsx` passa a mostrar apenas Login + "Esqueci minha senha"
   - Some o toggle de signup e o campo "Nome completo"

3. **Fluxo de convite controlado por você (admin)**
   - Nova página `/_authenticated/usuarios` (só admin) com:
     - Lista de usuários existentes (e-mail, papel, data)
     - Botão **"Convidar usuário"** → e-mail + papel (admin/operador/leitor)
   - Server function `inviteUser` (com `requireSupabaseAuth` + checagem `private.has_role(..., 'admin')`)
     - Usa `supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo: <origem>/aceitar-convite })`
     - Grava o papel desejado em `user_roles` ao criar o usuário
   - Nova rota pública `/aceitar-convite` onde o convidado define a senha (`supabase.auth.updateUser({ password })`) e cai no dashboard

4. **E-mail do convite**
   - Por padrão o Cloud envia o convite com template básico. Posso, em passo separado, configurar o domínio de e-mail e personalizar o template `invite` (não incluído nesta entrega para manter o escopo).

### Resultado final

- Só você (admin) cria contas, dentro do painel, clicando em "Convidar"
- O convidado recebe e-mail, define senha e entra
- Tentativas diretas em `/auth` só permitem **login** — nunca cadastro

## Confirmações antes de implementar

- Posso seguir com **desabilitar signup público + tela de Convites + aceitar-convite**?
- Quer que o e-mail de convite use o template padrão por enquanto, ou já configuro domínio de e-mail customizado nesta etapa também?
