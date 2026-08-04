# Corrigir os botões "Liberar" na tela da missão

## O que está acontecendo

Ao clicar em "Liberar selecionados", "Liberar parados" ou "Liberar todos", nada acontece: nenhum aviso, nenhum erro, e a lista não muda. No registro de rede da sua sessão não há nenhuma chamada ao servidor depois do clique — ou seja, a ação nem chega a sair do navegador.

Duas causas, ambas confirmadas no código:

1. **A confirmação travando a ação.** As três funções começam com uma janelinha nativa de confirmação (`confirm(...)`). Dentro do preview (e em alguns navegadores/celulares) essa janela é bloqueada e a resposta volta como "não", então a função encerra silenciosamente. Isso explica o clique sem nenhum efeito nem mensagem.

2. **Volume de contatos.** Mesmo quando a confirmação passa, essa missão tem ~749 contatos e a liberação envia todos os identificadores de uma vez em uma única consulta ao banco. Listas desse tamanho estouram o limite de tamanho da requisição — o mesmo problema já corrigido antes na criação de missões e no envio de campanhas.

## O que vai ser feito

1. **Trocar a confirmação nativa por um diálogo do próprio app** (mesmo padrão já usado em outras telas), mostrando quantos contatos serão liberados e o que acontece com eles. Assim a ação sempre funciona, no preview e no celular.

2. **Liberar em lotes no servidor.** A função de liberação passa a processar os contatos em blocos (ex. 200 por vez), somando o total liberado, para funcionar com qualquer quantidade.

3. **Feedback claro:** botão em estado "Liberando…" enquanto processa, aviso de sucesso com o número real de contatos liberados e mensagem de erro visível caso algo falhe (hoje um erro pode passar em branco).

## Detalhes técnicos

- `src/routes/_authenticated/missoes-agitacao.$missionId.tsx`: substituir `confirm()` em `onUnassign` e `onUnassignAll` por um `AlertDialog` (shadcn) com estado de pendência; desabilitar os botões enquanto a chamada está em curso.
- `src/lib/agitation-missions.functions.ts` (`unassignMissionTask`): dividir `data.task_ids` em lotes antes do `select`/`update` com `.in("id", ...)`, acumulando os afetados; manter a trava que impede desarquivar tarefas com erro/opt-out e a lógica de cancelar notificações por usuário.
- Sem mudanças de banco e sem alteração de regra de negócio.

## Cuidados

- "Liberar todos" continua esvaziando as atribuições da missão inteira; a confirmação deixará isso explícito antes de executar.
- Contatos arquivados por erro de número ou opt-out permanecem intocados.
