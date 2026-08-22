# Cadastro pelo chat do WhatsApp ("FAÇA PARTE DA NOSSA CAMPANHA")

## Como isso funciona na prática

A API Oficial da Meta não tem "formulário no chat" pronto. O que existe é: a pessoa manda mensagem, o sistema recebe um aviso (webhook) e responde. O cadastro pelo chat é o nosso sistema conduzindo uma conversa: pergunta 1, guarda a resposta, pergunta 2, e no fim grava o contato exatamente como se tivesse vindo do link público.

Duas regras da Meta que moldam o fluxo:
- Se a pessoa falou com a gente nas últimas 24h, podemos mandar texto livre (é o caso aqui: ela acabou de escrever).
- Botões de resposta rápida ("Sim/Não", "Quero participar") são permitidos nesse texto livre — dá para usar em perguntas de escolha, sem precisar de modelo aprovado.

## O que já temos

- Recebedor oficial da Meta funcionando, com identificação de quem enviou (número principal primeiro).
- Motor único de envio de mensagens.
- Respostas automáticas por frase-gatilho (hoje só respondem uma frase fixa, não conduzem conversa).
- Toda a lógica de gravação de cadastro do formulário público, reaproveitável (mesma normalização de telefone, endereço, duplicidade, origem e disparo de automações).

## O que falta

1. **Memória da conversa**: onde guardar "esta pessoa está na pergunta 4 e já respondeu isso".
2. **Gatilhos**: hoje só existe palavra-chave. Falta "veio de anúncio" (a Meta manda essa marcação junto da mensagem, e hoje ela é descartada) e "primeira mensagem de número sem cadastro".
3. **Roteiro do fluxo**: um lugar no sistema para você escrever as perguntas, a ordem e para qual campo cada resposta vai.

## O que vou construir

### 1. Roteiro configurável (tela nova em Entrada de Dados → "Fluxos no WhatsApp")
- Nome do fluxo, mensagem de abertura ("FAÇA PARTE DA NOSSA CAMPANHA!") e mensagem final.
- Lista de perguntas arrastáveis. Cada pergunta escolhe um campo do catálogo que já existe (nome, nome social, WhatsApp, e-mail, endereço completo, formas de ajuda, Alicerce, etiquetas, consentimentos etc.), o texto da pergunta, se é obrigatória e as opções quando for escolha.
- Perguntas obrigatórias do fluxo "FAÇA PARTE DA NOSSA CAMPANHA": nome, nome social, WhatsApp (confirmação do próprio número), consentimentos, endereço (CEP → rua/bairro/cidade preenchidos automaticamente, pedindo só número e complemento), **formas de ajuda** e **se faz parte do Alicerce (Sim/Não)**.
- Gatilhos do fluxo, cada um ligável/desligável:
  - palavras-chave (ex.: "campanha", "quero participar");
  - conversa iniciada por anúncio Click-to-WhatsApp (opcionalmente restrito a um anúncio específico);
  - primeira mensagem de número sem cadastro.
- Ordem de prioridade quando mais de um gatilho casar, e uma trava para não reiniciar o fluxo de quem já se cadastrou (com opção "atualizar cadastro" em vez de recomeçar).

### 2. Condução da conversa
- Ao casar um gatilho: abre uma sessão de fluxo e manda a mensagem de abertura com botão "Quero participar" (e "Agora não").
- Cada resposta recebida é validada (telefone, e-mail, CEP, data). Se estiver fora do formato, repergunta com explicação curta em português; após 3 tentativas, segue para a próxima pergunta e marca o campo como pendente de revisão.
- **Escolha única** (Alicerce, consentimentos, gênero, etc.): botões clicáveis quando são até 3 opções; lista clicável ("Ver opções") quando são até 10. Um toque responde e o fluxo segue.
- **Múltipla escolha** (formas de ajuda): a Meta não tem caixinha de marcar várias no chat, então usamos lista clicável em rodada: a pessoa toca uma opção, o sistema confirma "Anotado: X" e mostra a lista de novo já sem as escolhidas, com o item **"Pronto, terminei"** para encerrar. Também aceita a pessoa digitar vários números ("1, 3, 5") de uma vez. As escolhidas ficam visíveis a cada rodada, e a resposta final grava todas juntas nos campos do sistema (etiquetas/interesses de ajuda).
- Comandos sempre aceitos: **sair** (encerra), **voltar** (pergunta anterior), **recomeçar**.
- Sessão expira em 24h de silêncio; ao expirar, salva o que já foi respondido como cadastro parcial e marca o contato como "recadastro iniciado".
- Se um humano assumir a conversa no Inbox, o fluxo pausa automaticamente para o robô não atropelar o atendimento (e há botão "retomar fluxo").
- No fim: grava pela mesma rotina do formulário público (origem registrada como cadastro pelo chat, com o gatilho e o anúncio de origem quando houver), manda a mensagem final e dispara as automações normais.

### 3. Visibilidade
- Todas as perguntas e respostas aparecem no histórico do Inbox como mensagens normais, com etiqueta "Fluxo de cadastro".
- Na tela do fluxo: quantas pessoas entraram, em que pergunta pararam e quantas concluíram.

## Cuidados

- Cadastro por chat pergunta uma coisa por vez; com "todos os campos" o roteiro fica longo e a desistência no meio é alta. Sugiro marcar como obrigatórias só nome, cidade e consentimento, e deixar o resto como "pergunta se a pessoa continuar" — o cadastro parcial já fica salvo.
- Nada é apagado: fluxo interrompido gera contato parcial, nunca contato fantasma sem identificação.
- Gatilho "primeira mensagem de número novo" responde a qualquer pessoa que escrever; recomendo ligar primeiro só palavra-chave e anúncio.

## Detalhes técnicos

- Migração: `whatsapp_flows` (nome, mensagens de abertura/fim, gatilhos em jsonb, ativo), `whatsapp_flow_steps` (ordem, campo do catálogo, texto, obrigatório, opções, validação), `whatsapp_flow_sessions` (contact_id, telefone, flow_id, passo atual, respostas jsonb, status, gatilho/anúncio de origem, expira_em) — com GRANTs e RLS (leitura para staff/`inbox_access`, escrita para admin; sessões manipuladas via service role no webhook).
- `src/routes/api/public/whatsapp-cloud/webhook.ts`: passar a extrair `referral` (`ctwa_clid`, `source_id`, headline) e o `button_reply`/`list_reply` já parseados, e chamar o novo motor de fluxo antes das respostas automáticas por frase.
- Novo `src/lib/whatsapp-flow.server.ts`: casamento de gatilho, avanço de passo, validação por tipo de campo, envio via `sendMessage` (`origin: "whatsapp_flow"`), e finalização reaproveitando `saveFormContactFromAnswers` de `src/lib/public-form-contact.server.ts` (mapeando respostas para o mesmo formato de answers do formulário público).
- `src/lib/whatsapp-flows.functions.ts` + tela em `src/routes/_authenticated/entrada-dados.*` para o CRUD do roteiro, reutilizando `src/lib/form-field-catalog.ts`.
- Pausa por atendimento humano: reusar o estado da conversa em `conversations` (atribuída/em atendimento) para não enviar próxima pergunta.
