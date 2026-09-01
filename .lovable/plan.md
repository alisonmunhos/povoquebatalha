# Diagnóstico: campanha "DMAE SEM ALICERCE INTRODUÇÃO" falhando com 131031

Nenhum código foi alterado. Nenhum envio novo foi feito. Abaixo o que os dados mostram.

## Conclusão principal

O número oficial está **BANIDO pela Meta** e a WABA foi **desabilitada**. Não é problema de token, rate limit nem de configuração da integração.

Consultei a própria Meta agora (somente leitura):

- Número +55 51 8213-7088 (phone_number_id 1370198982834159): `status: BANNED`, `name_status: DECLINED`, `account_mode: LIVE`, `quality_rating: GREEN`.
- WABA 4304328966545501 (Coletivo Alicerce): `account_review_status: REJECTED`, `business_verification_status: verified`.

Linha do tempo registrada no banco:

- 29/08 20:13 UTC — último envio bem-sucedido da plataforma.
- 30/08 — data do banimento informada pela Meta (`waba_ban_date: "August 30, 2026"`).
- 31/08 02:26 UTC — webhook oficial `account_update`: `event: DISABLED_UPDATE`, `ban_info.waba_ban_state: DISABLE`.
- 31/08 13:00 UTC — webhook `message_template_status_update`: modelo `oi_tudo_bem` (Marketing) **REJEITADO com motivo `SCAM`**.
- 31/08 e 01/09 — todas as tentativas voltam com 131031.

O modelo reprovado por "SCAM" é o sinal mais provável do gatilho: reprovação por golpe/spam em modelo de Marketing normalmente acompanha bloqueio da conta. Forma de pagamento válida não impede esse tipo de bloqueio — ele é de política/qualidade, não de cobrança.

## 1) Resposta crua da Meta (JSON completo)

A chamada de envio (`send-template`) foi **aceita** pela Graph API (HTTP 200, com `wamid`). A falha chegou depois, pelo webhook de status. Por isso o texto curto no banco: o JSON completo está em `webhook_log`. Exemplo real (01/09 15:17:05 UTC):

```json
{
  "metadata": { "phone_number_id": "1370198982834159", "display_phone_number": "555182137088" },
  "statuses": [{
    "id": "wamid.HBgMNTU1MTk5MTM0NDc5FQIAERgSM0ZCNDU1MkYyMzAxNUIzMzhEAA==",
    "status": "failed",
    "timestamp": "1788275824",
    "recipient_id": "555199134479",
    "errors": [{
      "code": 131031,
      "title": "Business Account locked",
      "message": "Business Account locked",
      "error_data": { "details": "Business account has been locked." }
    }]
  }]
}
```

A Meta **não envia** `error_subcode`, `error_user_title`, `error_user_msg` nem `fbtrace_id` nesse callback de status — o payload acima é tudo que existe. Ocorrências de 131031: 3 em 31/08 (14h), 17 em 01/09 (14h) e 5 em 01/09 (15h) — as mesmas 17 que você viu.

## 2) Token de acesso

Válido, sem expiração e com escopos corretos — nada mudou junto com o disparo:

- Tipo: usuário de sistema, app "Canal de Comunicação Alicerce" (991613737267368)
- `is_valid: true`, `expires_at: 0` (nunca expira)
- Escopos: `whatsapp_business_messaging`, `whatsapp_business_management`, `business_management`

## 3) Rate limit e status da conexão

- Sem nenhum erro de rate limit (nada de 130429/131048/80007) nos registros.
- `throughput.level: STANDARD`, qualidade GREEN — não houve estrangulamento.
- Instância `WhatsApp Oficial (Meta)` no banco: `status: connected` desde 16/08, `last_ping` nunca preenchido — ou seja, a plataforma **não reflete** o banimento; ela continua achando que está tudo conectado.
- Campanha: iniciada 01/09 15:16:23 UTC, 1 enviado, 4 falhas, pausada automaticamente 15:17:12, **166 destinatários ainda em fila (`queued`)**.

## 4) Achado extra (não relacionado ao banimento, mas relevante)

O cron de processamento de campanhas está respondendo **401 a cada minuto** em produção:
`POST /api/public/jobs/process-campaign-queue → 401` (verificado continuamente entre 14:22 e 15:22 UTC).
O segredo `CRON_SECRET` esperado pelo endpoint não bate com o enviado pelo agendador. Efeito: campanhas em `running` só avançam quando alguém aciona o lote manualmente.

## Próximos passos sugeridos (nada será executado sem sua aprovação)

1. Abrir apelação do banimento no Business Manager (Qualidade da conta → número banido) e revisar/remover o modelo `oi_tudo_bem` reprovado por SCAM.
2. Corrigir o `CRON_SECRET` para religar o processamento automático da fila.
3. Refletir o estado real da Meta na plataforma: sincronizar `whatsapp_instances.status` com o `status` do número e bloquear o início de campanhas quando o número estiver banido, com aviso claro na tela.
4. Manter os 166 destinatários em fila (nenhum foi consumido) até o número voltar.
