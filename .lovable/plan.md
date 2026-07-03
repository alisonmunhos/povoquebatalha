## Objetivo

Quando o usuário clica em **"Desfazer"** ou em **"Voltar para 'Ainda não abordado'"** no card de um contato em `/territorio`, o status de campo (contato feito / não encontrado / whatsapp aberto / pediu atualização) deve ser removido — mas o **histórico de observações permanece intacto** no drawer lateral.

## Regra de negócio

Ações são divididas em duas categorias:

- **Ações de status** (afetam a situação de abordagem): `contato_realizado`, `nao_encontrado`, `whatsapp_aberto`, `pediu_atualizacao` → apagáveis via desfazer/reset.
- **Observações** (registro histórico permanente): `observacao` → nunca apagadas por desfazer/reset. Continuam visíveis no drawer e no chip da última observação do card.

## Mudanças

### 1. `src/lib/territory-logs.functions.ts`

- **`undoLastTerritoryLog`**: no `SELECT` do último log, filtrar `action IN (contato_realizado, nao_encontrado, whatsapp_aberto, pediu_atualizacao)` — ignorar `observacao`. Assim "Desfazer" só remove a última ação de status recente; se a última ação recente foi uma observação, retorna `sem_log_recente`.
- **`resetTerritoryContact`**: trocar o `DELETE` por um `DELETE ... WHERE action <> 'observacao'`, preservando todas as observações do contato.

### 2. `src/routes/_authenticated/territorio.tsx`

- Ajustar o texto de ajuda do botão "Voltar para 'Ainda não abordado'" para deixar claro que **observações são mantidas** no histórico.
- Nenhuma mudança na lógica de filtros: as queries de `territory.functions.ts` já consideram apenas a última ação por contato, então remover as ações de status faz o contato voltar corretamente a "Ainda não abordado" enquanto o filtro **"Com observação"** continua listando-o se houver observações preservadas.

## Fora de escopo

- Sem migration de banco (a distinção é feita por `action` na query).
- Sem mudança no drawer `TerritoryContactLogDrawer` — ele já lista observações e continuará mostrando-as após o reset.
