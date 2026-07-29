# 07 — Experiência de uso: previsibilidade e confiança

Este documento não avalia estética. Avalia uma coisa só: **o usuário consegue
prever o que vai acontecer, e confiar no que o sistema mostra?**

Critérios usados: previsibilidade, reversibilidade, clareza de estado,
feedback de ação em massa e coerência entre telas.

---

## 1. Entrada de dados — formulários públicos

Fluxo auditado: `src/routes/api/public/forms/$slug.ts` →
`src/lib/public-form-contact.server.ts`.

**8 formulários ativos**, todos passando pelo mesmo salvamento — isso é um
acerto estrutural importante: a porta de entrada é única.

### 1.1 Como o sistema decide se é uma pessoa nova

A identificação segue esta ordem: token de recadastro → telefone → e-mail.

Consequências observadas:

| Situação | O que acontece | Previsível? |
|---|---|---|
| Pessoa preenche com o mesmo telefone | Atualiza o cadastro existente | Sim |
| Pessoa preenche com telefone novo, mesmo token | Cria **segundo** cadastro, marca "precisa revisão" e abre par de duplicidade | Razoável, mas invisível para o operador |
| Duas pessoas usam o mesmo e-mail (casal, família) | A segunda **sobrescreve** o cadastro da primeira | **Não.** Perda silenciosa |

Hoje há **1 e-mail repetido** na base — o risco é pequeno agora, mas cresce com
a captação. E-mail não é identificador confiável de pessoa neste contexto.

### 1.2 O ponto mais delicado: quem pediu para sair volta sozinho

O salvamento final grava sempre `opt_out_at: null` e
`lifecycle_status = 'recadastro_concluido'`.

Ou seja: alguém que pediu descadastro (16 pessoas hoje) e depois abre um link de
evento e preenche o formulário **volta automaticamente para a base ativa de
comunicação** — sem ter dito que quer voltar a receber mensagens.

O mesmo salvamento **não** limpa `arquivado_at`. Então o inverso também ocorre:
um contato arquivado (19 hoje) que se recadastra continua invisível nas telas,
mas com o cadastro atualizado. A pessoa preenche, some da vista do operador, e
ninguém entende por quê.

Esses dois comportamentos são o mesmo defeito conceitual: **o formulário decide
sobre estados que não são dele**.

### 1.3 Telefone inválido derruba o envio inteiro

Se o telefone não normaliza, a resposta é `Telefone inválido` e **nada é salvo** —
nem nome, nem endereço, nem as respostas já preenchidas. Em formulário longo com
seções, é a pior hora possível para perder tudo.

Vale notar que a rotina de telefone (`src/lib/phone.ts`) é boa: reconhece
"sem DDD", "sem nono dígito", "precisa revisão". Mas o formulário público não usa
essa granularidade — ele só pergunta "válido ou não".

---

## 2. Estados: o usuário entende o que está vendo?

Do glossário (`03-glossario-e-definicoes.md`) e da conferência na base:

- **10 valores** possíveis de ciclo de vida; parte deles nunca é gravada por
  nenhum caminho do sistema. O filtro oferece opções que sempre retornam zero.
- **Status de WhatsApp**: 100% "desconhecido" na base atual. A coluna existe, o
  filtro existe, o valor nunca muda.
- **Arquivado** e **opt-out** são coisas diferentes que, na tela, produzem o
  mesmo efeito prático ("essa pessoa sumiu"), com causas distintas e nenhuma
  indicação de qual delas ocorreu.

Um filtro que nunca traz resultado é pior que um filtro ausente: ele ensina o
usuário a desconfiar da ferramenta.

---

## 3. Ações em massa e reversibilidade

- Seleção em massa acima de 1.000 itens é **truncada silenciosamente**
  (`02-gestao-da-base.md`). O usuário vê "selecionar todos", age, e parte da base
  não foi afetada — sem aviso.
- A importação tem desfazer (`imports-undo.functions.ts`) — **este é o melhor
  padrão de reversibilidade do sistema** e deveria ser a referência para as
  demais ações em massa.
- Mesclagem guarda snapshot do registro absorvido (`contact_merges`) — também
  correto.
- Já arquivamento em lote, mudança de status em lote e etiquetagem em massa não
  têm desfazer nem histórico consolidado visível ao operador.

---

## 4. A fila de duplicidades está parada

| Estado | Pares |
|---|---|
| Pendente | **166** |
| Separados | 44 |
| Mesclado | 18 |

A detecção funciona (o gatilho roda, os pares aparecem). O que falta é
**rotina**: nada no sistema chama o operador para essa fila, e ela não aparece
como indicador em nenhum painel. Duplicidade não resolvida é a causa mais comum
de "mandei a mesma mensagem duas vezes para a mesma pessoa".

---

## 5. Coerência entre telas

O mesmo contato pode aparecer ou não dependendo da tela, porque cada uma decide
sozinha sobre arquivados e sobre o que conta como "tem telefone". Já documentado
em `01` e `05`; do ponto de vista de experiência o efeito é único e grave:

> O usuário não consegue formar um modelo mental estável do sistema.
> Ele aprende "nessa tela é assim, naquela é assado" — e passa a conferir tudo
> manualmente, que é justamente o trabalho que o sistema deveria eliminar.

---

## 6. O que já está bom (e deve ser preservado)

1. Porta de entrada única para todos os formulários públicos.
2. Catálogo de campos declarativo.
3. Importação com prévia + desfazer.
4. Mesclagem com snapshot e histórico.
5. Rastreio de origem por link (`tracked_form_links`) — poucos CRMs têm isso
   pronto.
6. Missões com atribuição atômica no banco — resolve corrida entre agitadores.

Nenhuma recomendação desta auditoria pede para mexer nesses seis pontos.
