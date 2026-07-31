# Missões de Agitação — próximos passos (Fase C reforçada)

## Contexto: o que já está pronto (Fase A, verificado no código)
- Status explícitos centralizados em `src/lib/agitation-task-status.ts`: `sem_acao`, `pendente_envio`, `enviado`, `arquivado_erro`, `arquivado_optout`.
- Cores: laranja = pendente, verde = enviado, vermelho = arquivado (sai da lista ativa).
- Filtros na tela do agitador: Não enviados / Pendente / Enviado / Arquivados.
- Trava: contato arquivado por erro/opt-out não volta sozinho para "sem atribuição".
- "Desfazer" da missão usa a mesma função da Gestão da Base (`contact-archive.server.ts`).
- Número da coordenação `+5551995131811` como padrão editável.
- Missões não usam Z-API — sempre link manual do WhatsApp.

## Falta fazer
Fase B (visual), Fase C (engajamento) e Fase D (BI do admin).

---

## Passo 1 — Fase B: dashboard e cartões de missão

Tela `/agitacao`:
- Sair os cards "Confirmados" e "Sem resposta" da linha de cima (seguem acessíveis pelos filtros da lista).
- "Meus captados" e "Ainda não abordados" descem para os quadrados de baixo.
- No lugar dos dois de cima, um retângulo roxo único, alinhado à largura dos dois de baixo: **Suas Missões**, com contagem de missões em aberto, levando para a tela de missões.

Tela `/minhas-missoes`:
- Deixar de empilhar todas as missões numa rolagem só: **um cartão por missão** (título, total de contatos, quantos enviados, selo de "ainda não concluída" e barra de progresso).
- Clicar no cartão abre a missão em foco; pegar mais lote da mesma missão volta sempre para a mesma tela dela.
- Preservar `/minhas-missoes?mission=ID` (link das notificações).

---

## Passo 2 — Fase C: "Meu Impacto" (a ideia melhorada)

A sua ideia melhora se, em vez de um cardzinho perdido dentro da missão, virar **uma tela própria de retrospectiva pessoal**, com dois pontos de entrada bem visíveis.

### Onde aparece
1. **Faixa resumida (sempre à vista)** no topo de `/agitacao` e dentro de cada missão: uma linha só —
   *"Você já se conectou com 47 pessoas · 12 hoje"* — clicável.
2. **Tela cheia `/meu-impacto`** ao clicar, com tudo: cards, gráfico e botão de compartilhar.

### O número principal
**Conexões = contatos adicionados por você + mensagens enviadas nas missões** (só `enviado`; nunca pendente, erro ou opt-out). É esse total que aparece como "Você já se conectou com X pessoas".

### O que a tela mostra
- 4 cards grandes: mensagens **hoje** / mensagens **no total**; contatos adicionados **hoje** / **no total**.
- Gráfico de barras dos últimos 7 dias (mensagens + contatos por dia), pra dar sensação de ritmo.
- Percentuais úteis: % da sua leva atual concluída e % das suas missões concluídas.
- Uma frase de reconhecimento que muda por faixa de conexões (ex.: 10, 50, 100, 250) — o toque "retrospectiva Spotify".
- Sequência de dias ativos (ofensiva), se houver dado suficiente.

### Compartilhar como imagem (o ponto central)
- Um bloco visual dedicado, formato **vertical 1080x1350** (bom pra status e grupo), com a identidade da campanha: punho, cor âmbar/roxo, nome do agitador, número grande de conexões, mini-gráfico e a frase de reconhecimento.
- Botão **"Compartilhar minha conquista"**:
  - onde o celular suporta, abre o menu nativo de compartilhamento já com a imagem anexada (vai direto pro WhatsApp);
  - onde não suporta, baixa a imagem e abre o WhatsApp com um texto pronto ("Já me conectei com 47 pessoas na campanha…"), pra pessoa anexar.
- Também um botão discreto "Baixar imagem".

### Cuidados
- Sem expor nome ou telefone de contato nenhum na imagem — só números agregados do próprio usuário (privacidade e LGPD).
- Nada de número inflado: pendente, erro e opt-out não contam em lugar nenhum.

---

## Passo 3 — Fase D: BI do admin
Painel de acompanhamento por usuário (envios, conexões, % de conclusão, ranking amigável) e um resumo compartilhável em grupo, reaproveitando o mesmo gerador de imagem da Fase C. Detalho quando B e C estiverem no ar.

---

## Detalhes técnicos
- Passo 1: só frontend/apresentação, sobre contagens já disponíveis em `listMyMissions`.
- Passo 2: uma função de servidor nova (`getMyImpactStats`) agregando `agitation_tasks` com status `enviado` por usuário e `contacts` criados pelo usuário, com cortes "hoje" e "últimos 7 dias"; nova rota `/meu-impacto`. A imagem é gerada no navegador (canvas/`html-to-image` carregado dinamicamente, sem quebrar SSR — mesmo padrão já usado no QR Code).
- Sem migração de banco nos passos 1 e 2.
