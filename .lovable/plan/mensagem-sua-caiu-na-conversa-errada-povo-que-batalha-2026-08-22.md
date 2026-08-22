# Mensagem sua caiu na conversa errada ("Povo que batalha")

## O que aconteceu (confirmado no banco)

Sua mensagem "Oi" chegou certinho: a Meta entregou o número `555198902337` (é o seu, sem o nono dígito — a Meta às vezes entrega assim).

O problema foi na hora de descobrir de quem é esse número. Existem **dois contatos** com esse mesmo telefone:

| Contato | Onde o número está |
|---|---|
| Alison Acosta Munhos | telefone principal (+5551998902337) |
| "Povo que batalha" (+5551926345565) | telefone **secundário** (+5551998902337) |

O recebedor de mensagens procura o contato por telefone principal **ou** secundário, sem nenhuma ordem de preferência, e usa o primeiro que o banco devolver. Nesse caso veio o "Povo que batalha" — por isso a conversa apareceu com aquele nome e aquele outro número.

Ou seja: não é problema da API oficial nem do seu número. São duas coisas somadas: um cadastro duplicado e uma regra de busca sem prioridade.

## Correções

1. **Prioridade na identificação do remetente** (`src/routes/api/public/whatsapp-cloud/webhook.ts`)
   - Primeiro tenta casar pelo **telefone principal**.
   - Só se não achar nada, tenta pelo **telefone secundário**.
   - Se ainda houver mais de um candidato, prefere o contato não arquivado e mais recentemente atualizado, para não cair num cadastro velho.
   - Mesma regra aplicada no recebedor antigo (`src/routes/api/public/zapi/$evento.ts`), para não deixar dois comportamentos diferentes no sistema.

2. **Nome de quem enviou**
   - As suas duas mensagens ficaram sem nome (`from_name` vazio) e a lista mostra o nome do contato vinculado. Passar a gravar o nome que a Meta envia no perfil quando existir, e usar o nome do contato apenas como complemento.

3. **Consertar as mensagens já recebidas erradas**
   - Migração pontual movendo as duas mensagens "Oi" de hoje para o contato Alison Acosta Munhos e recalculando a conversa/não lidas. Nenhuma mensagem é apagada.

4. **Limpeza do cadastro duplicado**
   - O contato "Povo que batalha" tem o seu número como secundário (provavelmente sobrou de um teste de recadastro). Vou apenas **remover o telefone secundário** desse contato, sem excluir nada mais, para o mesmo número não ficar em dois cadastros.

## Melhoria opcional (posso incluir se você quiser)

Um aviso na tela de Contatos quando o mesmo telefone aparecer em mais de um cadastro (principal ou secundário), levando direto para a tela de Duplicidades — hoje esse tipo de conflito só aparece quando dá problema no Inbox.

## Detalhes técnicos

- A consulta atual é `.or("phone_last8.eq.X,phone_secundario_last8.eq.X").limit(1).maybeSingle()` — sem `order`, o Postgres não garante qual linha vem.
- Nova estratégia: duas consultas em sequência (principal, depois secundário), com `order("updated_at", { ascending: false })` e filtro de arquivado, mantendo o comportamento de **nunca criar contato** a partir de mensagem recebida.
- Reatribuição das mensagens via migração `UPDATE inbound_messages SET contact_id = ...` + `recalc_conversation_unread(...)`, preservando `payload` e `wa_message_id`.
