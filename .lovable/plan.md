## Entendi tudo. Diagnóstico rápido antes do plano

Consultando o banco e o código, três causas-raiz explicam quase todos os sintomas:

1. **Não existe nenhum `cron.job` agendado.** Por isso a fila de envio só anda quando você clica "Processar 1 lote". A mensagem para a Marina ficou parada no lote.
2. **As duas automações (`inscricao_concluida` e `atualizacao_apoiador_concluida`) estão com `active = false`.** Por isso ninguém recebe confirmação depois de preencher o formulário — mesmo com template configurado.
3. **A aba "Contatos" do módulo só mostra 8 porque a query filtra `whatsapp_status IN ('confirmado','desconhecido')` mas também exige `phone_e164` já normalizado.** Existem 117 com telefone no banco, todos com status `desconhecido`; o restante que "sumiu" tem só o candidato (`phone_whatsapp_candidate`) ou opt-out/arquivado. Não é limitação de modo visualização — é filtro apertado demais.

Sobre a busca do inbox: hoje ela só encontra contatos com `whatsapp_status` validado. Precisa passar a achar **qualquer contato salvo** (como o WhatsApp faz), independente de status ou de já ter conversa.

Sobre inbound: hoje toda mensagem recebida via webhook Z-API vira conversa no inbox. Você quer o oposto por enquanto — e um interruptor para ligar depois.

---

## Plano

### 1. Confirmação automática do formulário volta a funcionar
- Ativar as duas automações (`inscricao_concluida`, `atualizacao_apoiador_concluida`) via `supabase--insert`.
- Na tela `/mensagens` (aba Automações), deixar o toggle Ativa/Inativa em destaque, com aviso quando estiver desligada.
- Reduzir `delay_seconds` de 5 para 2 (envio quase imediato após submit).
- Não mexer no template — ele já existe.

### 2. Fila de envio anda sozinha (sem clicar "Processar 1 lote")
- Criar um `cron.job` a cada 1 minuto chamando um endpoint interno `POST /api/public/jobs/process-campaign-queue` (autenticado por `apikey` = anon key) que processa 1 lote de cada campanha `running`.
- Manter os botões manuais como fallback, mas trocar rótulos e ordem na tela `/campanhas/$id`.

### 3. Rótulos e microcopy da tela da campanha (só UI, sem mudar lógica)
Substituições:
- `running` → **"Em envio"** (badge verde)
- `prévia` → **"Ver prévia"**
- `preparar fila` → **"1. Preparar destinatários"** (com tooltip: "monta a lista final aplicando filtros e opt-out")
- `auto processar lotes` → **"Envio automático (a cada minuto)"** (switch)
- `processar 1 lote` → **"Enviar próximo lote agora"**
- `Pausar` → **"Pausar envio"**
- Adicionar barra de progresso com "X de Y enviados · Z falhas · faltam W".
- Explicação em uma linha no topo: *"Preparar → Iniciar → o sistema envia sozinho, respeitando o intervalo configurado."*

### 4. Busca do inbox no estilo WhatsApp
- `searchContactsForNewChat`: remover o filtro de `whatsapp_status`. Retornar qualquer contato ativo (não opt-out, não arquivado) que bata com nome/telefone/cidade.
- Manter as 2 seções da UI: **"Conversas"** (com histórico) e **"Contatos"** (todos os salvos que batem com a busca) — clique em contato sem chat abre thread nova.
- Ao enviar a 1ª mensagem, a conversa é criada automaticamente (já funciona).

### 5. Aba "Contatos" do módulo mostra todos os 117
- Em `listCommContactsForBulk`: aceitar também contatos com `phone_whatsapp_candidate` (não só `phone_e164`), remover a exigência de `whatsapp_status`. Continua excluindo opt-out e arquivado.
- Mostrar no topo: "117 contatos com WhatsApp · 8 confirmados · 109 a validar".
- Adicionar filtro rápido "Só confirmados" (default: desligado).

### 6. Inbound do webhook Z-API: desligado por padrão, com interruptor
- Nova tabela `app_settings` (chave/valor) OU coluna na tabela `whatsapp_instances` — `inbound_to_inbox_enabled boolean default false`.
- Na rota `/api/public/zapi/$evento`: sempre gravar em `inbound_messages` (auditoria), mas **só criar/atualizar `conversations`** quando a flag estiver `true`.
- Quando ligada: se o telefone bate com contato existente (por `phone_digits`), vincula; se não bate, cria um contato novo com `origem = "inbound_whatsapp"`, `nome` = pushname do WhatsApp (quando vier no payload), telefone normalizado.
- UI: em `/whatsapp` (aba do módulo) um switch grande **"Receber mensagens iniciadas por terceiros no Inbox"** com aviso: *"Ative apenas quando estiver no número oficial da campanha."*

### 7. Por que a mensagem da Marina não chegou no seu celular
Dois pontos separados:
- (a) A fila não processou sozinha → resolvido pelo item 2.
- (b) Você é o remetente (Z-API está pareada com **seu** número), então mensagens enviadas por você não aparecem no *seu próprio* WhatsApp; aparecem no celular da Marina. Vou adicionar essa nota explicativa na tela `/whatsapp` para não gerar confusão futura.

### 8. Pendências antigas — o que é essencial AGORA
Do backlog em `.lovable/plan.md`, priorizar só o que desbloqueia o teste real:
- ✅ Confirmação automática (item 1) — essencial
- ✅ Cron da fila (item 2) — essencial
- ✅ Busca do inbox (item 4) — essencial
- ✅ Contador correto de contatos (item 5) — essencial
- ✅ Toggle inbound (item 6) — essencial (pedido seu)

**Adiar** (não bloqueia o teste): anexos no composer, PWA `start_url`, deep-link `?contact=`, dashboard "Minhas tarefas", aba Contatos dentro de `/relacionamento`, remover botão de envio em massa de `/contatos`.

---

## Detalhes técnicos (para referência)

- Migration: `ALTER TABLE whatsapp_instances ADD COLUMN inbound_to_inbox_enabled boolean NOT NULL DEFAULT false;`
- Migration cron: `SELECT cron.schedule('process-campaign-queue','* * * * *', $$ SELECT net.http_post(url:='https://povoquebatalha.lovable.app/api/public/jobs/process-campaign-queue', headers:='{"apikey":"<anon>"}'::jsonb, body:='{}'::jsonb) $$);`
- Novo server route `src/routes/api/public/jobs/process-campaign-queue.ts`: valida `apikey`, chama internamente o processador que já existe em `src/lib/campaigns.functions.ts`.
- `searchContactsForNewChat` e `listCommContactsForBulk` em `src/lib/communication.functions.ts`: relaxar filtros conforme itens 4 e 5.
- Rota webhook `src/routes/api/public/zapi/$evento.ts`: consultar flag antes de criar `conversations`; matching por `phone_digits`.
- Automações: `UPDATE automations SET active = true, delay_seconds = 2 WHERE event_key IN ('inscricao_concluida','atualizacao_apoiador_concluida');`

Sem mexer em nada fora desses arquivos.