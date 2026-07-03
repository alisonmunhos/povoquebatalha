## Ajuste de texto na Central de Acesso

O usuário apontou uma contradição na descrição de "Excluir conta" em `/usuarios`: dizemos que é possível convidar o mesmo e-mail do zero, mas também que "não é reversível".

Na verdade são duas coisas diferentes:
- **Reversível** = recuperar a conta antiga com histórico, papéis e vínculos preservados (isso não dá).
- **Convidar de novo** = criar uma conta nova, do zero, para o mesmo e-mail (isso dá, mas é outra conta).

### Alteração proposta

Arquivo: `src/routes/_authenticated/usuarios.tsx` (linha ~206)

Trocar:

> **Excluir conta** — apaga o usuário do sistema. Permite convidar o mesmo e-mail do zero. Não é reversível.

Por:

> **Excluir conta** — remove permanentemente o usuário, seus papéis e o histórico de acesso. A ação não pode ser desfeita: você pode convidar o mesmo e-mail novamente, mas será uma conta nova, sem o histórico anterior.

Sem mudanças de lógica, banco ou permissões — apenas texto explicativo.
