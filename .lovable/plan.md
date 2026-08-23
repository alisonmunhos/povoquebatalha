# Fazer o aviso de atribuição do Inbox realmente sair no WhatsApp

## Diagnóstico (confirmado)

- Os dois modelos estão **aprovados** pela Meta: `inbox_conversa_atribuida_br` e `inbox_conversa_repassada_br` (pt_BR, categoria Utility).
- A atribuição que você fez agora (23/08 às 14:53, para Ezequiel Carvalho Viapiana) foi registrada corretamente no histórico da conversa.
- **A causa**: a ação de atribuir conversa não envia nenhuma mensagem. A função que grava a atribuição só atualiza a conversa e registra o evento — não existe nenhuma chamada de envio de template para o responsável. Ou seja: aprovar os modelos era metade do caminho; o disparo nunca foi implementado.
- Detalhe extra: o cadastro de usuários não guarda telefone próprio. O WhatsApp do responsável vem do contato vinculado ao usuário. Hoje vários usuários não têm contato vinculado (portanto, sem número para receber o aviso).

## O que vou fazer

1. **Disparar o aviso ao atribuir**: quando uma conversa passa a ter responsável, enviar `inbox_conversa_atribuida_br` para o WhatsApp do novo responsável, com nome dele, nome do contato e resumo da última mensagem, mais o botão "Abrir Inbox".
2. **Avisar quem perdeu a conversa**: se a conversa já tinha outro responsável, enviar `inbox_conversa_repassada_br` para essa pessoa.
3. **Não avisar a si mesmo**: se você atribui a conversa para você, nenhum aviso é enviado.
4. **Nunca travar a atribuição**: o envio acontece depois de salvar; se a Meta recusar ou o número faltar, a atribuição continua valendo e o motivo fica registrado no histórico da conversa.
5. **Deixar claro na tela quando não há número**: no seletor de responsável, indicar quem não recebe aviso no WhatsApp (usuário sem contato vinculado com telefone), e mostrar aviso curto após atribuir ("Responsável definido, mas sem WhatsApp vinculado — aviso não enviado").
6. **Testar de verdade**: atribuir uma conversa a um usuário com número válido e confirmar a entrega, além de checar o registro do envio.

## Cuidados

- Aviso só chega para quem tem contato vinculado com WhatsApp válido e sem opt-out.
- Envio de template Utility tem custo por mensagem na Meta.
- Nenhum dado de contato, conversa ou campanha é alterado.

## Detalhes técnicos

- `src/lib/communication.functions.ts` → `assignConversation`: ler o `assigned_to` anterior antes do update; após gravar, resolver telefones via `profiles.contact_id → contacts.phone_e164` e chamar um novo helper.
- Novo `src/lib/inbox-assignment-notify.server.ts`: monta os parâmetros nomeados (`responsavel`, `contato`, `resumo`, `novo_responsavel`) e usa `whatsappCloud.sendTemplate` (`src/integrations/whatsapp-cloud/client.server.ts`), lendo nome/idioma de `whatsapp_templates` por `name` com `status='approved'`; erros são capturados e gravados em `conversation_events` (payload com `notify_error`).
- `resumo` truncado (~120 caracteres, sem quebras de linha) a partir de `conversations.last_message_preview`.
- Registrar o envio em `direct_messages` (com `to_phone`) para o histórico, marcando origem como aviso interno.
- `src/components/CommunicationInbox.tsx` (+ modal de responsável): expor flag `has_whatsapp` na lista de usuários atribuíveis e refletir no rótulo e no toast.
