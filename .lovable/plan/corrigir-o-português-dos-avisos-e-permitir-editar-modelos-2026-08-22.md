# Corrigir o português dos avisos e permitir editar modelos

## Respondendo direto

- **Sim, acentos são permitidos** nos modelos oficiais. Os textos foram enviados sem acento por descuido meu, não por limitação da Meta.
- **Editar depende do status.** A Meta só aceita edição de modelo com status aprovado, reprovado ou pausado. Os dois avisos estão **em análise (pending)**, e nesse estado a Meta não permite editar. No sistema também não: hoje a tela de Templates só deixa editar rascunhos (modelo já enviado fica travado).
- Existe um detalhe importante: quando um modelo é apagado na Meta, **o mesmo nome fica bloqueado por 30 dias**. Então não vale apagar e recriar com o mesmo nome.

## Textos corrigidos (com acentuação e "App do Povo que Batalha")

Aviso 1 — nova atribuição:

```text
Olá {{responsavel}}! A conversa com {{contato}} foi atribuída a você no App do Povo que Batalha.

Última mensagem: {{resumo}}

Abra o Inbox para responder.
```

Aviso 2 — conversa repassada:

```text
Olá {{responsavel}}, a conversa com {{contato}} foi repassada para {{novo_responsavel}}. Você não é mais o responsável por ela.
```

Rodapé dos dois: `App do Povo que Batalha`. Botão do aviso 1: `Abrir Inbox`.

## O que vou fazer

1. Apagar na Meta os dois modelos em análise (ainda não foram usados, nada se perde).
2. Enviar de novo, já com a acentuação correta, sob **nomes novos** (para não cair no bloqueio de 30 dias):
   - `inbox_conversa_atribuida_br`
   - `inbox_conversa_repassada_br`
3. Atualizar o registro na tela de Templates: remover as duas linhas antigas e cadastrar as novas, com status "em análise".
4. Melhorar a tela de Templates para o futuro:
   - Botão **"Duplicar e corrigir"** em qualquer modelo já enviado: cria um rascunho com o mesmo conteúdo para você ajustar o texto e enviar novamente.
   - Botão **"Editar na Meta"** habilitado apenas quando o modelo estiver aprovado ou reprovado (é quando a Meta aceita edição), avisando em português quando não for possível.
   - Aviso visual no editor lembrando de usar acentuação correta antes de enviar.

## Cuidados

- Aprovação da Meta é externa: os modelos novos voltam para "em análise" e podem levar de minutos a algumas horas.
- Enquanto não estiverem aprovados, o aviso automático de atribuição não pode ser disparado.
- Nenhum dado de contato, conversa ou campanha é afetado.

## Detalhes técnicos

- `DELETE /v23.0/{waba_id}/message_templates?hsm_id={id}&name={nome}` para remover os dois pendentes; depois `POST /v23.0/{waba_id}/message_templates` com `parameter_format: "named"` e os textos acentuados.
- `whatsapp_templates`: remover as linhas `inbox_conversa_*` e inserir as versões `_br` com `status='pending'`, `meta_template_id` retornado pela Meta, `example_values` nomeados e `buttons` do aviso 1.
- `src/lib/whatsapp-templates.functions.ts`: nova função `duplicateWhatsappTemplateAsDraft` (copia conteúdo para um rascunho com nome livre) e `editWhatsappTemplateOnMeta` (POST em `/{meta_template_id}` com components, permitido só para status `approved`/`rejected`/`paused`).
- `src/routes/_authenticated/comunicacao.templates.tsx`: botões "Duplicar e corrigir" e "Editar na Meta" (habilitado conforme status), com mensagens de erro em português.
