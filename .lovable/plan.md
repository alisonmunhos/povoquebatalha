## Confirmação

Verifiquei no banco: o evento `plenaria-de-lancamento-da-pre-candidatura-de-karen-santos-a-deputada-estadual-pe` ("Plenária de Lançamento: Karen Santos") está vinculado ao formulário **"ENTRE PARA NOSSA BASE!"** (`seja-um-apoiador-a-da-campanha-do-povo-que-batalha-copia`, ativo, modo por seções) — exatamente o formulário que analisei. Todas as correções abaixo se aplicam a ele.

Observação importante: as correções são no **motor de formulários por seções** (`PublicFormRenderer` + rotas públicas), então valem para este evento e para qualquer outro formulário seccionado — sem precisar refazer nada por evento.

## Diagnóstico

Caminho atual do formulário do evento:

```text
1 SEU CADASTRO  ->  2 VAMOS CONTINUAR?  --(ramificação)-->
   QUERO SER UM APOIADOR      -> SEU PERFIL DE APOIADOR(A)
   QUERO RECEBER INFORMAÇÕES  -> VOCÊ VAI RECEBER NOSSAS ATUALIZAÇÕES!
   SOU DO COLETIVO ALICERCE   -> E AÍ, COMPA! (criação de conta)
```

### 1. Voltar é frágil
- A seta de voltar só existe enquanto o histórico está dentro do mesmo componente. Depois da tela "Presença confirmada", o formulário é remontado do zero e o caminho de volta se perde.
- O painel sobreposto empurra um estado no histórico do navegador a cada etapa, mas isso não está sincronizado com a seta da tela — dá para sair da página sem querer.
- Na etapa de criação de conta não há como voltar para corrigir nome/e-mail/telefone.

### 2. Clicar na opção não avança
"VAMOS CONTINUAR?" tem só uma pergunta de escolha única, mas exige dois toques: escolher e depois "Continuar".

### 3. Lentidão (causa localizada no código)
A cada "Continuar", o endpoint de progresso executa em sequência: busca do formulário, busca da seção, busca de todas as perguntas, normalização de telefone, resolução de identidade (até 4 consultas), atualização do contato, apagar+inserir respostas, **geocodificação por HTTP externo**, **reconfirmação de presença no evento a cada etapa** (5 operações) e **envio de notificações push para a equipe**, mais 2 consultas só para saber se a pessoa já tem conta. São ~15 idas ao banco + 1 chamada externa + push, por etapa. Presença e notificação só precisam acontecer uma vez; geocodificação nunca precisa bloquear a resposta. Ao continuar após a confirmação, o formulário inteiro ainda é baixado de novo com a tela mostrando só "Carregando…".

---

## Plano de correção

### A. Navegação
- Histórico de etapas mantido fora do renderizador, para que continuar após a confirmação preserve o caminho.
- Seta de voltar sempre visível a partir da 2ª etapa; na 1ª, fecha o painel e volta para a página do evento.
- "Voltar" do celular unificado com a seta (um único controle), sem risco de sair da página.
- Voltar também permitido na etapa de criação de conta.

### B. Avanço ao clicar na opção
- Quando a seção tiver **apenas uma pergunta de escolha única obrigatória** (caso de "VAMOS CONTINUAR?"), tocar na opção avança automaticamente, com destaque de seleção antes da troca de tela.
- Demais seções seguem com o botão "Continuar".
- O botão continua disponível como alternativa acessível; o avanço automático fica bloqueado durante o envio (evita duplo toque).

### C. Desempenho
- Confirmar presença no evento apenas na primeira etapa, não em todas.
- Notificações à equipe e geocodificação deixam de bloquear a resposta.
- Remover as consultas extras de "já tem conta", reaproveitando o resultado do salvamento.
- Não rebaixar o formulário inteiro ao continuar após a confirmação.
- Estado de carregamento visível no botão/opção, para a espera não parecer travamento.

### Detalhes técnicos
- `src/components/PublicFormRenderer.tsx`: pilha de etapas controlável por props, auto-avanço em seções de escolha única, estados de carregamento.
- `src/components/StepOverlay.tsx`: controle único de histórico do navegador.
- `src/routes/evento.$slug.tsx`: manter o formulário montado entre "presença confirmada" e a continuação.
- `src/routes/api/public/forms/$slug/section-progress.ts`: RSVP só quando ainda não confirmado; remover consultas extras; responder antes de tarefas complementares.
- `src/lib/public-form-contact.server.ts`: geocodificação sem bloquear a resposta.

### Cuidados
- Nenhuma mudança no banco; nenhum dado alterado.
- O fluxo "Não poderei ir" e as telas configuráveis do evento permanecem iguais.
- Auto-avanço só em seções de escolha única.
- Teste em: `https://povoquebatalha.lovable.app/evento/plenaria-de-lancamento-da-pre-candidatura-de-karen-santos-a-deputada-estadual-pe`
