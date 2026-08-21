# Desligar a confirmação automática nas seções de transição "VAMOS CONTINUAR?"

## Situação atual

As 3 seções chamadas "VAMOS CONTINUAR?" (uma em cada formulário) estão hoje com a confirmação automática **ligada**. Elas ficaram assim porque a regra aplicada no ajuste anterior ligava a confirmação em qualquer seção que tivesse pelo menos uma pergunta — e essas seções têm uma pergunta: "COMO VOCÊ QUER PARTICIPAR?", com as opções QUERO SER UM APOIADOR / QUERO RECEBER INFORMAÇÕES / SOU DO COLETIVO ALICERCE.

Essa pergunta serve apenas para escolher o caminho seguinte do formulário (ramificação). A seção não encerra o preenchimento, então disparar confirmação ali é indevido.

## O que vai ser feito

Definir `confirmation_active = false` nas 3 seções "VAMOS CONTINUAR?" (ids `0580e8e6…`, `26d7d563…`, `faa84c35…`), sem tocar em nenhuma outra seção nem nas automações.

Resultado esperado após a mudança:

- Seções com confirmação ligada: 6 (as de coleta real de dados — "SEU CADASTRO", "SEU PERFIL", "SEU PERFIL DE APOIADOR(A)")
- Seções com confirmação desligada: 8 (as 3 de transição, as 3 "VOCÊ VAI RECEBER NOSSAS ATUALIZAÇÕES!" e as 2 finais "E AÍ, COMPA!")

## Detalhes técnicos

- Atualização de dados na tabela `form_sections`, filtrando pelos 3 ids exatos das seções de transição (não por título, para não pegar seções futuras por acaso).
- Nenhuma mudança de schema, de código ou de automações.
- Ao final, uma consulta de verificação confirma a contagem de seções com confirmação ligada/desligada.

## Observação para o futuro

A regra "tem pergunta = tem confirmação" não distingue perguntas de conteúdo de perguntas de roteamento. Se surgirem mais seções de transição, o ideal é marcar a seção como "transição" no construtor de formulários e deixar a confirmação sempre desligada nelas — isso não está incluído neste ajuste.
