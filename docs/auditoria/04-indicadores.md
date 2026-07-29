# 04 — Indicadores: fórmulas, confiabilidade e divergências

> Auditoria conceitual — Entrega 2. Cada fórmula foi lida no código e conferida
> contra o banco em 30/07/2026. Nenhum código foi alterado.

## Resumo

Foram auditados 24 indicadores em 4 painéis. Resultado:

| Classificação | Quantos | Significado |
| --- | --- | --- |
| Confiável | 11 | fórmula correta e recorte coerente |
| Ambíguo | 9 | número certo, mas mede coisa diferente do rótulo |
| **Incorreto** | **4** | fórmula estruturalmente errada |

Nenhum dos 4 incorretos exige mudança de modelo de dados ou de tela — todos são
consequência de a mesma regra estar escrita de novo em cada painel.

---

## 1. Painel principal (Dashboard)

| Indicador exibido | Fórmula real | Valor | Avaliação |
| --- | --- | --- | --- |
| Total de contatos | contatos não arquivados | 3.270 | Confiável |
| Novos na semana | criados nos últimos 7 dias, **incluindo arquivados** | 18 | Ambíguo — recorte diferente do "Total" logo ao lado |
| Com consentimento | consentimento = sim **e** sem opt-out, **sem excluir arquivados** | 3.270 | **Incorreto** — inclui 3 arquivados; deveria ser 3.267 |
| Opt-out | com data de opt-out, incluindo arquivados | 16 | Ambíguo |
| Com / sem geolocalização | coordenada preenchida ou não, não arquivados | 101 / 3.169 | Confiável |
| Campanhas / rascunho / em envio | contagem simples | 26 / — / — | Confiável |
| Enviadas na semana | destinatários com envio nos últimos 7 dias | — | Confiável |

**Problema estrutural do painel:** três recortes diferentes convivem lado a
lado — "não arquivados", "todos" e "todos menos opt-out". O usuário lê os
cartões como se fossem partes de um mesmo bolo, e não são. É a origem direta da
sensação de "os números não fecham".

## 2. Painel de Relacionamento

| Indicador | Fórmula real | Valor | Avaliação |
| --- | --- | --- | --- |
| Aptos | consentimento + sem opt-out + não arquivado + tem número de WhatsApp | 3.205 | Confiável |
| Enviados | destinatários com data de envio (histórico total) | 98 | Confiável |
| Respostas | **total de mensagens recebidas**, não de pessoas | 206 | **Incorreto** como "respostas de pessoas" |
| Erros / Recuperáveis | destinatários com falha | 55 | Ambíguo — "recuperável" é igual a "erro", não há critério próprio |
| Opt-outs | com data de opt-out | 16 | Confiável |
| Sem resposta | (contatos com consentimento) − (mensagens recebidas) | 3.064 | **Incorreto** |

O indicador "Sem resposta" subtrai **mensagens** de **pessoas**. O valor correto
seria 3.270 − 35 pessoas que responderam = **3.235**. O painel mostra 3.064 —
**171 pessoas a menos do que a realidade**, e o erro cresce a cada mensagem
nova que chega. Além disso, a base usada aqui (3.270, com arquivados) não é a
mesma do cartão "Aptos" logo acima (3.205).

## 3. Chips rápidos da Gestão da Base

| Chip | Fórmula | Valor | Avaliação |
| --- | --- | --- | --- |
| Cadastro completo | recadastro concluído, não arquivado | 74 | Confiável |
| Só importados | aguardando recadastro, não arquivado | 3.122 | Confiável |
| Número OK | phone_status = válido | 3.193 | Confiável |
| **Precisa revisão** | precisa_revisao + sem_ddd + sem_nono_digito | **16** | **Incorreto** — ignora os 59 inválidos |
| Bloqueados | lifecycle = não enviar | 0 | Confiável |
| Sem WhatsApp | whatsapp_status = inválido | 0 | Ambíguo — nunca houve verificação |

O chip "Bloqueados" ignora arquivados de propósito (correto), enquanto todos os
outros excluem. Mais uma vez: regra decidida caso a caso.

## 4. Prévia de audiência de campanha

Quatro pontos diferentes do código respondem "quem está apto a receber":

| Onde | Critério aplicado |
| --- | --- |
| Prévia da audiência | arquivado, opt-out, consentimento, tem número formatado |
| Criação da campanha | os mesmos quatro |
| Tela de detalhe da campanha | os mesmos quatro |
| Preparação dos destinatários | os mesmos quatro |
| **Disparo real (motor de envio)** | opt-out, consentimento, número — **não checa arquivado** |
| **Pré-checagem do lote** | usa só o número formatado, ignora o número candidato de WhatsApp |

Ou seja: a prévia diz uma coisa, o disparo aplica outra. Hoje isso afeta **3
contatos arquivados que passariam como aptos** — pequeno em volume, grave em
princípio: arquivar não protege de receber mensagem.

E nenhum dos seis pontos verifica `lifecycle_status = nao_enviar`, que é o
bloqueio manual explícito de envio. Hoje há 0 contatos nesse estado, então o
problema está latente — mas o dia em que alguém usar o bloqueio, ele não vai
funcionar.

---

## 5. Diagnóstico de causa

Nenhum dos erros acima é um erro de conta. Todos são **erros de definição
duplicada**:

- "com consentimento" está escrito 4 vezes, de 3 jeitos diferentes;
- "apto a receber" está escrito 6 vezes, de 3 jeitos diferentes;
- "contato ativo" está escrito em praticamente todo arquivo de servidor;
- "número a revisar" está escrito 2 vezes com listas de status diferentes.

Enquanto cada painel escrever a sua versão, corrigir um número não corrige os
outros — e é exatamente isso que vem acontecendo a cada rodada de ajuste.

## 6. O que se resolve só com centralização

| Problema | Precisa mudar banco? | Precisa mudar tela? |
| --- | --- | --- |
| "Com consentimento" incluindo arquivados | Não | Não |
| "Sem resposta" contando mensagens | Não | Não |
| "Precisa revisão" ignorando inválidos | Não | Não |
| Prévia ≠ disparo (arquivado) | Não | Não |
| `nao_enviar` não respeitado no envio | Não | Não |
| Recortes diferentes lado a lado no painel | Não | Não |

**Os 6 problemas de indicador são 100% resolvíveis por centralização de lógica.**
O caminho está em `05-fonte-unica-da-verdade.md`.
