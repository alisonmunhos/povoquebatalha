# 03 — Glossário e Definições Operacionais

> Auditoria conceitual — Entrega 1. Aqui está o que cada palavra **significa
> hoje no sistema**, não o que gostaríamos que significasse. Onde há mais de uma
> definição em uso, isso está marcado como divergência.

## 1. Termos centrais

### Contato
Qualquer pessoa registrada na base, independentemente de vínculo, consentimento
ou origem. É a única entidade-pessoa do sistema. **Não existe base paralela.**
Total hoje: 3.289.

### Apoiador
**Não existe como conceito formal no sistema.** Não há campo, marcação ou
status chamado "apoiador". Na prática, cada tela usa um critério diferente para
falar da "base de apoio": às vezes todos os contatos, às vezes só os que deram
consentimento, às vezes só os que concluíram o recadastro (74 pessoas).
→ **Divergência a resolver: adotar uma definição única e escrevê-la aqui.**

### Usuário
Pessoa com login. Vive em `profiles` + `user_roles`, e pode estar ligada a um
contato. 27 contatos são usuários. **Usuário não deveria ser tratado como
apoiador em contagens e campanhas** — hoje é.

### Arquivado
Contato marcado com data de arquivamento. Significa "não deve mais aparecer no
trabalho do dia a dia". 19 hoje.
→ **Divergência: cada tela decide se arquivado entra na lista.**

### Opt-out
Pessoa que pediu para não receber mensagens. Registrado com data e motivo. 16
hoje. É respeitado no envio de campanha. **Não é o mesmo que arquivado** —
opt-out continua sendo um contato válido da base, só não recebe mensagem.

### Consentimento
Existem três consentimentos distintos e independentes: WhatsApp, LGPD e dados
sensíveis. Só o de WhatsApp é usado para decidir envio. Os outros dois são
registrados e não influenciam nenhuma regra automática hoje.

### Missão (Agitação)
Lote de contatos distribuído para agitadores contatarem. Uma missão pode estar
aberta, pausada ou arquivada, e tem lista de elegíveis. Tarefas são atribuídas
de forma atômica — este é um dos pontos mais bem resolvidos do sistema.

### Campanha
Envio em massa para uma audiência (segmento, filtro ou lista de IDs), com janela
de horário, ritmo e registro por destinatário. Estados: rascunho, agendada, em
execução, pausada, concluída, cancelada.

### Segmento
Público salvo. Pode ser **dinâmico** (guarda o filtro, recalcula sempre) ou
**estático** (guarda a lista de IDs, congelada). A contagem exibida de um
segmento dinâmico não normaliza arquivados — pode divergir do que a campanha
realmente enviará.

### Território
Recorte geográfico (UF / cidade / bairro) atribuído a um usuário, que define
quais contatos ele pode trabalhar em campo.

## 2. Ciclo de vida dos campos críticos

### Telefone

```text
digitação/importação → phone_raw (texto como veio)
        ↓ gatilho no banco
   normalização → phone_e164, phone_digits, phone_ddd, phone_last8/9
        ↓
   classificação → phone_status
```

| Valor de `phone_status` | Significado | Quantos hoje |
| --- | --- | --- |
| valido | normalizou corretamente | 3.193 |
| invalido | não foi possível normalizar (inclui os sem DDD) | 59 |
| sem_nono_digito | celular antigo, 8 dígitos com DDD | 14 |
| precisa_revisao | ambíguo | 2 |
| sem_ddd | **nunca é gravado** | 0 |
| duplicado_possivel | **nunca é gravado** | 0 |

Regra prática: **`phone_raw` é a fonte da verdade do que a pessoa informou;
`phone_e164` é derivado e pode estar vazio.** Qualquer tela que só leia
`phone_e164` vai esconder número que existe.

### Cadastro (lifecycle_status)

```text
importado_aguardando_recadastro  (3.122)
   ├→ link_enviado → recadastro_iniciado → recadastro_concluido  (74)
   ├→ telefone_invalido  (59)
   ├→ nao_respondeu
   ├→ duplicado_possivel → duplicado_mesclado  (17)
   └→ nao_enviar  (bloqueio manual de envio)
```

Só 4 dos 10 estados aparecem na base atual. Os demais existem no tipo mas nunca
foram gravados — e mesmo assim são oferecidos como opção de filtro.

### WhatsApp

Verificação sob demanda contra o provedor. **Nunca foi executada**: os 3.270
contatos ativos estão como "desconhecido". Todo filtro e indicador de WhatsApp
hoje mede zero informação real.

### Geocodificação

Endereço → provedor externo → coordenada + precisão. 97% pendente. O mapa
mostra 101 pessoas de 3.270 — ele não é uma visão da base, é uma visão de 3%
dela, e não avisa isso.

### Origem

Três camadas convivem, com propósitos diferentes:
- `origem` — como o registro nasceu (import, inscricao, recadastro, manual);
- campos de captação ativa — quem captou, por qual link/formulário;
- `contact_source_events` — histórico completo, evento a evento.

A camada de histórico é a mais confiável; os campos resumidos na tabela de
contatos são "último valor visto" e podem ficar defasados.

## 3. Definições que precisam de decisão do usuário

| Pergunta | Opções em uso hoje | Impacto |
| --- | --- | --- |
| "Total da base" inclui arquivados? | sim (CRM) / não (BI) | todo indicador |
| Quem é "apoiador"? | 3 critérios diferentes | comunicação e metas |
| Usuário do sistema conta como contato? | sim, em toda parte | contagem e campanhas |
| "Tem telefone" = número digitado ou número válido? | ambos, conforme a tela | filtros e correção |
| Segmento dinâmico deve excluir arquivado sempre? | indefinido | envio indevido |

Essas cinco decisões são pré-requisito para qualquer normalização: **enquanto
elas não estiverem escritas, cada nova tela vai inventar a sua própria versão** —
que é exatamente como chegamos aos problemas descritos em `02-gestao-da-base.md`.

## 4. Princípio de fonte única (proposta conceitual)

Para cada conceito acima deveria existir **um só lugar no código que o define**,
e todas as telas o consultariam:

```text
"contato ativo"      → uma definição
"tem telefone"       → uma definição
"apto a receber msg" → uma definição
"apoiador"           → uma definição
```

Hoje esses conceitos estão reescritos em cada arquivo que precisa deles. O
detalhamento dessa duplicação vem na Entrega 2 (`05-fonte-unica-da-verdade.md`).
