# Botão do Inbox com cara de WhatsApp + Inbox na paleta do WhatsApp

## 1. Botão de mensagens no topo (hoje apertado e simples)
- Trocar o ícone genérico de balão pelo logo oficial do WhatsApp (imagem enviada), publicada como asset e usada com `<img>`.
- Dar mais respiro: botão com área de toque maior (44x44), fundo verde claro no hover, ícone maior, e o contador de não lidas em bolha branca com borda, sem grudar na borda do botão.
- No mobile, ajustar o espaçamento da barra do topo para os itens (sino, WhatsApp, instalar, Adicionar) não ficarem colados como no print.

## 2. Paleta do WhatsApp no Inbox
Aplicar as cores enviadas apenas dentro do Inbox (`/comunicacao/inbox`), sem mexer no resto do app:
- Verde escuro `#075E54` no cabeçalho/faixa superior do Inbox.
- Verde teal `#128C7E` em títulos e ícones de apoio.
- Verde `#25D366` em botões de ação principal (enviar) e chips ativos.
- Verde claro `#DCF8C6` nas bolhas de mensagens enviadas; branco nas recebidas.
- Areia `#ECE5DD` no fundo da área de conversa.
- Azul `#34B7F1` em links e ícones de leitura.
Contraste conferido em tema claro e escuro.

## 3. Remover o selo do Lovable
Desligar a exibição do badge do Lovable no site publicado (configuração do projeto).

## Detalhes técnicos
- Novo asset via `lovable-assets` para o logo do WhatsApp; `src/components/InboxQuickButton.tsx` passa a renderizar a imagem.
- Tokens do WhatsApp definidos em `src/styles.css` (ex.: `--wa-teal`, `--wa-green`, `--wa-bubble-out`, `--wa-chat-bg`) e aplicados via classes semânticas em `src/components/CommunicationInbox.tsx` — sem hex solto nos componentes.
- Badge do Lovable via `publish_settings--set_badge_visibility` (false).
