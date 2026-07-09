// Universal Z-API webhook receiver. Configure in Z-API painel pointing to
// /api/public/zapi/{evento}?token=ZAPI_WEBHOOK_SECRET where evento is one of:
//   on-send | on-delivery | on-read | on-receive | on-connect | on-disconnect | on-message-status
// Também aceita `on-test` (usado pelo botão de diagnóstico interno em /whatsapp).
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

type AnyRecord = Record<string, unknown>;

function safeStr(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function safeNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function safeBool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}
function asRecord(v: unknown): AnyRecord | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as AnyRecord) : null;
}

function pickPhone(payload: AnyRecord): string | null {
  // Prioridade: campos que costumam trazer telefone REAL (não LID).
  // Alguns eventos da Z-API entregam o `phone` como "<digits>@lid" quando o
  // WhatsApp não expõe o número real; nesses casos, tentamos os campos
  // alternativos antes de cair no `phone` cru.
  const candidates: Array<string | null> = [
    safeStr(payload.senderPhone),
    safeStr(payload.participantPhone),
    safeStr(payload.chatPhone),
    safeStr(payload.authorPhone),
    safeStr(asRecord(payload.sender)?.phone),
    safeStr(payload.phone),
    safeStr(payload.from),
  ];
  // Escolhe o primeiro que NÃO seja LID.
  const real = candidates.find((v) => v && !/@lid$/i.test(v));
  if (real) return real;
  // Se só temos LID, devolvemos ele mesmo (a UI mostra amigável).
  return candidates.find((v) => Boolean(v)) ?? null;
}
function pickZaapId(payload: AnyRecord): string | null {
  return safeStr(payload.zaapId) ?? safeStr(payload.id) ?? null;
}
function pickMessageId(payload: AnyRecord): string | null {
  return safeStr(payload.messageId) ?? safeStr(payload.ids) ?? null;
}

type Media = {
  url: string | null;
  mime: string | null;
  filename: string | null;
  size: number | null;
  tipo: "image" | "document" | "audio" | "video" | null;
};

// Extrai metadados de mídia do payload da Z-API (image/document/audio/video).
function pickMedia(payload: AnyRecord): Media {
  const image = asRecord(payload.image);
  const document = asRecord(payload.document);
  const audio = asRecord(payload.audio);
  const video = asRecord(payload.video);
  if (image) {
    return {
      url: safeStr(image.imageUrl) ?? safeStr(image.url),
      mime: safeStr(image.mimeType) ?? safeStr(image.mime),
      filename: safeStr(image.caption) ?? null,
      size: safeNum(image.size),
      tipo: "image",
    };
  }
  if (document) {
    return {
      url: safeStr(document.documentUrl) ?? safeStr(document.url),
      mime: safeStr(document.mimeType) ?? safeStr(document.mime),
      filename: safeStr(document.fileName) ?? safeStr(document.filename),
      size: safeNum(document.size),
      tipo: "document",
    };
  }
  if (audio) {
    return {
      url: safeStr(audio.audioUrl) ?? safeStr(audio.url),
      mime: safeStr(audio.mimeType) ?? "audio/ogg",
      filename: null,
      size: safeNum(audio.size),
      tipo: "audio",
    };
  }
  if (video) {
    return {
      url: safeStr(video.videoUrl) ?? safeStr(video.url),
      mime: safeStr(video.mimeType) ?? "video/mp4",
      filename: safeStr(video.caption) ?? null,
      size: safeNum(video.size),
      tipo: "video",
    };
  }
  return { url: null, mime: null, filename: null, size: null, tipo: null };
}

const OPT_OUT_KEYWORDS = ["sair", "parar", "cancelar", "remove", "stop", "descadastrar"];

