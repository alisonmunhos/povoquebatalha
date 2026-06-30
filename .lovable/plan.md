## Página visual para criar o primeiro administrador

Vou criar uma página pública `/primeiro-acesso` que substitui completamente o passo do terminal/curl. Toda a lógica de segurança permanece no backend.

### O que vou criar/alterar

**1. Novo endpoint público de checagem** `GET /api/public/bootstrap-admin`
- Retorna `{ exists: boolean }` indicando se já existe algum admin.
- Sem expor IDs, e-mails ou qualquer dado de usuário.
- O `POST` já existente continua igual (cria o convite e auto-bloqueia depois).

**2. Nova página `src/routes/primeiro-acesso.tsx`** (pública, sem auth)
- No carregamento, chama o `GET` acima.
- **Se já existe admin:** mostra "O primeiro administrador já foi criado. Faça login normalmente." + botão "Ir para login" (`/auth`). Formulário não aparece.
- **Se não existe admin:** mostra formulário com:
  - 1 campo de e-mail (validado com zod: `.email()`, max 255, trim, lowercase)
  - botão "Criar primeiro administrador"
- Ao enviar: chama `POST /api/public/bootstrap-admin` com `{ email, redirectOrigin: window.location.origin }`.
- Em caso de sucesso: substitui o formulário por "Convite enviado. Verifique seu e-mail (incluindo a caixa de spam) para definir a senha."
- Em caso de erro 403 (corrida — alguém criou no meio tempo): mostra a mesma mensagem de "já existe admin".

**3. Nenhuma mudança em:**
- `/auth` (continua só login + recuperar senha)
- `/usuarios` (continua sendo o único caminho para novos usuários)
- `/aceitar-convite`
- RLS, papéis, convites, signup desativado no Cloud Auth

### Garantias de segurança

- **Nenhum token, service role key ou função admin é exposta no frontend.** A página só faz `fetch` para `/api/public/bootstrap-admin` (GET e POST).
- A trava do "só uma vez" continua **no servidor** (consulta `user_roles` pelo papel `admin` antes de aceitar). Mesmo se alguém abrir `/primeiro-acesso` depois, o backend recusa com 403.
- Validação com zod tanto no cliente (UX) quanto no servidor (segurança).
- Sem logs do e-mail no console.

### Como você vai fazer o primeiro acesso (linguagem simples)

1. **No navegador, abra a página** `…/primeiro-acesso` (vou te passar o link exato depois).
2. **Digite seu e-mail** no campo e clique em **Criar primeiro administrador**.
3. **Abra seu e-mail** (confira também o spam) e clique no link do convite.
4. **Escolha uma senha** (mínimo 6 caracteres) na tela que abrir e confirme.
5. **Pronto, você está dentro do painel** como administrador.
6. **A página `/primeiro-acesso` para de funcionar** automaticamente — qualquer pessoa que tentar acessar depois vê "O primeiro administrador já foi criado".
7. **Para liberar acesso a outras pessoas**, vá no menu lateral em **Usuários → Convidar novo usuário**, escolha o papel (Admin, Operador ou Leitor) e envie. Cada convidado recebe e-mail e segue os passos 3 e 4.

### Arquivos

- **Editar:** `src/routes/api/public/bootstrap-admin.ts` (adicionar handler `GET`, manter `POST` como está).
- **Criar:** `src/routes/primeiro-acesso.tsx` (página com a UI).

Posso aplicar?
