# Inbox: refinamento completo de UX/UI (sem mudar arquitetura)

Diagnóstico feito lendo o Inbox atual (`CommunicationInbox.tsx`, 1.447 linhas, tudo num arquivo) e as funções de dados (`communication.functions.ts`). Nada de banco, provedor, API ou regra de CRM muda. O trabalho é de apresentação, interação e completar a exibição de dados que **já existem** e hoje são descartados na tela.

## O que está confirmado hoje

Dados já disponíveis no backend mas **não usados na tela**:

- `delivered_at`, `read_at`, `failed_at` das mensagens enviadas → hoje não existem tiquinhos de enviado/entregue/lido.
- `reply_to_wa_id` das mensagens recebidas → hoje a resposta citada não aparece.
- `media_size`, `tipo` (`sticker`, `video`, `audio`, `document`) → vídeo e figurinha caem no fallback de "arquivo com link"; áudio usa player cru do navegador; documento não mostra tamanho.

Comportamentos que atrapalham:

- Sem separadores de data e sem agrupamento: cada mensagem repete horário e cabeçalho, o histórico fica "listão".
- Rolagem força o fim a cada atualização (a cada 15s e a cada mensagem nova), então quem está lendo histórico é jogado para baixo. Não existe "ir para a última mensagem" nem divisor "mensagens não lidas".
- Todas as mensagens da conversa são renderizadas de uma vez, sem limite inicial.
- Lista de conversas sem avatar, com 3 linhas densas de metadados e sem estados diferenciados (carregando = texto "Carregando…", vazio genérico igual para todos os filtros).
- Painel direito de CRM é uma pilha vertical longa de selects e blocos, sem agrupamento visual.
- Mobile: 3 painéis alternados por estado, sem barra inferior clara; composer não reserva espaço para o teclado virtual.

## O que vou fazer

### 1. Arquitetura visual
- Quebrar o arquivo único em componentes (`inbox/ConversationList`, `ConversationRow`, `MessageBubble`, `MessageTimeline`, `Composer`, `ContactPanel`), sem mudar a lógica nem as chamadas de servidor.
- Escala tipográfica consistente (nome 14px semibold, prévia 12px, metadados 11px), densidade padronizada e espaçamentos em múltiplos de 4.
- Tokens do tema WhatsApp já existentes em `styles.css` reaproveitados; nenhuma cor nova hardcoded.

### 2. Lista de conversas
- Avatar com iniciais e cor determinística; linha com nome + hora, prévia com ícone de tipo (📷 foto, 🎤 áudio, 📄 documento, 📍 local), e rodapé compacto com responsável.
- Não lidas: nome em negrito, fundo levemente destacado e bolha de contagem alinhada à direita.
- Estados próprios: skeleton no carregamento, vazio com texto específico por filtro ("Nenhuma não lida — tudo em dia"), e erro com botão "tentar de novo".
- Busca com atalho `/`, limpar com `Esc`, indicador de "buscando…" e resultado agrupado (Conversas / Iniciar nova conversa).
- Rolagem infinita automática (IntersectionObserver) mantendo o botão manual como reserva.

### 3. Chat
- Separadores de data ("Hoje", "Ontem", "22 de agosto").
- Agrupamento por autor e janela de tempo: bolhas consecutivas ficam juntas, horário só na última do grupo, cantos arredondados ajustados.
- Recibos de entrega nas mensagens enviadas: ✓ enviado, ✓✓ entregue, ✓✓ azul lido, ⚠ falhou (usando `delivered_at`/`read_at`/`failed_at`).
- Resposta citada: trecho da mensagem original acima da bolha, clicável para rolar até ela.
- Reações já colam na bolha; melhorar posicionamento para não cobrir o horário.
- Mídia: imagem com proporção preservada e lightbox; **vídeo com player**; **áudio com player próprio** (play, duração, barra); **documento com ícone, nome e tamanho**; **figurinha sem moldura de bolha**; legenda abaixo da mídia.
- Localização com cartão (ícone + nome + "abrir no mapa"); contato compartilhado como cartão vCard.
- Templates: cabeçalho, corpo e botões mantidos, com melhor separação visual e rótulo "Template oficial".
- Mensagens de sistema como faixa central discreta (mantido, refinado).

