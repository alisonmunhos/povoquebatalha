# WhatsApp Flow "Múltipla escolha" — configuração no WhatsApp Manager

Este é um Flow **genérico e reutilizável**: uma tela só, com um `CheckboxGroup`
que recebe a pergunta e as opções como dado dinâmico no momento do envio. O
mesmo Flow publicado serve para **todas** as perguntas `multi_choice` de
**todos** os fluxos de cadastro do app — não é preciso criar um Flow por
pergunta nem por fluxo.

Não precisa de endpoint (data channel) nem criptografia: é uma tela estática,
os dados de entrada (pergunta + opções) chegam junto com a mensagem que abre
o Flow, e a resposta (opções marcadas) volta pelo webhook normal, como
qualquer mensagem interativa.

## Passo a passo no WhatsApp Manager

1. Acesse **business.facebook.com → WhatsApp Manager** → sua conta →
   aba **Flows**.
2. **Create Flow** → dê um nome (ex.: `pqb-checkbox-generico`) → escolha
   "Create from scratch" (ou "Blank Flow").
3. No editor, troque para o **modo JSON** (ícone `</>` / "Edit JSON" no canto
   do editor) e cole o JSON abaixo, substituindo o conteúdo padrão.
4. Use o **simulador** (painel de preview do próprio editor) para conferir
   que a tela mostra o `CheckboxGroup` corretamente.
5. **Publish** o Flow. Rascunho ("Draft") não funciona em produção — precisa
   estar como **Published**.
6. Na listagem de Flows, copie o **Flow ID** (um número) da linha do Flow
   publicado.
7. Configure a variável de ambiente `WHATSAPP_CHECKBOX_FLOW_ID` com esse
   número (mesmo lugar onde `WHATSAPP_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID` já
   estão configurados).

Se o editor pedir para atualizar a versão do JSON pra uma mais recente,
aceite a sugestão — o campo `"version"` abaixo é o ponto de partida, não
precisa ser exatamente esse número.

## Flow JSON

```json
{
  "version": "7.2",
  "screens": [
    {
      "id": "CHECKBOX",
      "title": "Selecione as opções",
      "terminal": true,
      "success": true,
      "data": {
        "question": {
          "type": "string",
          "__example__": "Como você pode ajudar a campanha?"
        },
        "options": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": { "type": "string" },
              "title": { "type": "string" }
            }
          },
          "__example__": [
            { "id": "panfletagem", "title": "Panfletagem" },
            { "id": "doacao", "title": "Doação" }
          ]
        }
      },
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          {
            "type": "Form",
            "name": "form",
            "children": [
              {
                "type": "TextHeading",
                "text": "${data.question}"
              },
              {
                "type": "CheckboxGroup",
                "name": "selected_options",
                "label": "Marque uma ou mais opções",
                "required": true,
                "data-source": "${data.options}"
              },
              {
                "type": "Footer",
                "label": "Continuar",
                "on-click-action": {
                  "name": "complete",
                  "payload": {
                    "selected_options": "${form.selected_options}"
                  }
                }
              }
            ]
          }
        ]
      }
    }
  ]
}
```

## Como o app usa isso

- Ao chegar numa pergunta `multi_choice` **nova** (sessão ainda sem seleção
  em andamento), o motor manda uma mensagem interativa `type: "flow"`
  apontando pro `WHATSAPP_CHECKBOX_FLOW_ID`, com a pergunta e as opções da
  etapa como dado inicial (`flow_action_payload.data`).
- A pessoa marca as opções e toca em "Continuar" — isso dispara a ação
  `complete`, que devolve `selected_options` (array com os `id`s marcados)
  pelo webhook normal, como `interactive.nfm_reply.response_json`.
- Se `WHATSAPP_CHECKBOX_FLOW_ID` não estiver configurado, ou se o envio do
  Flow falhar por qualquer motivo, o motor cai automaticamente no método
  antigo (lista tocável, item por item) — nada quebra enquanto o Flow não
  estiver publicado.
