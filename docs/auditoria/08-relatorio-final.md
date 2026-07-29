# 08 — Relatório final: diagnóstico consolidado e plano de ação

Fecha a auditoria iniciada nos documentos `00` a `07`.
Todas as afirmações numéricas foram conferidas diretamente na base.

---

## 1. Diagnóstico em uma frase

> O sistema tem os dados certos e as funcionalidades certas.
> O que ele não tem é **uma definição única para cada conceito** — e por isso
> cada tela responde uma coisa diferente sobre a mesma pessoa.

Não há evidência de perda de dados. Há evidência de **perda de confiança**:
números que não batem, filtros que não trazem nada, ações em massa que afetam
menos do que dizem, e uma prévia de campanha que não corresponde ao envio.

---

## 2. Retrato da base (conferido hoje)

| Medida | Valor |
|---|---|
| Contatos totais | 3.289 |
| Arquivados | 19 |
| Opt-out | 16 |
| Com telefone bruto mas sem formato válido | 11 |
| Pares de duplicidade pendentes | **166** |
| Formulários ativos | 8 |
| Status de WhatsApp diferente de "desconhecido" | 0 |

---

## 3. Os 6 problemas estruturais

Consolidação dos achados dos documentos anteriores, em ordem de gravidade.

### P1 — Regra de negócio sem dono (raiz de quase tudo)
8 regras centrais reescritas em vários lugares; "contato ativo" aparece em mais
de 20. Cada divergência vira um número errado ou um contato invisível.
→ `05-fonte-unica-da-verdade.md`

### P2 — Bloqueios de comunicação não são respeitados no envio
O motor de envio não checa arquivado nem o bloqueio "não enviar". A interface
promete um bloqueio que o disparo não cumpre. Hoje: **3 contatos arquivados
receberiam campanha**.
→ `04-indicadores.md`

### P3 — Indicadores que misturam dimensões
"Sem resposta" subtrai mensagens de pessoas: mostra 3.064 quando o correto é
3.235. Outros 3 indicadores têm erro de escopo (arquivados dentro/fora sem
critério).
→ `04-indicadores.md`

### P4 — Silêncio em vez de erro
Seleção em massa trunca em 1.000 sem avisar; consultas por lista grande de IDs
podem falhar por limite de tamanho de requisição sem mensagem ao usuário; busca
textual descarta acentos e perde 13 registros em "jose".
→ `02-gestao-da-base.md`

### P5 — Estados demais, significado de menos
10 valores de ciclo de vida (vários nunca gravados), status de WhatsApp inerte,
arquivado e opt-out indistinguíveis na tela.
→ `03-glossario-e-definicoes.md`, `07-experiencia-uso.md`

### P6 — Formulário público decide sobre estados que não são dele
Reativa quem pediu descadastro; não desarquiva quem se recadastrou; identifica
pessoa por e-mail e pode sobrescrever cadastro alheio.
→ `07-experiencia-uso.md`

---

## 4. O que se resolve **só centralizando** (sem tocar em banco nem em tela)

Esta é a resposta direta ao seu pedido da Entrega 2.

| # | Ação de centralização | Resolve |
|---|---|---|
| C1 | Um único filtro base "contato ativo", aplicado por padrão | P1, parte de P3 |
| C2 | Uma única função "apto a receber", usada pela prévia **e** pelo envio | P2, P3 |
| C3 | Uma única regra "tem telefone" (candidato → formatado → bruto) | P1 |
| C4 | Todo acesso por lista de IDs passando pela busca em lotes já existente | P4 |
| C5 | Uma única busca textual, com tratamento de acentos | P4 |
| C6 | Uma única contagem de público, compartilhada por painel, prévia e envio | P3 |

**Referência natural de cada regra** (a implementação que já está certa e deve
virar a única):

- Contato ativo → `src/lib/crm-filters.ts`
- Apto a receber / precedência de telefone → `src/lib/wa-send.server.ts`
- Consulta em lote → `fetchContactsBatched` em `src/lib/crm-bulk.functions.ts`
- Contagem de público → `buildAudienceIds` em `src/lib/campaigns.functions.ts`
- Reversibilidade de ação em massa → o desfazer da importação

Nenhum dos seis exige migration, mudança de modelo ou redesenho de interface.

---

## 5. O que **não** se resolve só centralizando

| Item | Por quê | Natureza |
|---|---|---|
| Reduzir os 10 estados de ciclo de vida | Precisa decisão de negócio + migração de valores | Decisão + banco |
| Status de WhatsApp inerte | Precisa alimentar o dado (verificação/webhook) | Integração |
| Fila de 166 duplicidades | Precisa rotina operacional e lugar na interface | Processo + tela |
| Distinguir arquivado de opt-out na tela | Precisa exibição nova | Interface |
| Desfazer para ações em massa | Precisa registrar histórico | Banco + tela |

---

## 6. Duas decisões que dependem de você

Elas travam a padronização dos indicadores. Sem resposta, qualquer número
escolhido continuará sendo arbitrário.

1. **Arquivado entra no "Total da base"?**
   Recomendação: não. Total da base = pessoas ativas; arquivados viram indicador
   próprio.
2. **Usuário do sistema conta como apoiador?**
   Recomendação: não no total de apoiadores; sim na base de contatos, com
   marcação clara.

---

## 7. Plano de ação priorizado

A ordem importa: fazer na ordem inversa garante retrabalho, porque os
indicadores dependem dos filtros e os filtros dependem do acesso em lote.

### Etapa 1 — Parar o sangramento (risco alto, esforço baixo)
1. Aplicar bloqueio de arquivado e "não enviar" **no motor de envio** (P2).
2. Formulário público deixar de reativar quem está em opt-out (P6).
3. Avisar quando a seleção em massa passar do limite, em vez de truncar (P4).

### Etapa 2 — Centralizar (o coração da correção)
4. C4 (acesso em lote) → C3 (telefone) → C1 (contato ativo) → C2 (apto a
   receber) → C6 (contagem de público) → C5 (busca).

### Etapa 3 — Corrigir os indicadores sobre a base já unificada
5. "Sem resposta" passa a contar pessoas.
6. Todo cartão declara explicitamente se inclui arquivados.
7. Prévia de campanha e envio passam a mostrar o mesmo número.

### Etapa 4 — Limpar significado
8. Esconder ou remover opções de filtro que nunca retornam nada.
9. Separar visualmente arquivado de opt-out.
10. Colocar a fila de duplicidades em um painel, com contador visível.

### Etapa 5 — Prevenir reincidência
11. Toda nova tela consome as funções centralizadas; nenhuma consulta nova
    escreve filtro de arquivado por conta própria.
12. Todo indicador novo declara sua fórmula e seu escopo no glossário.

---

## 8. Conclusão

O projeto não precisa de reconstrução. Precisa de **consolidação**: 6 regras
extraídas para um lugar único, 3 correções de bloqueio e 4 indicadores
recalculados. As etapas 1 e 2 sozinhas eliminam a maior parte da
imprevisibilidade sentida hoje, e são inteiramente de reorganização de código
já existente.

Documentos da auditoria:
`00` referências · `01` mapa do sistema · `02` gestão da base ·
`03` glossário · `04` indicadores · `05` fonte única da verdade ·
`06` mapa de dependências · `07` experiência de uso · `08` este relatório.
