# 00 — Referências open source (benchmarking conceitual)

> Documento **conceitual**. Nada aqui é proposta de instalar, migrar ou copiar código.
> O objetivo é responder: *como sistemas maduros resolvem os mesmos problemas que
> encontramos na auditoria?* — e usar isso como régua de qualidade.

Projetos consultados: **CiviCRM**, **EspoCRM**, **Twenty**, **Corteza**,
**Metabase**, **Apache Superset**, **Appsmith**.

---

## 1. Por que esses sete

Os três primeiros são CRMs (mesma natureza do nosso sistema: pessoas, contato,
campanha). CiviCRM é o mais próximo do nosso caso real — foi feito para
organizações de causa, com apoiadores, voluntários e comunicação em massa.
Os quatro últimos não são CRMs: são plataformas de dados e de telas. Interessam
porque resolvem exatamente a dor que a auditoria expôs — *muitas telas lendo a
mesma base com regras diferentes*.

---

## 2. O padrão que todos compartilham

Apesar de bem diferentes entre si, os sete convergem em três decisões:

### 2.1 Uma definição por conceito, declarada em um lugar

Em nenhum deles a regra "quem é um contato válido" vive espalhada pelas telas.
- CiviCRM tem um estado explícito de contato (ativo / suprimido / falecido /
  mesclado) e todas as consultas passam pelo mesmo filtro base.
- EspoCRM declara cada entidade e seus filtros em metadados; a tela consome o
  filtro, não o reescreve.
- Metabase e Superset formalizam isso como **camada semântica**: a métrica
  "clientes ativos" é definida uma vez e todo gráfico usa aquela definição.

**Nosso desvio:** a auditoria encontrou a mesma regra reescrita em até 20 lugares
(`05-fonte-unica-da-verdade.md`). Cada tela é sua própria camada semântica.

### 2.2 Arquivar / suprimir é estado de primeira classe, nunca um filtro opcional

CiviCRM trata `is_deleted` e `do_not_sms` como bloqueio de sistema: a comunicação
em massa não consegue alcançar essas pessoas, independentemente de qual tela
montou a lista. Twenty tem lixeira própria com o mesmo princípio.

**Nosso desvio:** `arquivado_at` é aplicado por *cada* consulta que lembrar de
aplicá-lo, e o motor de envio não o aplica. É por isso que existem contatos
arquivados que ainda receberiam campanha.

### 2.3 Contagem e ação usam o mesmo caminho

Superset e Metabase não deixam o número do painel e o dado exportado virem de
consultas diferentes — é a mesma pergunta, renderizada de duas formas.
CiviCRM constrói a prévia da campanha com o mesmo motor que faz o envio.

**Nosso desvio:** a prévia de audiência e o disparo real são códigos distintos
(`04-indicadores.md`), então o número que você vê antes de enviar não é o número
que vai receber.

---

## 3. O que cada projeto ensina especificamente

| Projeto | Lição aplicável ao nosso sistema |
|---|---|
| **CiviCRM** | Duplicidade é rotina operacional, não incidente: regras de deduplicação nomeadas, fila de revisão e mesclagem com histórico. Nós já temos as tabelas (`contact_duplicates`, `contact_merges`) mas **166 pares seguem pendentes** e não há rotina que force a fila a esvaziar. |
| **EspoCRM** | Campos e formulários vêm de metadados; incluir um campo novo não exige tocar em código de tela. Nosso catálogo de campos (`form-field-catalog.ts`) já caminha nessa direção — é um acerto do projeto. |
| **Twenty** | Modelo enxuto e previsível: poucos estados, cada um com significado óbvio. Contraste com nossos **10 valores** de ciclo de vida, dos quais vários nunca são gravados. |
| **Corteza** | Permissão declarada por recurso, auditável. Nós temos papéis, mas o que cada papel enxerga está espalhado em RLS + código de tela. |
| **Metabase** | Métrica é objeto nomeado e reutilizável, não fórmula digitada em cada painel. |
| **Superset** | Toda métrica exibida é rastreável até a consulta que a produziu — o usuário consegue perguntar "de onde saiu esse número?". Hoje, no nosso sistema, essa pergunta só se responde lendo código. |
| **Appsmith** | Tela é consumidora de uma fonte de dados; a lógica não mora no componente. Nossas telas frequentemente contêm regra de negócio (ex.: filtro de arquivados decidido na tela). |

---

## 4. Conclusão da comparação

O nosso sistema **não está atrás em funcionalidade** — em vários pontos
(catálogo de campos, formulários com ramificação, missões, rastreio de origem)
ele faz coisas que esses projetos só fazem com plugins.

A diferença é de **arquitetura de significado**: eles têm uma camada onde o
conceito é definido; nós temos o conceito redefinido a cada uso.

Isso é uma boa notícia para o plano de ação: o que falta não é reconstruir o
sistema, e sim **extrair para um lugar único as regras que já existem** — sem
mudar modelo de dados e sem redesenhar tela.
