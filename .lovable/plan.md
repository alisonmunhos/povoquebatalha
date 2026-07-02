# Roadmap — Central de Mobilização

## Fase 1 — Módulo Comunicação (Inbox WhatsApp Web) — CONCLUÍDA

- Novo papel de acesso **comunicacao**.
- Tabelas `conversations` + `conversation_events` com gatilhos que se atualizam sozinhos a partir de inbound_messages / direct_messages.
- Realtime ativo: inbox atualiza ao vivo em todos os dispositivos.
- Backfill: conversas criadas para todos os contatos com histórico.
- **App dedicado `/comunicacao/*`** com barra de abas persistente e badge de não lidas atribuídas a mim.
- **Inbox 3 colunas** (WhatsApp Web): lista com filtros (Todas/Minhas/Não lidas/Sinalizadas/Resolvidas), busca com "Iniciar conversa" para contatos sem chat, thread unificada (inbound + direct + campanhas), composer com Enter-envia/Shift-Enter-quebra, seletor de templates, atribuição a usuário, status (Aberta/Aguardando/Resolvida), sinalização, notas internas com menção, timeline de atendimento.
- **Contatos (somente leitura)** dentro do módulo: apenas WhatsApp válido + sem opt-out, seleção múltipla, botão "Enviar em massa" abrindo o wizard existente.
- Sidebar consolidada em um único botão "Módulo Comunicação" com badge.
- Barra de abas do módulo também renderizada em `/campanhas`, `/mensagens`, `/calendário`, `/relacionamento`, `/whatsapp` para dar sensação de app dedicado.
- **Z-API**: 1 instância compartilhada; QR lido 1x pelo admin em `/whatsapp` (agora aba do módulo). Novos usuários entram já conectados.
- Responsivo/PWA: layout 3 colunas em desktop, drawer no mobile (list→thread→info).

## Backlog imediato (próximas iterações)

- Remover botão de envio em massa da tela `/contatos` (Gestão da Base) — deve viver só no módulo Comunicação.
- Aba "Contatos" dentro de `/relacionamento` (junto com Visão geral, Por mensagem, etc.).
- Composer: anexos (foto/PDF) via bucket `campaign-media`.
- Dashboard "Minhas tarefas" em `/comunicacao` (conversas atribuídas + menções não lidas).
- Push/notificação in-app quando @menção ou nova atribuição chega.
- Deep-link `/comunicacao/inbox?contact=<id>` abrir conversa automaticamente.
- Manifest PWA com `start_url=/comunicacao/inbox` para instalação como app separado.
- Templates com atalhos `/comando` no composer.
- Relatórios por atendente (tempo de resposta, resoluções).
- Suporte a múltiplas instâncias Z-API (arquitetura preparada com coluna opcional).
