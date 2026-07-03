## O que já existe hoje

- Webhook `on-receive` grava `inbound_messages` e tenta casar contato por `phone_last8`. Se não achar (caso do LID ou telefone novo), fica com `contact_id = null`.
- No Inbox há o banner amarelo **"Conversa não vinculada"** com dois botões:
  - **Criar contato rápido**: só pede Nome / Cidade / UF e cria um contato mínimo com `phone_raw = from_phone` (isso hoje salvaria `217879546974326@lid` como se fosse telefone — bug).
  - **Vincular existente**: busca contato e funde a conversa.

## O que precisa mudar

### 1. Detectar e tratar LID corretamente
- No `on-receive` (`src/routes/api/public/zapi/$evento.ts`): quando `phone` terminar com `@lid` (ou não tiver dígitos suficientes), gravar em `inbound_messages` uma flag/coluna `is_lid = true` e não usar esse valor como telefone para busca. Continuar registrando `from_name` (nome do perfil WhatsApp) e o `senderPhone` alternativo se a Z-API mandar.
- No card da conversa e no cabeçalho do chat: quando for LID, mostrar rótulo mais amigável — "Contato anônimo do WhatsApp (LID)" em vez do ID cru — com um tooltip explicando o que é.
- Quando a Z-API entregar em algum campo do payload um telefone real junto do LID (`participantPhone`, `chatPhone`, `authorPhone`, `senderPhone`), usar esse telefone para tentar casar com a base **antes** de considerar não-vinculada.

### 2. Botão "Salvar contato" dentro do chat (com ficha completa)
- Substituir o mini-formulário atual (Nome/Cidade/UF) por: **botão "Salvar como contato"** que abre a **mesma ficha de atualização cadastral que já existe** no fluxo público (`/atualizacao` — reaproveitar o componente/campos), porém:
  - Em modo drawer/dialog dentro do Inbox (não navega para fora).
  - **Todos os campos opcionais** (o operador preenche o que conseguir).
  - Pré-preenchido com o que der para inferir: `nome` ← `from_name` do inbound; `phone_e164` ← telefone se vier no payload (não LID); nada nos demais.
  - Cabeçalho do dialog explica: "Salvando contato a partir da conversa com [nome/LID]. Preencha o que souber; o resto pode ser completado depois."
- Ao salvar: cria o `contact` normal (mesma tabela, mesma origem `manual` com `origem_detalhe = "inbox_quick_create"`), vincula a conversa e todo o histórico de `inbound_messages` daquele `from_phone`/LID, e habilita a resposta.
- Se a conversa for LID sem telefone real conhecido, **avisar** que só será possível responder quando o contato mandar mensagem de um número real ou quando o operador editar o cadastro adicionando o telefone.

### 3. "Vincular existente" continua igual
- Nenhuma mudança funcional além de reaproveitar o mesmo banner reorganizado.

### 4. Ajustes cosméticos no cabeçalho da conversa não-vinculada
- Trocar o título grande `217879546974326@lid` por **"Sem contato vinculado"** com o LID/telefone em fonte menor, monoespaçada, ao lado.
- Manter o banner amarelo com a mensagem "Vincule esta conversa a um contato antes de responder" e os dois botões (agora um deles abre a ficha completa).

## Arquivos afetados

- `src/routes/api/public/zapi/$evento.ts` — detectar LID, tentar telefone alternativo do payload, gravar flag.
- `src/components/CommunicationInbox.tsx` — refazer `UnlinkedBanner` + cabeçalho da conversa; adicionar botão "Salvar como contato" que abre o dialog da ficha completa.
- Novo componente `src/components/QuickContactFromInboxDialog.tsx` — reaproveita os campos da ficha `/atualizacao` (nome, telefone, e-mail, cidade, bairro, UF, CEP, endereço, aniversário, notas etc.) todos opcionais.
- `src/lib/communication.functions.ts` — expandir `createQuickContactFromConversation` para aceitar o payload completo (todos os campos opcionais) e não gravar LID em `phone_raw` quando `is_lid`.
- (Opcional, só se necessário) Migration para adicionar `inbound_messages.is_lid boolean default false` — se não quiser migration, dá pra inferir por regex `@lid$` na hora de renderizar.

## Fora de escopo

- Não vamos tentar "descobrir o telefone real por trás do LID" — o WhatsApp/Z-API não expõe isso de forma confiável.
- Não vamos criar contato automaticamente no webhook (mantém decisão anterior: sempre precisa de ação humana).
- Nenhuma mudança em campanhas, envio, ou fluxo público de atualização.

## Riscos

- Se algum contato antigo foi criado com `@lid` no `phone_raw` (bug do banner atual), o `phone_last8` dele está lixo. Posso incluir uma limpeza defensiva (transformar em `null` e marcar `whatsapp_status = 'invalido'`) — confirmar se quer que eu inclua.