export const Route = createFileRoute("/api/public/zapi/$evento")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const url = new URL(request.url);
        const tokenParam =
          url.searchParams.get("token") ?? request.headers.get("x-webhook-token") ?? "";
        const expected = process.env.ZAPI_WEBHOOK_SECRET ?? "";
        if (!expected) return new Response("Webhook secret missing", { status: 500 });
        const a = Buffer.from(tokenParam);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const evento = params.evento;
        let body: AnyRecord = {};
        try {
          body = (await request.json()) as AnyRecord;
        } catch {
          body = {};
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Always log first
        await supabaseAdmin.from("webhook_log").insert({
          evento,
          provider: "zapi",
          payload: body as never,
          processado: false,
        });

        try {
          if (evento === "on-test") {
            // Endpoint de diagnóstico: nada a processar, só confirma que a rota respondeu.
            await supabaseAdmin
              .from("webhook_log")
              .update({ processado: true })
              .eq("evento", "on-test")
              .order("received_at", { ascending: false })
              .limit(1);
            return new Response(JSON.stringify({ ok: true, test: true }), {
              headers: { "Content-Type": "application/json" },
            });
          }

          if (evento === "on-connect" || evento === "on-disconnect") {
            const connected = evento === "on-connect";
            const numero = safeStr(body.connected_phone) ?? safeStr(body.phone);
            await supabaseAdmin
              .from("whatsapp_instances")
              .update({
                status: connected ? "connected" : "disconnected",
                numero_conectado: numero,
                last_ping: new Date().toISOString(),
              })
              .eq("provider", "zapi");
          } else if (evento === "on-receive") {
            const { data: inst } = await supabaseAdmin
              .from("whatsapp_instances")
              .select("inbound_to_inbox_enabled")
              .eq("provider", "zapi")
              .maybeSingle();
            const inboundEnabled = inst?.inbound_to_inbox_enabled === true;

            const phone = pickPhone(body);
            const text =
              safeStr(asRecord(body.text)?.message) ??
              safeStr(asRecord(body.message)?.text) ??
              safeStr(body.text) ??
              safeStr(body.message) ??
              null;

            // Vincula ao contato APENAS se já existir na base (não cria mais contato automaticamente).
            // Usado tanto pelo registro no Inbox/opt-out abaixo quanto pela resposta
            // automática por gatilho — nenhum dos dois exige que o contato já exista.
            let contactId: string | null = null;
            if (phone) {
              const digits = phone.replace(/\D+/g, "");
              const last8 = digits.length >= 8 ? digits.slice(-8) : null;
              if (last8) {
                // Casa contra o telefone principal OU secundário — evita duplicar
                // contato quando a pessoa manda mensagem pelo número secundário.
                const { data: c } = await supabaseAdmin
                  .from("contacts")
                  .select("id, phone_last8, phone_secundario_last8")
                  .or(`phone_last8.eq.${last8},phone_secundario_last8.eq.${last8}`)
                  .limit(1)
                  .maybeSingle();
                contactId = c?.id ?? null;
              }
            }

            if (inboundEnabled) {
              const senderName =
                safeStr(body.senderName) ?? safeStr(body.chatName) ?? safeStr(body.notifyName);
              const media = pickMedia(body);

              await supabaseAdmin.from("inbound_messages").insert({
                from_phone: phone,
                from_name: senderName,
                conteudo: text,
                tipo: media.tipo ?? safeStr(body.type) ?? "text",
                payload: body as never,
                contact_id: contactId,
                media_url: media.url,
                media_mime: media.mime,
                media_filename: media.filename,
                media_size: media.size,
              });

              // Opt-out via palavra-chave (apenas se vinculado)
              if (text && contactId) {
                const norm = text.trim().toLowerCase();
                if (OPT_OUT_KEYWORDS.some((k) => norm === k || norm.startsWith(k + " "))) {
                  await supabaseAdmin
                    .from("contacts")
                    .update({ opt_out_at: new Date().toISOString() })
                    .eq("id", contactId);
                  await supabaseAdmin
                    .from("campaign_recipients")
                    .update({ status: "opted_out" })
                    .eq("contact_id", contactId)
                    .in("status", ["queued", "sending"]);
                }
              }
            }

            // Resposta automática por palavra-gatilho — roda sempre, independente
            // de `inbound_to_inbox_enabled` (é uma preocupação separada de "mostrar
            // mensagem no Inbox"; o cenário principal — link de panfleto — é
            // justamente gente que ainda não é contato conhecido).
            // Try/catch próprio: uma falha aqui nunca deve afetar o registro em
            // inbound_messages/opt-out acima, nem o `processado:true` gravado no final.
            if (phone && text) {
              try {
                const { data: triggers } = await supabaseAdmin
                  .from("auto_reply_triggers")
                  .select("id, phrase, response_text")
                  .eq("is_active", true);
                const norm = text.trim().toLowerCase();
                const match = (triggers ?? [])
                  .filter((t) => norm.includes(t.phrase.toLowerCase()))
                  .sort((a, b) => b.phrase.length - a.phrase.length)[0];

                if (match) {
                  const digits = phone.replace(/\D+/g, "");
                  const { data: recent } = await supabaseAdmin
                    .from("auto_reply_log")
                    .select("replied_at")
                    .eq("trigger_id", match.id)
                    .eq("phone", digits)
                    .order("replied_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                  const cooldownOk =
                    !recent || Date.now() - new Date(recent.replied_at).getTime() > 24 * 60 * 60 * 1000;

                  if (cooldownOk) {
                    const { sendMessage } = await import("@/lib/wa-send.server");
                    await sendMessage({
                      contact: { phone_e164: phone },
                      text: match.response_text,
                      textAlreadyRendered: true,
                      origin: "auto_reply_trigger",
                      skipValidations: true,
                    });
                    await supabaseAdmin.from("auto_reply_log").insert({
                      trigger_id: match.id,
                      phone: digits,
                      contact_id: contactId,
                    });
                  }
                }
              } catch (e) {
                await supabaseAdmin.from("webhook_log").insert({
                  evento: "on-receive:auto_reply_error",
                  provider: "zapi",
                  payload: { message: e instanceof Error ? e.message : String(e) } as never,
                  processado: false,
                  erro: e instanceof Error ? e.message : String(e),
                });
              }
            }
          } else if (
            evento === "on-send" ||
            evento === "on-delivery" ||
            evento === "on-read" ||
            evento === "on-message-status"
          ) {
            const zaapId = pickZaapId(body);
            const messageId = pickMessageId(body);
            if (zaapId || messageId) {
              const status = (safeStr(body.status) ?? "").toLowerCase();
              const now = new Date().toISOString();

              type RecipientPatch = {
                status?: "sent" | "delivered" | "read" | "failed";
                sent_at?: string;
                delivered_at?: string;
                read_at?: string;
                failed_at?: string;
                erro?: string | null;
              };
              type DirectPatch = {
                status?: string;
                delivered_at?: string;
                read_at?: string;
                failed_at?: string;
                erro?: string | null;
              };
              let rPatch: RecipientPatch = {};
              let dPatch: DirectPatch = {};

              if (evento === "on-send" || status === "sent" || status === "sent-by-server") {
                rPatch = { status: "sent", sent_at: now };
                dPatch = { status: "enviado" };
              } else if (evento === "on-delivery" || status === "received" || status === "delivered") {
                rPatch = { status: "delivered", delivered_at: now };
                dPatch = { status: "entregue", delivered_at: now };
              } else if (evento === "on-read" || status === "read") {
                rPatch = { status: "read", read_at: now };
                dPatch = { status: "lido", read_at: now };
              } else if (status === "failed" || safeBool(body.error)) {
                rPatch = { status: "failed", failed_at: now, erro: safeStr(body.error) };
                dPatch = { status: "erro", failed_at: now, erro: safeStr(body.error) };
              }

              // Patch em campaign_recipients (não bloqueia direct_messages)
              if (Object.keys(rPatch).length > 0) {
                try {
                  let q = supabaseAdmin.from("campaign_recipients").update(rPatch);
                  if (zaapId) q = q.eq("zaap_id", zaapId);
                  else if (messageId) q = q.eq("message_id", messageId);
                  await q;
                } catch { /* ignora — status ainda gravado em webhook_log */ }
              }
              // Patch em direct_messages (mensagens do Inbox)
              if (Object.keys(dPatch).length > 0) {
                try {
                  let dq = supabaseAdmin.from("direct_messages").update(dPatch);
                  if (zaapId) dq = dq.eq("zaap_id", zaapId);
                  else if (messageId) dq = dq.eq("message_id", messageId);
                  await dq;
                } catch { /* ignora */ }
              }

              // Registra evento em message_events se achar o recipient
              const { data: rec } = await supabaseAdmin
                .from("campaign_recipients")
                .select("id, contact_id")
                .or(
                  [zaapId ? `zaap_id.eq.${zaapId}` : null, messageId ? `message_id.eq.${messageId}` : null]
                    .filter(Boolean)
                    .join(","),
                )
                .maybeSingle();
              await supabaseAdmin.from("message_events").insert({
                recipient_id: rec?.id ?? null,
                contact_id: rec?.contact_id ?? null,
                tipo: evento,
                payload: body as never,
              });

              // Entrega/leitura confirmam que o número existe no WhatsApp — atualiza
              // o contato, mas nunca sobrescreve uma marcação manual de inválido/opt-out.
              if (rec?.contact_id && (evento === "on-delivery" || evento === "on-read")) {
                try {
                  await supabaseAdmin
                    .from("contacts")
                    .update({ whatsapp_status: "confirmado", whatsapp_checked_at: now })
                    .eq("id", rec.contact_id)
                    .neq("whatsapp_status", "invalido")
                    .neq("whatsapp_status", "opt_out");
                } catch { /* ignora — não bloqueia o restante do webhook */ }
              }
            }
          }

          await supabaseAdmin
            .from("webhook_log")
            .update({ processado: true })
            .eq("evento", evento)
            .order("received_at", { ascending: false })
            .limit(1);
        } catch (err) {
          await supabaseAdmin.from("webhook_log").insert({
            evento: `${evento}:error`,
            provider: "zapi",
            payload: { message: err instanceof Error ? err.message : String(err) } as never,
            processado: false,
            erro: err instanceof Error ? err.message : String(err),
          });
        }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
