## Primeiro: o que significa aquela frase

"500 pessoas. Você é história dessa campanha." é o **texto de reconhecimento da última faixa de conquista** (badge "Lenda do Povo que Batalha"), definido em `src/lib/impact-milestones.ts`. Ele aparece porque o total de conexões da pessoa passou de 500 — não é texto fixo da tela. Cada faixa (1, 10, 50, 100, 250, 500) tem badge + frase própria. Se quiser reescrever essas frases, é só me dizer os textos.

## O que vou construir

### 1. Três recortes de conquista: Total, Hoje e Semana

Os números já existem por dia no servidor (`getMyImpactStats`). Vou acrescentar um recorte semanal e expor:

- **Total** (como é hoje)
- **Hoje** (mensagens + cadastros do dia)
- **Semana fechada** (a semana que acabou) e **semana em curso**

Janela da semana (fuso Brasília): começa na **meia-noite que vira sexta para sábado (sábado 00:00)** e termina exatamente 7 dias depois (sábado 00:00 seguinte). A notificação sai **sábado de manhã**, falando da semana que acabou de fechar. Se você quisesse sexta 00:00 → sexta 00:00, me avise antes de eu implementar.

### 2. Compartilhamento em 3 versões

Na tela "Meu impacto", os botões passam a ter seletor de recorte:

- Compartilhar **conquista geral** (card atual)
- Compartilhar **conquista de hoje**
- Compartilhar **conquista da semana** (visual roxo, com os 7 dias da semana fechada)

Mesmo mecanismo de imagem (1080x1350, PNG, sem nome/telefone de ninguém).

### 3. Notificação semanal roxa — separada das conquistas atuais

- Novo tipo de notificação `weekly_impact`, com etiqueta roxa "SEMANA" no sino e no modal — visualmente distinta de MISSÃO/APROVAÇÃO.
- Ao abrir, mostra: mensagens da semana, cadastros da semana, comparação com a semana anterior, mini-gráfico dos 7 dias e botão **"Compartilhar minha semana"**.
- Fica sempre disponível na lista (não expira, não é cancelada automaticamente).
- **Não mistura** com a tela/card de conquista geral: rota própria `/minha-semana`, com o card semanal próprio. A tela "Meu impacto" segue como está (só ganha os botões de recorte).

### 4. Envio automático todo sábado

- Endpoint `POST /api/public/jobs/weekly-impact` que calcula a semana fechada de cada agitador/usuário ativo, insere a notificação roxa e dispara o web push.
- Só envia para quem teve alguma ação na semana (quem fez zero não recebe cobrança automática).
- Agendamento via job do banco (pg_cron) para **sábado 9h (Brasília)**, com proteção contra envio duplicado no mesmo sábado.

### 5. Teste imediato pra você ver

Junto com a implementação, disparo **agora** a notificação da sua semana (mesmo fora de sábado) para o seu usuário, usando o mesmo caminho real do job. Você vai ver o sino, o modal roxo e o botão de compartilhar já com os seus números.

## Detalhes técnicos

- `src/lib/impact-stats.functions.ts`: novo `period` no retorno (`today`, `week`, `previousWeek`, `weekDaily`, `weekRange`) reaproveitando os mapas por dia que já existem; nada de query nova pesada.
- `src/lib/impact-milestones.ts`: frases próprias de semana (ex.: "Semana de 12 conexões"), sem tocar nas faixas existentes.
- `src/components/ImpactShareCard.tsx`: ganha prop `variant: "total" | "day" | "week"` (paleta roxa `#7B4B94` na semana).
- `src/lib/weekly-impact.server.ts`: cálculo da janela + montagem/inserção das notificações + push (reaproveita `sendPushToUsers` do padrão de `system-notifications.server.ts`).
- `src/routes/api/public/jobs/weekly-impact.ts`: rota pública protegida por `apikey`, idempotente por semana (chave da semana gravada em `cta_payload`).
- `src/components/NotificationBell.tsx`: etiqueta e detalhe roxos para `kind = "weekly_impact"`, com CTA para `/minha-semana`.
- `src/routes/_authenticated/minha-semana.tsx`: tela da semana + compartilhar.
- Sem migration de schema nova (usa `notifications` como está); apenas o agendamento no banco.

## Cuidados

- Nenhum dado de contato aparece nos cards — só números agregados do próprio usuário.
- A tela e o card de conquista geral continuam funcionando igual; a semana é caminho separado.
- Se o web push estiver desativado no aparelho, a notificação continua aparecendo no sino do app.
