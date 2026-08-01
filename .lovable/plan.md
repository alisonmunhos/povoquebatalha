## Relatório de verificação (conferido no código e no banco agora)

### FASE 1 — Filtros da Gestão da Base

| Item | Situação real |
|---|---|
| Alicerce = Não ignora quem nunca respondeu | **Confirmado, bug real.** O filtro compara direto ("igual a não"), então quem tem o campo vazio fica de fora. "Bloqueado" já usa o padrão correto (aceita vazio). Correção pequena e isolada. |
| Formas de ajuda sem "exceto" | **Já está pronto.** O motor entende a exclusão de formas de ajuda e o painel já usa o mesmo componente com o alternador "Mostrar / Esconder os marcados", igual a tags e cidades. Provavelmente você não viu porque a opção fica **dentro** do menu — e é justamente o menu que hoje corta o rodapé (item abaixo). |
| "Recebeu mensagem de missão" / "Missão específica" não filtram | **Confirmado, e achei a causa exata.** A lógica existe, mas procura tarefas com o status antigo `concluido`. Esse status não existe mais: hoje o banco tem `sem_acao` (1264), `enviado` (115), `arquivado_erro` (19), `pendente_envio` (3), `arquivado_optout` (2). Nenhuma tarefa bate → resultado sempre vazio. Correção pequena: passar a usar `enviado` (e, opcionalmente, oferecer "recebeu de fato" vs "foi atribuído"). |
| Edição em massa sem "Consentimento WhatsApp" | **Aparentemente já está na lista** (o campo consta entre os editáveis em massa e a tela percorre essa lista). Vou confirmar na tela real antes de mexer; se não aparecer, é problema de cadastro do campo no catálogo, não do motor. |
| Menu de filtro sem chegar no botão "Aplicar" | **Confirmado.** No desktop o menu abre com largura fixa e sem limite de altura nem ajuste à borda da tela: quando abre na parte baixa, o rodapé com "Aplicar" fica fora da área visível e a rolagem interna não o alcança. No celular já existe versão em folha inferior que funciona. |

### FASE 2 — Arquivamento e opt-out nas missões

- Os dois botões **já arquivam** o contato e **já são registrados de forma diferente** (`arquivado_erro` vs `arquivado_optout`).
- O que falta: "Deu erro/não abriu" **não marca opt-out** hoje (só marca telefone inválido). É a única mudança de comportamento pedida.
- "Desfazer" **já existe, já é individual** e já usa o mecanismo único de desarquivar, que reverte arquivado + opt-out + devolve o contato para "ativos" e para a fila de triagem.
- **Risco real a tratar:** ao desfazer, esse mecanismo hoje zera também qualidade do telefone e situação do cadastro para todos os casos. Se "erro" passar a marcar opt-out, o desfazer precisa distinguir o que foi marcado pela missão do que já era verdade antes — senão apaga informação boa de telefone.
- A definição de arquivado/opt-out é lida em **~40 arquivos** (envio de WhatsApp, campanhas, painel, filtros, mapa, duplicidades, território, importação, triagem). Nenhum deles precisa mudar, mas todos precisam ser conferidos depois.
- Regra de segurança confirmada no código: a liberação automática já ignora contatos arquivados; eles nunca voltam para "sem atribuição" sozinhos.

### FASE 3 — Liberação automática

- **Já existe** liberação por tempo, mas **manual** (o admin dispara, com corte em horas) e já restringe a tarefas sem nenhuma ação e sem link atribuído — ou seja, já é segura.
- **Não existe** o escalonamento automático de avisos (1h → lembrete, 2h → aviso de redistribuição), nem o agendamento automático. Há infraestrutura pronta para reaproveitar (notificações + rota agendada semanal já em produção).
- **Correção dos números da missão "Convite Plenária PPB"** (conferidos agora): Alison 9 parados ✅; conta "Sistema" tem **2 parados + 1 pendente**, não 8; **36 nunca distribuídos**, não 66. Há ainda Fabíola 10 e Mateus 3 parados. Total liberável na missão: **50 tarefas**.

### FASE 4 — Tela "Desempenho das Missões"

**Resposta direta: não reaproveita.** A tela tem **motor de contagem próprio e separado**, que agrega tarefas de missão por status. O motor de "Meu Impacto" é outro arquivo, com outra base de dados (captação de contatos, semana, badges) e nenhuma relação entre os dois. Consequência prática: as duas telas podem divergir, e incluir "contatos adicionados" no Desempenho significa **passar a usar os dois motores na mesma tela** — dá para fazer com segurança, mas exige unificar antes o vocabulário de contagem, senão os números brigam entre si.

### FASE 5 — Auditoria anterior

- Status de WhatsApp inerte: **confirmado** — 3.774 de 3.794 contatos estão "desconhecido".
- Base hoje: 3.794 contatos, 54 arquivados, 29 opt-out, 30 usuários do sistema. As duas decisões pendentes mudam pouco o total (≈1,5%), mas mudam a confiança nos indicadores.
- Painel/contador de duplicidades e redução dos 10 estados de ciclo de vida: **não existem**.

---

## Riscos de quebrar o que está publicado

1. **Alto:** mexer no mecanismo de desarquivar sem preservar telefone/situação anterior — pode apagar dado bom em contatos já triados.
2. **Alto:** unificar contagem entre Desempenho e Meu Impacto sem congelar o vocabulário — indicadores publicados mudariam de valor sem aviso.
3. **Médio:** reduzir os 10 estados de ciclo de vida — esses estados são usados em filtros salvos, bloqueio de envio e formulários públicos.
4. **Baixo:** correções de Alicerce, filtro de missão, menu de filtro e opt-out no botão de erro — pontuais, sem efeito colateral em outras telas.

## Ordem de implementação proposta

**Etapa 1 (rápida, sem risco)** — Alicerce aceitando vazio; filtro de missão usando o status certo (com opção "recebeu" vs "foi atribuído"); menu de filtro com altura limitada à tela e rodapé sempre visível; conferir "Consentimento WhatsApp" na edição em massa. Fecha a Fase 1 inteira.

**Etapa 2** — Opt-out no botão "Deu erro/não abriu", com desfazer preservando o que era verdade antes; mostrar o motivo (erro vs recusa) na tela de controle do admin e distinguir arquivado de opt-out na Gestão da Base. Fecha Fase 2 + parte da Fase 5.

**Etapa 3** — Liberar as 50 tarefas paradas da "Convite Plenária PPB" e decidir o papel de agitador da conta "Sistema"; depois o escalonamento automático 1h/2h reaproveitando notificações e agendamento existentes. Fase 3.

**Etapa 4** — Só depois: unificar vocabulário de contagem e então estender o Desempenho (contatos adicionados, gráficos, ver conquistas de um usuário, conquista coletiva). Fase 4.

**Etapa 5** — Contador de duplicidades, decisão sobre status de WhatsApp e agrupamento dos estados de ciclo de vida — cada um com as duas decisões de indicador respondidas antes. Fase 5.

Preciso das suas respostas em três pontos antes da Etapa 4: contato arquivado entra no "Total da base"? Usuário do sistema conta como apoiador? E a conta "Sistema" perde o papel de agitador?
