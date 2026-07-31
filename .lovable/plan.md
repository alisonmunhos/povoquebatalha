## Diagnóstico (verificado agora no banco e no código)

1. **A triagem não guarda nada, por construção.** No `use-triage-queue`, "Manter" e "Pular" só existem na memória do navegador; nada vai ao banco. Ao sair da tela, o progresso é perdido e a fila recomeça do zero. Só "Arquivar" (botão vermelho) grava algo.
2. **Erros do Swipe são invisíveis.** Na tela `/triagem/$segmentId`, quando uma ação falha, a mensagem é colocada em um botão escondido para leitores de tela (`sr-only`) — ninguém vê o aviso. A pessoa continua arrastando achando que salvou.
3. **Segmento "Smed" (o "sede"): 757 contatos, ZERO arquivados, nenhuma data de arquivamento registrada.** Também não há registro de arquivamento no log de auditoria. Ou seja: nada foi gravado — não há o que reverter nem recuperar. Não é possível reconstruir quais contatos ela arquivou, porque a decisão nunca saiu do navegador dela.
4. **Acesso:** o bloqueio por papel afeta somente quem é *só* agitador (é levado para /agitacao e nem `/segmentos` nem `/triagem/...` estão liberados). **Operador não é bloqueado pela rota**, mas o item "Segmentos" no menu aparece só para `admin` e `vrm` — então operador não encontra a tela. As permissões do banco (RLS) já permitem operador ler segmentos e arquivar contatos.
5. **Segmentos "Alicerce" não excluem** porque a regra atual bloqueia exclusão quando existe campanha vinculada: "Alicerce" está em 2 campanhas em rascunho e "ALICERCE ENVIO 4" em 1 campanha cancelada.
6. **Excluir segmento nunca apaga contatos** (confirmado: só a lista de IDs/filtro e os links de compartilhamento). Também não desfaz arquivamentos — arquivar age no contato, não no segmento.

## Plano de correção

### 1. Persistir as decisões da triagem (o ponto central)
- Nova tabela `segment_triage_decisions` (segmento, contato, usuário, decisão `manter|arquivar|pular`, data), com permissões e RLS (staff gerencia; agitador vê/grava as próprias).
- Servidor: `recordTriageDecision` e `undoTriageDecision`; a fila (`listSegmentTriageQueue`) passa a excluir contatos já decididos por aquele usuário e a contar o progresso real.
- Resultado: sair e voltar retoma exatamente de onde parou; "Manter" e "Pular" deixam de ser perdidos.

### 2. Tornar as falhas visíveis e o arquivamento confiável
- Substituir o botão escondido por `toast` de erro real na tela de triagem.
- Se arquivar falhar, o contato volta para o topo da fila (não é contado como triado) com aviso claro.
- Botão vermelho continua sendo "arquivar contato" — mesma função única já usada na Gestão da Base e nas missões (`setContactArchived`), com registro em histórico.

### 3. Acesso do operador
- Incluir `operador` no item de menu "Segmentos" (`AppShell`), liberando também o Swipe (a rota já permite).
- Sem mudança para agitador-only: continua restrito a /agitacao, /minhas-missoes, /meu-impacto — lá o "não quer receber"/"erro de número" segue como o caminho de arquivamento dele (mesma ação do vermelho no swipe).

### 4. Excluir segmento com segurança
- Ao excluir, em vez de bloquear: se as campanhas vinculadas estiverem em rascunho/cancelada, o vínculo é desfeito (campanha fica sem público) e o segmento é excluído, mostrando antes quais campanhas serão afetadas e quantas.
- Campanhas em execução/agendadas continuam bloqueando, com mensagem explicando o porquê.
- Reforçar na confirmação: "Isso remove apenas o segmento. Os contatos e os arquivamentos feitos no Swipe permanecem."

### 5. Sobre o segmento "sede"/Smed
- Não há ações gravadas para reverter ou atualizar. Depois das correções acima, o trabalho passa a ser salvo em tempo real. Se quiser, eu deixo esse segmento pronto para retomada (nada a limpar, já está intacto: 757 contatos, nenhum arquivado).

## Detalhes técnicos
Arquivos afetados: nova migration `segment_triage_decisions`, `src/lib/segment-triage.functions.ts`, `src/hooks/use-triage-queue.ts`, `src/routes/_authenticated/triagem.$segmentId.tsx`, `src/lib/segments.functions.ts` (delete com desvínculo), `src/routes/_authenticated/segmentos.tsx` (confirmação), `src/components/AppShell.tsx` (papel operador). Nenhum dado de contato é apagado em nenhuma etapa.
