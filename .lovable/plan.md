## Diagnóstico

O botão "Voltar para 'Ainda não abordado'" chama `resetTerritoryContact`, que executa um `DELETE` em `territory_contact_logs`. A tabela tem RLS habilitado, mas **só existem policies de INSERT e SELECT** — não há policy para DELETE.

Sob RLS, um DELETE sem policy correspondente não retorna erro: simplesmente afeta 0 linhas. Por isso o botão parece "não fazer nada" — o servidor responde ok, o toast some, mas o card continua exatamente como estava porque nenhum log foi apagado.

## O que fazer

### 1. Migration — criar policy de DELETE

Permitir que o próprio usuário apague seus logs de campo, e que papéis de gestão (admin, operador, vrm, territorio) apaguem logs de qualquer usuário — necessário porque um coordenador precisa poder resetar um contato marcado por outra pessoa da equipe.

```sql
CREATE POLICY tcl_delete_own_or_staff
ON public.territory_contact_logs
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR private.has_role(auth.uid(), 'admin')
  OR private.has_role(auth.uid(), 'operador')
  OR private.has_role(auth.uid(), 'vrm')
  OR private.has_role(auth.uid(), 'territorio')
);
```

### 2. Confirmar retorno útil no server function

`resetTerritoryContact` já retorna `deleted: count`. Vou aproveitar para, no cliente, checar `deleted === 0` e mostrar erro claro ("nada para apagar") em vez de sucesso falso — assim qualquer regressão futura de RLS aparece de imediato para o usuário.

### Cuidados

- Não altera dados existentes.
- Mantém `undoLastTerritoryLog` (janela de 5 min) funcionando igual.
- Após aplicar, o botão deve remover os selos do card e devolvê-lo para "Ainda não abordado" imediatamente.
