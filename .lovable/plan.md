## Situação atual (verificada agora)

- Seu lote está lá: **10 contatos sem ação** na missão `5e39f70f…`, atribuídos a você (`24fb8128…`) às 01:35 UTC de hoje — parados há poucos minutos.
- Você tem **3 aparelhos/navegadores inscritos** para receber push.
- Nenhum aviso de missão foi criado para você nas últimas 2h, então o bloqueio "um aviso por rodada" não vai atrapalhar o teste.
- O agendamento já aponta para o domínio publicado e o endpoint respondeu 200 no último teste.

Como o job só avisa quem está parado há mais de 1h, ele hoje não dispararia nada. O endpoint aceita parâmetros de tempo no corpo da chamada, então dá para simular sem mexer no código nem no agendamento.

## O que farei

1. Chamar uma vez o endpoint publicado `/api/public/jobs/release-stalled-missions` com os tempos reduzidos apenas nessa chamada:
   - avisar a partir de 0h (para pegar seu lote recém-pego)
   - liberar somente depois de 24h (para **não** devolver seus 10 contatos para a fila)
2. Conferir a resposta (`avisados` deve vir 1).
3. Confirmar no banco que a notificação foi criada para você, com título "Você ainda tem contatos esperando" e a contagem certa de contatos.
4. Confirmar que o envio de push foi disparado para os 3 aparelhos e reportar qualquer falha registrada nos logs do servidor.

## Cuidados

- Nada é alterado no agendamento, no código ou nos seus contatos: os tempos reduzidos valem só para essa chamada manual.
- Você deve receber a notificação no sininho e no celular. Se aparecer no sininho mas não no celular, o problema está na permissão/inscrição do aparelho — nesse caso eu investigo os logs de push em seguida.
