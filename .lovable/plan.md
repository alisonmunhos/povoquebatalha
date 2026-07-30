## Objetivo

Tornar o painel de gestão da missão previsível: distinguir "ainda não acionado" de "não enviado por escolha" e de "deu erro", permitir devolver contatos ao admin sem risco de mensagem duplicada, ocultar ruído (opt-out e erros) e permitir editar a tela de orientação da missão.

## 1. Novo estado "Deu erro"

Hoje a tarefa só tem `pending`, `concluido` e `nao_enviado` — por isso "erro de número" e "vou enviar depois" ficam misturados.

- Migration adiciona o estado `erro_numero` em `agitation_tasks.status` (dados atuais preservados; nada é reclassificado).
- Na tela do agitador (Minhas Missões), o botão "Não consegui enviar" vira dois:
  - **Vou enviar depois** → `nao_enviado`
  - **Deu erro / não abriu** → `erro_numero`
- Ao marcar "Deu erro": o contato é **arquivado automaticamente** e o telefone marcado como inválido (sem usar opt-out, que é reservado a quem pediu para não receber), com aviso e **Desfazer** por alguns segundos — igual ao fluxo de "Não quer receber".

## 2. Filtros do painel da missão por intenção

O select "Status" passa a ter opções que correspondem ao que existe de fato, cada uma com contador real:

- **Não acionado — sem responsável** (na missão, ninguém pegou)
- **Atribuído e parado** (está na tela de alguém, sem nenhum clique)
- **Enviado**
- **Vou enviar depois**
- **Deu erro**
- **Não quer receber**

Correções nos filtros existentes:
- O filtro "Responsável" hoje só lista quem recebeu **link**; passa a listar também os agitadores com conta (por isso algumas opções não retornavam nada).
- Dois interruptores no topo da lista: **Ocultar quem não quer receber** e **Ocultar os que deram erro**.
- Contadores aparecem em cada opção, então nenhum filtro leva a uma lista vazia sem explicação.

## 3. Devolver contatos para redistribuir

- Nova ação em massa a partir do filtro atual: **Remover atribuição** dos contatos "Atribuído e parado" ou "Vou enviar depois".
- Ao remover, o contato volta como **"Sem atribuição"** e **não** entra no pool de auto-atribuição — só o admin redistribui (link ou agitador com conta).
- Contatos já **Enviados** nunca são devolvidos, o que garante que ninguém receba a mensagem duas vezes.
- A confirmação mostra sempre a quantidade afetada.

## 4. Editar a orientação da missão

- O modal "Editar mensagem" passa a editar também a **tela de orientação** (o texto que aparece antes de aceitar a missão), com pré-visualização de como o agitador vê.
- O modal ganha seções: Mensagem, Orientação, Mídia, Cadência (lote e intervalo).

## Detalhes técnicos

- Migration: `agitation_tasks.status` aceita `erro_numero`; sem backfill destrutivo.
- `src/lib/agitation-missions.functions.ts`: `markMyMissionTask` aceita `erro_numero`; novas funções `reportMissionContactError` / `undoMissionContactError` (validam posse da tarefa e usam client admin para arquivar, mesmo padrão de `refuseMissionContact`); `getMissionDetail` passa a retornar `opt_out_at`, `arquivado_at` e responsáveis por conta; `updateMission` passa a aceitar `instructions`.
- `src/routes/_authenticated/missoes-agitacao.$missionId.tsx`: novo modelo de filtro derivado (status + atribuição + ruído), contadores e ação de remoção de atribuição.
- `src/routes/_authenticated/minhas-missoes.tsx`: botões separados e feedback com Desfazer.
- `src/components/EditMissionModal.tsx`: campo de orientação com pré-visualização.
- Typecheck ao final.
