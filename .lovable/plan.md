## O que aconteceu com o Iago (verificado no banco)

São 3 registros:

| Nome | WhatsApp | E-mail | Origem | Situação |
|---|---|---|---|---|
| Iago Gonçalves Cunha | (51) 98323-1707 | iagogc@gmail.com | inscrição | ativo (sobrevivente) |
| Iago Gonçalves Cunha | (51) 98324-1707 | — | importação CSV | **já mesclado** em 08/07, arquivado |
| Iago Cunha | — | iagocunha1751@gmail.com | usuário do sistema | ativo, nunca detectado |

Três problemas distintos, todos confirmados:

1. **O terceiro nunca foi detectado.** A detecção automática só cruza: mesmo telefone (8 dígitos finais), mesmo e-mail, nome idêntico, ou nome com semelhança ≥ 0,60. "iago cunha" x "iago goncalves cunha" dá 0,52 — passa raspando por baixo do corte. Esse é exatamente o caso mais comum: nome completo x nome abreviado.
2. **O registro já mesclado ainda aparece na lista.** Ele está arquivado e marcado como "duplicado_mesclado", mas a busca estava com o filtro "todos" (inclui arquivados), então parece que a mesclagem não funcionou.
3. **Ele foi criado como usuário do sistema com outro e-mail e sem telefone.** A rotina que liga login → contato procura por e-mail e depois por telefone; como o e-mail do cadastro era diferente e não havia telefone, criou um contato novo.

Rodando a regra "um nome é subconjunto do outro, com mesmo primeiro e último sobrenome" na base inteira: **11 pares hoje invisíveis** na tela de Duplicidades (contra 978 se apenas baixássemos o corte de semelhança — ruído demais). Hoje há 166 pares pendentes.

## Diagnóstico da regra de identidade (hoje é inconsistente)

Cada porta de entrada usa uma ordem diferente:

- Formulário público: token do link → telefone → e-mail
- Cadastro de usuário: e-mail → telefone
- Importação CSV: telefone → e-mail → semelhança de nome
- Detecção automática: telefone / e-mail / nome

Resultado: a mesma pessoa vira registros diferentes dependendo de por onde entra.

**Regra master proposta (uma só, em cascata):**
1. Token de recadastro (identidade explícita, confiança máxima)
2. WhatsApp normalizado — chave primária de identidade
3. E-mail exato (minúsculo, sem espaços)
4. Nome + cidade/bairro → **nunca funde sozinho**, só gera par pendente na tela de Duplicidades

Telefone é a chave master porque é o canal do sistema; e-mail é secundário porque muda e pessoas compartilham; nome nunca decide sozinho.

## Como a mesclagem funciona hoje e o que falta

A função de mesclagem preserva tags, observações, e-mail/telefone extras (viram secundários), auditoria, mensagens de campanha e caixa de entrada. Mas **não transfere** vínculos importantes: conversas, mensagens diretas, respostas de formulário, registros de território e agitação, tarefas de missão, presenças em eventos, inscrições de notificação, entregas de automação, linhas de importação e — crítico — **o vínculo `profiles.contact_id` do usuário do sistema**. Mesclar hoje o contato "Iago Cunha" (que é usuário) desligaria o login dele do contato.

## Plano de implementação

### 1. Banco — mesclagem completa e segura
Nova migração ajustando `merge_contacts`:
- Transferir todos os vínculos restantes (conversas, mensagens diretas, logs de território/agitação, respostas de formulário, tarefas, eventos, notificações push, automações, linhas de importação, eventos de origem).
- Se o registro absorvido for usuário do sistema: repassar `is_system_user`, papel e o vínculo do perfil para o sobrevivente, e impedir a perda do login.
- Bloquear a mesclagem quando **os dois** lados forem usuários distintos do sistema (erro claro em português).
- Escolha automática de campo: para cada campo em branco no sobrevivente, herdar o valor do outro; em conflito, manter o mais recente por padrão (operador ainda pode sobrescrever).
- Suportar mesclagem em cadeia (A←B←C) sem quebrar histórico.

### 2. Detecção mais inteligente
- Nova regra de nome-subconjunto (primeiro + último sobrenome iguais e um nome contido no outro) gerando par "provável".
- Passar a considerar também contatos usuários do sistema.
- Rotina única de re-varredura para recalcular a base atual (os 11 pares aparecem imediatamente).
- Classificação de confiança revista: **Alta** (telefone ou e-mail igual + nome compatível), **Média** (nome exato ou subconjunto), **Baixa** (semelhança).

### 3. Mesclar direto na Gestão da Base
- Selecionar 2 ou mais contatos → botão **"Mesclar contatos"** na barra de ações em massa.
- Modal mostra os selecionados lado a lado, sugere o sobrevivente automaticamente (usuário do sistema > cadastro mais completo > mais recente), lista o que será preservado e alerta se algum for usuário do sistema.
- Mescla em sequência sobre o mesmo sobrevivente; ao final, resumo do que aconteceu.

### 4. Tela de Duplicidades mais intuitiva
- Agrupar por **pessoa** (grupo com 3 registros aparece como um card só, não como 3 pares soltos).
- Sobrevivente sugerido já marcado, com o motivo em texto ("tem WhatsApp confirmado e cadastro mais completo").
- Diferenças destacadas primeiro; campos iguais colapsados.
- Ação rápida **"Mesclar com a sugestão"** para casos de alta confiança, sem digitar a frase de confirmação (a digitação fica só para confiança baixa).
- Filtros por confiança e por origem, e contador visível.

### 5. Entradas públicas coerentes
- Unificar a busca de contato existente numa única função com a cascata acima, usada por formulários públicos, cadastro de usuário e importação.
- Quando o telefone bate mas o e-mail difere (ou vice-versa), atualizar o contato existente e registrar o dado divergente como secundário, em vez de criar registro novo.
- Registrar par pendente sempre que houver dúvida, nunca fundir automaticamente por nome.

### Detalhes técnicos
Migração em `supabase/migrations/` (ajuste de `merge_contacts`, `detect_contact_duplicates_for`, função de re-varredura e de agrupamento). Frontend: `contatos.index.tsx` + `BulkActionBar`, novo `MergeContactsModal` reaproveitado nas duas telas, reescrita de `duplicidades.tsx`, e nova camada única de identificação em `src/lib/contact-identity.server.ts` consumida por `public-form-contact.server.ts`, `public-user-signup.server.ts`, `imports.functions.ts` e `link_or_create_user_contact`.

Nada é apagado: o registro absorvido continua arquivado com histórico completo e é possível auditar a mesclagem.
