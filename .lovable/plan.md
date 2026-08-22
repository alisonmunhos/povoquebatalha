# Aviso no WhatsApp quando alguém é atribuído a uma conversa

## Como está hoje (verificado no código)

- A atribuição acontece em uma única função (`assignConversation`): ela grava `assigned_to` na conversa e registra o evento (`assigned` / `unassigned`) no histórico. Hoje ela **não avisa ninguém**.
- Quem pode usar o Inbox: papéis de sistema (admin, operador, comunicação) **ou** qualquer usuário com a liberação avulsa `inbox_access` ligada na Central de Acesso — inclusive agitador. Esse mecanismo já funciona e é a regra que vamos usar para decidir quem pode ser atribuído.
- O telefone pessoal do usuário já existe no sistema: o perfil aponta para uma ficha de contato, e é dela que sai o WhatsApp (`phone_e164`). Alguns usuários podem não ter ficha/telefone — isso precisa ser tratado.

## Ponto importante da API oficial

A Meta só permite mandar texto livre para alguém que falou com o número nas últimas 24h. O WhatsApp pessoal da equipe normalmente **não** está nessa janela, então o aviso precisa ser enviado como **template oficial aprovado** (categoria UTILITY). Sem template aprovado, a mensagem é recusada pela Meta.

Serão dois templates (nomes sugeridos):

1. `inbox_conversa_atribuida` — "Olá {{responsavel}}, a conversa com {{contato}} foi atribuída a você. Última mensagem: {{resumo}}. Abrir: {{link}}"
2. `inbox_conversa_repassada` — "Olá {{responsavel}}, a conversa com {{contato}} foi repassada para {{novo_responsavel}}."

## Comportamento proposto

Ao salvar uma atribuição:

- Atribuiu para alguém (antes estava sem responsável) → o novo responsável recebe o aviso 1.
- Trocou de pessoa → o novo responsável recebe o aviso 1 e o anterior recebe o aviso 2 (com o nome de quem assumiu).
- Removeu o responsável → o anterior recebe o aviso 2 dizendo que a conversa voltou para a fila.
- Se a pessoa atribuiu a si mesma, não recebe aviso (evita spam).
- Nunca envia se o usuário não tiver telefone cadastrado, se estiver em opt-out, ou se o aviso estiver desligado.

O envio é feito depois de salvar, sem travar a tela: se o WhatsApp falhar, a atribuição continua valendo e o erro fica registrado no log.

## Sugestões de melhoria

- **Preferência por usuário**: um botão "Receber avisos de atribuição no meu WhatsApp" no perfil/Central de Acesso, ligado por padrão. Quem não quiser, desliga.
- **Anti-repique**: se a mesma conversa for reatribuída para a mesma pessoa em poucos minutos, não reenviar.
- **Aviso interno junto**: além do WhatsApp, criar a notificação no sininho + push do app (já existe infraestrutura), para quem estiver com o app aberto.
- **Só atribuir a quem tem acesso**: o seletor de responsável deve listar apenas usuários com acesso ao Inbox (papel ou flag), evitando atribuir para alguém que não consegue abrir a conversa.
- **Link direto**: o aviso leva um link que já abre a conversa certa no Inbox.
- **Segunda fase possível**: lembrete se a conversa atribuída ficar sem resposta por X horas.

## Detalhes técnicos

- `src/lib/communication.functions.ts` → `assignConversation`: ler `assigned_to` anterior antes do update; após gravar, chamar um helper novo `notifyConversationAssignment` (server-only) com `{ conversationId, previousAssignee, newAssignee, actorId }`.
- Novo `src/lib/inbox-assignment-notify.server.ts`: resolve nome/telefone via `profiles.contact_id → contacts.phone_e164`, checa opt-out e a preferência, monta as variáveis e envia via `whatsappCloud.sendTemplate` (parâmetros nomeados, como já é feito no projeto). Erros só logados.
- Migração: coluna booleana `notify_assignment_whatsapp` em `profiles` (default true) e registro dos dois templates para envio à Meta pela tela de Templates (aprovação da Meta é externa e leva alguns minutos/horas).
- Seletor de responsável: filtrar candidatos por papel de sistema OU `inbox_access`.
- Verificação: atribuir/reatribuir/desatribuir uma conversa de teste e conferir eventos, log de envio e recebimento no WhatsApp.
