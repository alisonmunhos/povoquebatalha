
## Resposta às suas dúvidas

**Mensagem vs Campanha (hoje):**
- **Mensagem** (`/mensagens`) = *modelo salvo e reutilizável*. Não envia sozinha. Serve para: automações (disparadas por evento), respostas prontas no Inbox e como base para campanhas. Já tem hoje: título, corpo, variáveis, link, anexo (imagem/PDF), prévia estilo WhatsApp, botão "Enviar teste".
- **Campanha** (`/campanhas`) = *ação de envio em massa*. Escolhe público (segmento ou filtro), agenda, aplica delays antirrastreio, dispara em fila, registra entregas e falhas por contato. Tem status (draft → running → done), pode ser pausada/cancelada.

**Segmento no diálogo "Nova campanha":** define o público de verdade — não é só rótulo. `buildAudienceIds()` lê `segments.member_ids` (ou filtro) e insere esses contatos como destinatários quando você clica em "Preparar destinatários". Se ficar em branco, hoje a campanha fica sem público (por isso o diálogo precisa deixar isso explícito).

**Conceito confirmado:** os dois fluxos devem ter a **mesma experiência de composição** (mesmo editor, mesma prévia, mesmos campos de link/anexo/variáveis). A diferença fica só no *objetivo*: salvar como modelo vs. disparar para um público.

---

## Plano

### Etapa A — Componente compartilhado `MessageComposer`
Criar `src/components/MessageComposer.tsx` reunindo tudo que hoje só existe em `/mensagens`:
- Textarea da mensagem.
- Chips clicáveis de variáveis: `{{nome}} · {{primeiro_nome}} · {{cidade}} · {{bairro}} · {{link_atualizacao}} · {{link_inscricao}}` — clique insere a variável na posição do cursor.
- Campo **Link** (com dica: "aparece com prévia no WhatsApp").
- Campo **Anexo** (imagem PNG/JPG/WebP ou PDF, até 8MB), usando `signCampaignMediaUpload` já existente.
- **Prévia estilo WhatsApp** reutilizando `MessagePreview` / `WhatsappPreview`.
- Props: `value`, `onChange`, `showAttachment`, `showLink`, `variables?`.

### Etapa B — Refatorar diálogo "Nova campanha" (`campanhas.index.tsx`)
Substituir os campos atuais por `MessageComposer`, mantendo os campos exclusivos de campanha:
- Nome da campanha.
- **Segmento** com label mais claro: *"Público-alvo (obrigatório)"* + texto "Selecione o segmento que receberá esta mensagem". Mostrar contagem estimada de contatos no segmento escolhido.
- Botão "Criar como rascunho" desabilitado sem segmento (com tooltip explicando).
- Agendamento e delays (mantidos).
- Remover o `<select tipo=text|image>` — o tipo é inferido do anexo, como já é feito no wizard.
- Salvar `link_url`, `link_title`, `link_description`, `link_image`, `midia_url` no `upsertCampaign` (colunas já existem).

### Etapa C — Refatorar formulário de "Nova mensagem" (`mensagens.tsx`)
Trocar o bloco atual pelo `MessageComposer` (mesmos chips clicáveis, mesma prévia). Os campos de metadata específicos de template (título, evento, atalho, categoria, ativa) ficam por fora do composer.

### Etapa D — Texto de ajuda unificado
Adicionar bloco curto no topo dos dois diálogos:
> *"Mensagem e campanha usam o mesmo editor. Uma **mensagem salva** vira modelo reutilizável para automações e Inbox. Uma **campanha** dispara essa mensagem para um público-alvo agora ou no futuro."*

Adicionar em "Nova campanha" um link "**Usar mensagem salva**" (fase futura — fora desta etapa) já como placeholder desabilitado, só para deixar o conceito visível.

---

## Detalhes técnicos

- Nenhuma migration nova — colunas `link_*`, `midia_url` e `preview_status` já existem em `campaigns`.
- `MessageComposer` fica em `src/components/` e é importado por `campanhas.index.tsx`, `mensagens.tsx` e (fase futura) `SendWhatsAppWizard.tsx`.
- Inserir variável usa `textarea.selectionStart/End` para preservar cursor.
- Prévia usa `MessagePreview` já criado na Etapa 1 (mesmo motor visual do Wizard).
- Contagem do segmento: reusar `listSegments` (já traz `member_ids.length` se `tipo='static'`) ou consulta leve; se `tipo='dynamic'`, mostrar "≈ calculado ao preparar".

## Fora de escopo desta rodada
- Migrar o `SendWhatsAppWizard` (envio direto a partir de Contatos) para o mesmo composer — próxima etapa.
- Botão "Usar mensagem salva" dentro de "Nova campanha" (só placeholder por enquanto).
- Mexer em Inbox, Território ou Automações.

## Riscos
- `variables` do template continua sendo salvo como JSON — manter o array fixo para não quebrar automações existentes.
- Segmentos dinâmicos podem retornar contagem só na hora do "Preparar destinatários"; o botão de criar não deve travar por isso.
