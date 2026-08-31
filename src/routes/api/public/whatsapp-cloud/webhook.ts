// Receptor de webhook da WhatsApp Cloud API (Meta). Peça ADITIVA: não substitui
// nem altera o fluxo da Z-API (/api/public/zapi/$evento).
//
// Configurar no painel da Meta:
//   Callback URL: https://<dominio>/api/public/whatsapp-cloud/webhook
//   Verify token: valor do secret META_WEBHOOK_VERIFY_TOKEN
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { parseCloudMessage, cloudMediaRef } from "@/lib/inbound-message-parse.server";

type AnyRecord = Record<string, unknown>;

function safeStr(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function asRecord(v: unknown): AnyRecord | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as AnyRecord) : null;
}
function asArray(v: unknown): AnyRecord[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as AnyRecord[]) : [];
}

function tokenMatches(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Confere a assinatura HMAC-SHA256 que a Meta envia em X-Hub-Signature-256
// (formato "sha256=<hex>"), calculada sobre o corpo bruto da requisição.
function signatureIsValid(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const received = header.slice("sha256=".length).trim().toLowerCase();
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(received, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

const OPT_OUT_KEYWORDS = ["sair", "parar", "cancelar", "remove", "stop", "descadastrar"];

export const Route = createFileRoute("/api/public/whatsapp-cloud/webhook")({
  server: {
    handlers: {
      // Verificação do endpoint feita pela Meta.
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode") ?? "";
        const token = url.searchParams.get("hub.verify_token") ?? "";
        const challenge = url.searchParams.get("hub.challenge") ?? "";
        const expected = process.env["META_WEBHOOK_VERIFY_TOKEN"] ?? "";

        if (expected && mode === "subscribe" && tokenMatches(token, expected)) {
          return new Response(challenge, {
            status: 200,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        // Corpo bruto é obrigatório para validar a assinatura.
        const rawBody = await request.text();

        const appSecret = process.env["META_APP_SECRET"] ?? "";
        if (!appSecret) {
          return new Response("Webhook secret missing", { status: 500 });
        }
        if (!signatureIsValid(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
          return new Response("Invalid signature", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let body: AnyRecord = {};
        try {
          body = JSON.parse(rawBody) as AnyRecord;
        } catch {
          body = {};
        }

        try {
          const entries = asArray(body.entry);

          for (const entry of entries) {
            for (const change of asArray(entry.changes)) {
              const field = safeStr(change.field) ?? "unknown";
              const value = asRecord(change.value) ?? {};

              // Sempre registra o evento bruto primeiro.
              await supabaseAdmin.from("webhook_log").insert({
                evento: field,
                provider: "whatsapp_cloud",
                payload: value as never,
                processado: false,
              });

              const contactName = safeStr(
                asRecord(asArray(value.contacts)[0]?.profile)?.name,
              );

              // ---- Aprovação/recusa de templates oficiais ----
              if (field === "message_template_status_update") {
                const metaTemplateId =
                  safeStr(value["message_template_id"]) ??
                  (typeof value["message_template_id"] === "number"
                    ? String(value["message_template_id"])
                    : null);
                const eventName = (safeStr(value["event"]) ?? "").toUpperCase();
                const reason = safeStr(value["reason"]);
                const STATUS_MAP: Record<string, string> = {
                  APPROVED: "approved",
                  REJECTED: "rejected",
                  PAUSED: "paused",
                  DISABLED: "disabled",
                  PENDING: "pending",
                  PENDING_DELETION: "disabled",
                  IN_APPEAL: "pending",
                  FLAGGED: "paused",
                };
                const mapped = STATUS_MAP[eventName];
                if (metaTemplateId && mapped) {
                  const patch: { status: string; rejected_reason?: string | null } = {
                    status: mapped,
                  };
                  if (reason && reason.toUpperCase() !== "NONE") patch.rejected_reason = reason;
                  if (mapped === "approved") patch.rejected_reason = null;
                  try {
                    await supabaseAdmin
                      .from("whatsapp_templates")
                      .update(patch)
                      .eq("meta_template_id", metaTemplateId);
                  } catch {
                    /* evento já registrado em webhook_log */
                  }
                }
              }


              for (const message of asArray(value.messages)) {
                const from = safeStr(message.from);
                const parsed = parseCloudMessage(message);
                const text = parsed.tipo === "text" ? parsed.conteudo : null;

                // Vincula ao contato apenas se ele já existir (nunca cria).
                // Prioridade: telefone principal > telefone secundário.
                const { matchInboundContactId } = await import("@/lib/inbound-contact-match.server");
                const contactId = await matchInboundContactId(from);

                // Mídia: a Cloud API entrega só um media ID — baixamos o arquivo
                // e guardamos no bucket privado `inbox-media`.
                let mediaPath: string | null = null;
                let mediaMime: string | null = null;
                let mediaFilename: string | null = null;
                let mediaSize: number | null = null;
                // Marca quando a mídia existia (a Meta apontou um media_id) mas não foi
                // possível baixá-la/gravá-la mesmo com retry — sem isso, essa mensagem
                // fica indistinguível de uma mensagem que nunca teve mídia nenhuma.
                let mediaDownloadFailedAt: string | null = null;
                const ref = cloudMediaRef(message);
                if (ref) {
                  try {
                    const { downloadCloudMedia } = await import(
                      "@/integrations/whatsapp-cloud/client.server"
                    );
                    // downloadCloudMedia já tenta 2-3x sozinho antes de devolver null.
                    const file = await downloadCloudMedia(ref.id);
                    if (file) {
                      const mime = ref.mime ?? file.mime ?? "application/octet-stream";
                      mediaMime = mime;
                      const ext = (mime.split("/")[1] ?? "bin").split(";")[0];
                      const filename = ref.filename ?? `${ref.tipo}.${ext}`;
                      mediaFilename = filename;
                      mediaSize = file.size;
                      const path = `${contactId ?? "sem-contato"}/${ref.id}-${filename}`;
                      const up = await supabaseAdmin.storage
                        .from("inbox-media")
                        .upload(path, file.bytes, { contentType: mime, upsert: true });
                      if (!up.error) {
                        mediaPath = path;
                      } else {
                        mediaDownloadFailedAt = new Date().toISOString();
                        console.error("[webhook whatsapp-cloud] falha ao subir mídia baixada pro bucket inbox-media", {
                          mediaId: ref.id, tipo: ref.tipo, error: up.error.message,
                        });
                      }
                    } else {
                      mediaDownloadFailedAt = new Date().toISOString();
                      console.error("[webhook whatsapp-cloud] falha definitiva ao baixar mídia recebida (mídia perdida — link de origem da Meta expira rápido)", {
                        mediaId: ref.id, tipo: ref.tipo,
                      });
                    }
                  } catch (e) {
                    mediaDownloadFailedAt = new Date().toISOString();
                    console.error("[webhook whatsapp-cloud] exceção ao baixar/gravar mídia recebida", {
                      mediaId: ref.id, tipo: ref.tipo, error: e instanceof Error ? e.message : String(e),
                    });
                  }
                }

                // A Meta reenvia o mesmo webhook em caso de timeout — upsert por
                // wa_message_id (constraint única no banco) evita duplicar a
                // mensagem no Inbox; se já existir, ignora silenciosamente e
                // segue processando o resto do payload normalmente.
                await supabaseAdmin.from("inbound_messages").upsert(
                  {
                    from_phone: from,
                    from_name: contactName,
                    conteudo: parsed.conteudo,
                    tipo: parsed.tipo,
                    payload: message as never,
                    contact_id: contactId,
                    media_url: null,
                    media_path: mediaPath,
                    media_mime: mediaMime,
                    media_filename: mediaFilename,
                    media_size: mediaSize,
                    media_download_failed_at: mediaDownloadFailedAt,
                    wa_message_id: parsed.wa_message_id,
                    reply_to_wa_id: parsed.reply_to_wa_id,
                    reaction_emoji: parsed.reaction_emoji,
                    reaction_target_wa_id: parsed.reaction_target_wa_id,
                    latitude: parsed.latitude,
                    longitude: parsed.longitude,
                    location_name: parsed.location_name,
                    shared_contacts: (parsed.shared_contacts ?? null) as never,
                    is_system_event: parsed.is_system_event,
                  },
                  { onConflict: "wa_message_id", ignoreDuplicates: true },
                );

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

                // ---- Fluxo de cadastro pelo chat (robô) ----
                // Texto livre, botões e itens de lista alimentam o motor; mídia não.
                const flowText =
                  parsed.tipo === "text" || parsed.tipo === "interactive" || parsed.tipo === "button"
                    ? parsed.conteudo
                    : null;
                if (from && !parsed.is_system_event && !parsed.reaction_emoji) {
                  try {
                    const { handleFlowInbound } = await import("@/lib/whatsapp-flow.server");
                    await handleFlowInbound({
                      admin: supabaseAdmin as never,
                      phone: from,
                      contactId,
                      message,
                      text: flowText,
                      referral: asRecord(message.referral),
                    });
                  } catch (flowError) {
                    const msg = flowError instanceof Error ? flowError.message : String(flowError);
                    await supabaseAdmin.from("webhook_log").insert({
                      evento: "whatsapp_flow:error",
                      provider: "whatsapp_cloud",
                      payload: { phone: from, message: msg } as never,
                      processado: false,
                      erro: msg,
                    });
                  }
                }
              }


              // ---- Status de mensagens enviadas ----
              for (const status of asArray(value.statuses)) {
                const messageId = safeStr(status.id);
                const statusValue = (safeStr(status.status) ?? "").toLowerCase();
                if (!messageId) continue;

                const now = new Date().toISOString();
                const errorRec = asArray(status.errors)[0] ?? null;
                const errorMsg = errorRec
                  ? `${String(errorRec.code ?? "erro")}: ${
                      safeStr(errorRec.title) ?? safeStr(errorRec.message) ?? "falha no envio"
                    }`
                  : null;


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

                if (statusValue === "failed") {
                  rPatch = { status: "failed", failed_at: now, erro: errorMsg };
                  dPatch = { status: "erro", failed_at: now, erro: errorMsg };
                } else if (statusValue === "sent") {
                  rPatch = { status: "sent", sent_at: now };
                  dPatch = { status: "enviado" };
                } else if (statusValue === "delivered") {
                  rPatch = { status: "delivered", delivered_at: now };
                  dPatch = { status: "entregue", delivered_at: now };
                } else if (statusValue === "read") {
                  rPatch = { status: "read", read_at: now };
                  dPatch = { status: "lido", read_at: now };
                }

                // errors[] pode vir anexado a um status.status que já é sent/delivered/read
                // (ex.: aviso de categoria/cobrança de template) — não é falha de entrega de
                // verdade, só um aviso secundário. Não sobrescreve o status real; só loga.
                if (errorMsg && statusValue !== "failed") {
                  console.warn("[webhook whatsapp-cloud] aviso não-fatal anexado ao status", {
                    messageId,
                    statusValue,
                    errorMsg,
                  });
                }

                if (Object.keys(rPatch).length > 0) {
                  try {
                    await supabaseAdmin
                      .from("campaign_recipients")
                      .update(rPatch)
                      .eq("message_id", messageId);
                  } catch {
                    /* status já registrado em webhook_log */
                  }
                }
                if (Object.keys(dPatch).length > 0) {
                  try {
                    await supabaseAdmin
                      .from("direct_messages")
                      .update(dPatch)
                      .eq("message_id", messageId);
                  } catch {
                    /* ignora */
                  }
                }

                // Automação: a Meta pode aceitar o envio na hora (devolve wamid,
                // grava "sent") e só reportar a falha de entrega de verdade depois,
                // de forma assíncrona, por aqui — sem isso o registro fica travado
                // em "sent" mesmo quando a mensagem nunca chegou.
                if (statusValue === "failed") {
                  try {
                    await supabaseAdmin
                      .from("automation_deliveries")
                      .update({ status: "failed", error: errorMsg })
                      .eq("zapi_message_id", messageId)
                      .eq("status", "sent");
                  } catch {
                    /* ignora */
                  }
                }

                const { data: rec } = await supabaseAdmin
                  .from("campaign_recipients")
                  .select("id, contact_id")
                  .eq("message_id", messageId)
                  .maybeSingle();

                await supabaseAdmin.from("message_events").insert({
                  recipient_id: rec?.id ?? null,
                  contact_id: rec?.contact_id ?? null,
                  tipo: `whatsapp_cloud:${statusValue || "unknown"}`,
                  payload: status as never,
                });
              }

              // Marca o log mais recente deste evento como processado.
              const { data: lastLog } = await supabaseAdmin
                .from("webhook_log")
                .select("id")
                .eq("provider", "whatsapp_cloud")
                .eq("evento", field)
                .order("received_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              if (lastLog?.id) {
                await supabaseAdmin
                  .from("webhook_log")
                  .update({ processado: true })
                  .eq("id", lastLog.id);
              }
            }
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          try {
            await supabaseAdmin.from("webhook_log").insert({
              evento: "whatsapp_cloud:error",
              provider: "whatsapp_cloud",
              payload: { message: msg } as never,
              processado: false,
              erro: msg,
            });
          } catch {
            /* nada mais a fazer */
          }
        }

        // Sempre 200 para a Meta não re-tentar.
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
