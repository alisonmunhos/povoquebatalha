# Normalizar segmentos e públicos de campanha

## Diagnóstico confirmado

O segmento **PMPA Campanha** é estático: guarda uma fotografia de **2.468 IDs** e também os filtros que deram origem a ela. Hoje:

- 2.465 desses contatos ainda existem; 3 foram removidos;
- 8 estão arquivados e 8 têm opt-out;
- todos os demais têm consentimento e telefone enviável;
- os filtros originais, recalculados hoje, retornam 2.458 contatos — uma lista dinâmica pode mudar, enquanto a lista estática não muda sozinha.

Há três falhas de implementação confirmadas:

1. Ao abrir um segmento estático no CRM, a tela zera os filtros de origem. Isso faz a base inteira aparecer ao fundo, embora a seleção fixa continue sendo outra lista.
2. A tela “Nova campanha” apenas grava o vínculo com o segmento. Ela não resolve nem prepara os destinatários na criação, então a campanha nasce mostrando zero.
3. A preparação/criação de campanha ainda consulta milhares de IDs em uma única requisição. O assistente já foi corrigido para usar lotes, mas os demais caminhos não; listas grandes podem falhar ou voltar vazias.

## Correção

1. **Criar uma única resolução de público no servidor**
   - Aceitar segmento estático, segmento dinâmico, filtros do CRM ou IDs selecionados.
   - Aplicar tanto filtros simples quanto filtros relacionais (tags, missões e exclusões).
   - Buscar contatos em lotes, propagar erros e remover IDs inexistentes sem zerar silenciosamente.
   - Usar a regra única de elegibilidade já existente para consentimento, opt-out, arquivamento, WhatsApp e telefone.

2. **Usar essa resolução em todos os caminhos de campanha**
   - Estatísticas do assistente.
   - Criação pelo assistente do CRM.
   - Criação pela tela “Nova campanha”.
   - Prévia e botão de preparar/reprocessar campanha.
   - Gravar `campaign_recipients` e `total_destinatarios` já na criação do rascunho, evitando campanhas zeradas.

3. **Corrigir a abertura do segmento estático no CRM**
   - Manter os 2.468 IDs como a seleção fixa usada no envio.
   - Restaurar e exibir os filtros que originaram o segmento, sem transformar silenciosamente a lista estática em dinâmica.
   - Restringir a tabela aos membros existentes do segmento, em vez de mostrar toda a base.
   - Exibir um resumo claro: “2.468 salvos · 2.465 existentes · 2.457 aptos agora”, com os motivos dos descartes.

4. **Eliminar contagens enganosas**
   - A contagem de segmento estático passará a diferenciar IDs salvos, contatos existentes e contatos aptos.
   - O assistente mostrará também IDs removidos/inexistentes, para a soma dos cartões fechar.
   - Segmentos dinâmicos continuarão recalculando; segmentos estáticos continuarão sendo fotografia fixa.

## Validação

- Rodar o typecheck.
- Abrir `/contatos?segment=b26ed144-16a7-4dea-81ac-aaa955cc60f5` e confirmar filtros, tabela, seleção e resumo coerentes.
- Abrir o assistente e confirmar público real, aptos e descartes — nunca zero silencioso.
- Criar uma campanha de teste com **PMPA Campanha** e confirmar que ela já nasce com destinatários e filas preparadas.
- Conferir no banco que `total_destinatarios`, `audience_ids` e `campaign_recipients` têm a mesma quantidade elegível.

## Cuidados

- Nenhum contato ou segmento será apagado.
- Os 3 IDs sem contato serão apenas informados como inexistentes; não serão recriados automaticamente.
- Os 8 arquivados/opt-out continuarão bloqueados por segurança.
