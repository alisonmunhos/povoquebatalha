## O que muda

Hoje a faixa "Jornada da campanha" no topo de `/missoes-agitacao/desempenho` só mostra números. Vamos permitir gerar e compartilhar um **cartão da campanha** (1080x1350), igual ao dos usuários, mas com linguagem institucional e cores próprias.

## Linguagem (infinitivo / terceira pessoa)

Em vez de "Hoje eu me conectei com", os textos passam a falar da campanha:

- Kicker: `CAMPANHA DO POVO QUE BATALHA`
- Headline: "Somar forças, uma conexão por vez" (patamares próprios, ex.: "Construir base", "Multiplicar contatos", "Ocupar cada rua")
- Número gigante = conexões da campanha, unidade "conexões"
- Selo do patamar (ex.: "Campanha · 500+")
- Rodapé: "X mensagens enviadas em missões · Y cadastros novos" + nota "sem contar contatos importados"
- Frase final no infinitivo: "Continuar batalhando. Chamar mais gente."
- Legenda do período: "Últimos 30 dias" / "Desde o começo"

## Cores (variação própria, sem gradiente)

Inverso do cartão pessoal, para diferenciar na hora: fundo **amarelo #F0AA04**, texto e número em **#16130F**, selo em **#7B4B94** com texto branco, barras do gráfico em **#16130F**. Mantém o punho/ícone do app e o burst de raios (em tom escuro).

## Onde fica

No painel `CampaignJourneyPanel`: botões **Compartilhar imagem** e **Baixar imagem**, mais uma mini-prévia do cartão. Só visível para quem já acessa a tela de desempenho (papéis de equipe) — nenhum dado pessoal aparece no cartão, apenas totais.

## Detalhes técnicos

- `src/lib/campaign-journey.functions.ts`: acrescentar `daily` (7 dias: mensagens enviadas + cadastros por dia) e `rangeLabel`, para o mini-gráfico. Continua somente leitura.
- Novo `src/components/CampaignShareCard.tsx`: mesmo layout/estrutura do `ImpactShareCard`, com a paleta e os textos institucionais.
- Novo `src/lib/campaign-milestones.ts`: patamares da campanha (0, 50, 100, 500, 1.000, 5.000, 10.000+) com headline/selo/frase no infinitivo.
- Generalizar as ações de compartilhar: extrair de `ShareCardActions` um wrapper que aceita qualquer nó de cartão (`children`/render prop), reaproveitando `elementToPngBlob`, `downloadBlob` e `sharePng`. O cartão pessoal continua funcionando igual.
- `CampaignJourneyPanel.tsx` passa a receber `days`/`periodoLabel` e renderiza as ações.
- Nada muda no cartão pessoal, nas notificações de sábado ou no cálculo das jornadas individuais.
