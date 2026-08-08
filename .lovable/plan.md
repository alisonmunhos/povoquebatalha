# Por que "Teste plenária 1" não apareceu na ficha do Pyerre

## O que os dados mostram (verificado agora)

- Contato: **Pyerre schantz garcias**. A observação **"Teste plenária 1"** existe no histórico (registro de hoje, 13:49 de Brasília).
- O campo **Observações** da ficha dele está **vazio**, e a ficha não foi atualizada hoje às 13:49 (última alteração: 11:43).
- No mesmo dia, o caso do Guilherme só ficou certo porque foi corrigido **manualmente** por mim (13:46) — não pelo aplicativo.
- Conclusão: a busca não acha o texto porque a busca da Gestão da Base olha o campo Observações da ficha, e ele continua vazio. Ou seja: a cópia automática da observação para a ficha **não rodou** nesse registro.

## Causa provável (ainda não confirmada)

A correção que faz o swipe copiar a observação para a ficha foi feita no código, mas o registro do Pyerre foi criado por uma versão que ainda não tem essa correção (site publicado / aba antiga aberta). A segunda hipótese é que a cópia rodou e falhou em silêncio — hoje, se der erro, a falha só vai para o log do servidor e o usuário vê "salvo" do mesmo jeito.

Como as duas hipóteses levam ao mesmo sintoma, o primeiro passo do trabalho é confirmar qual foi, com um teste real de gravação.

## O que vai ser feito

1. **Confirmar a causa**: registrar uma observação de teste pelo swipe na versão atual e verificar se ela chega ao campo Observações da ficha. Isso separa "versão antiga" de "falha silenciosa".
2. **Tirar o silêncio do erro** (resolve casos futuros): quando a cópia para a ficha falhar, o salvamento deixa de ser reportado como sucesso pleno — o aplicativo avisa na tela que a observação foi registrada no histórico mas não entrou na ficha, com opção de tentar de novo.
3. **Rede de segurança**: uma verificação que, ao abrir a ficha/timeline, detecta observações do histórico que não estão no campo Observações e as acrescenta (sem duplicar, sem sobrescrever). Assim, mesmo que uma gravação escape, o dado se autocorrige.
4. **Correção retroativa**: acrescentar "Teste plenária 1" na ficha do Pyerre e varrer todas as observações do histórico (território/swipe e agitação) que ainda não estão no campo Observações, corrigindo todas — não só as de hoje.
5. **Publicar**, para o site em produção passar a usar o mesmo caminho (é lá que o cadastro em campo está sendo feito).
6. **Teste final**: abrir a ficha do Pyerre e buscar "Teste plenária 1" na Gestão da Base.

## Detalhes técnicos

- `src/lib/territory-logs.functions.ts` → `logTerritoryAction`: hoje chama `appendContactObservacao` em modo best-effort. Passar a capturar o resultado e devolver `{ ok, fichaAtualizada }`; `AddNoteSheet.tsx` e `TerritoryMapView`/`territorio.tsx` mostram aviso quando `fichaAtualizada === false`.
- `src/lib/contact-observacoes.server.ts` → `appendContactObservacao` passa a retornar booleano em vez de `void` (mantendo o log de erro). Mesmo tratamento aplicado em `src/lib/agitacao.functions.ts`.
- Reconciliação: função server-only que compara `territory_contact_logs`/`agitacao_contact_logs` (`action = 'observacao'`, `note` não nula, `hidden_at` nulo) com `contacts.observacoes` e completa o que falta usando `buildObservacoes` (idempotente pelo prefixo de data/hora). Chamada na leitura da timeline do contato.
- Backfill histórico por SQL, no mesmo formato de prefixo, sem duplicar linhas já presentes. Nenhuma mudança de schema; nada é apagado.