### 4. Composer
- Barra única com anexo, emoji, respostas rápidas e enviar; auto-resize preservado; contador aparece acima de 800 caracteres.
- Anexo: prévia melhor (miniatura, nome, tamanho), progresso de upload real e erro com "tentar de novo".
- Respostas rápidas com busca por teclado e navegação por setas.
- Estado bloqueado explicativo (opt-out, sem WhatsApp, conversa não vinculada, fora da janela de 24h) em vez de só desabilitar.
- Mobile: `dvh` + safe-area para o teclado virtual não cobrir o campo.

### 5. Interação
- Menu de contexto por mensagem (ação secundária / long press no mobile): copiar texto, responder citando, abrir mídia.
- Hover states consistentes, foco visível em todos os controles, `aria-label` em todos os botões de ícone.
- Atalhos atuais (J/K, R, E, U, F) preservados + `/` para busca, `Esc` para voltar; painel de ajuda "?" listando atalhos.

### 6. Rolagem
- Só rola automaticamente quando o usuário já está no fim; caso contrário mostra pílula "novas mensagens ↓".
- Botão flutuante "ir para a última mensagem" quando fora do fim.
- Divisor "mensagens não lidas" na posição correta ao abrir a conversa.
- Preserva a posição de leitura ao carregar histórico mais antigo.

### 7. Responsivo
- Desktop ≥1280: 3 colunas. Notebook 1024–1279: 3 colunas com painel de contato mais estreito e colapsável. Tablet: 2 colunas + painel em drawer. Celular: 1 painel por vez com voltar claro.
- Alturas por `dvh`, rolagens independentes, funciona em retrato e paisagem.

### 8. Performance
- Renderização inicial limitada às últimas ~50 mensagens com "carregar mensagens anteriores" (histórico completo continua acessível).
- Atualização em tempo real já existente mantida; reduzir invalidações redundantes (hoje realtime + polling de 15s disputam).
- Mídia com `loading="lazy"`, dimensões reservadas para não pular layout, e cache das URLs assinadas por conversa.

### 9. Estados e erros
- Skeletons no lugar de textos "Carregando…"; vazios ilustrados; falha de carregamento com repetição.
- Mensagem otimista "enviando…" na bolha até a confirmação, e bolha de falha com "reenviar".
- Aviso de offline e envio bloqueado enquanto sem conexão.

### 10. CRM (só integração, sem mudança funcional)
- Painel de contato reorganizado em seções colapsáveis: Identificação, Atendimento (responsável + status + sinalizar), Etiquetas, Campanhas, Consentimento/opt-out, Notas, Timeline.
- Atalhos de atendimento sobem para o cabeçalho do chat (responsável, status, sinalizar) como chips, sem duplicar regra.
- Alertas de consentimento e opt-out ficam ancorados no composer, onde a decisão acontece.
- Nada de atribuição, status, notas, tags, campanhas ou opt-out muda de comportamento.

## Fora do escopo
Astryx fica intocado; nenhum Inbox paralelo; nenhuma coluna nova de banco (apenas leitura do que já existe); nenhum recurso novo do WhatsApp que a API não entregue hoje (gravar áudio, enviar figurinha, reagir pelo app).

## Detalhes técnicos
- `src/components/CommunicationInbox.tsx` passa a orquestrar componentes em `src/components/inbox/`; assinaturas de `useServerFn` e queries mantidas.
- `communication.functions.ts` (`getConversation`): expor no retorno os campos já consultados `delivered_at/read_at/failed_at`, `reply_to_wa_id`, `media_size` e `tipo` (sem nova consulta); montar mapa de citações por `wa_message_id`.
- Novos utilitários puros: `src/lib/inbox-timeline.ts` (agrupamento, separadores de data, ordenação por timestamp real em vez de comparação de string) e `src/lib/inbox-receipts.ts` (estado do tiquinho).
- Sem migration. Sem alteração de RLS. Sem mudança de contrato de webhook.

## Como testar
Em `/comunicacao/inbox`: abrir uma conversa longa (histórico com data e agrupamento), uma com mídia/áudio/documento, uma com reação, uma não vinculada, e repetir no celular em retrato e paisagem.
