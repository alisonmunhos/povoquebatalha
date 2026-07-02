// Universal Z-API webhook receiver. Configure in Z-API painel pointing to
// /api/public/zapi/{evento}?token=ZAPI_WEBHOOK_SECRET where evento is one of:
//   on-send | on-delivery | on-read | on-receive | on-connect | on-disconnect | on-message-status
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

type AnyRecord = Record<string, unknown>;

function safeStr(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function safeBool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function pickPhone(payload: AnyRecord): string | null {
  return (
    safeStr(payload.phone) ??
    safeStr(payload.from) ??
    safeStr((payload.sender as AnyRecord | undefined)?.phone) ??
    null
  );
}
function pickZaapId(payload: AnyRecord): string | null {
  return safeStr(payload.zaapId) ?? safeStr(payload.id) ?? null;
}
function pickMessageId(payload: AnyRecord): string | null {
  return safeStr(payload.messageId) ?? safeStr(payload.ids) ?? null;
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
            // Só cria conversa/inbound se a instância tiver o toggle ligado.
            const { data: inst } = await supabaseAdmin
              .from("whatsapp_instances")
              .select("inbound_to_inbox_enabled")
              .eq("provider", "zapi")
              .maybeSingle();
            const inboundEnabled = inst?.inbound_to_inbox_enabled === true;

            if (inboundEnabled) {
              const phone = pickPhone(body);
              const senderName =
                safeStr(body.senderName) ?? safeStr(body.chatName) ?? safeStr(body.notifyName);
              const text =
                safeStr((body.text as AnyRecord | undefined)?.message) ??
                safeStr((body.message as AnyRecord | undefined)?.text) ??
                safeStr(body.text) ??
                safeStr(body.message) ??
                null;

              // Busca contato existente pelos últimos 8 dígitos; se não achar, cria.
              let contactId: string | null = null;
              if (phone) {
                const digits = phone.replace(/\D+/g, "");
                const last8 = digits.length >= 8 ? digits.slice(-8) : null;
                if (last8) {
                  const { data: c } = await supabaseAdmin
                    .from("contacts")
                    .select("id")
                    .eq("phone_last8", last8)
                    .maybeSingle();
                  contactId = c?.id ?? null;
                }
                if (!contactId) {
                  const { data: novo } = await supabaseAdmin
                    .from("contacts")
                    .insert({
                      nome: senderName ?? `WhatsApp ${digits.slice(-4)}`,
                      phone_raw: phone,
                      origem: "inbound_whatsapp",
                      consentimento_whatsapp: true,
                    })
                    .select("id")
                    .maybeSingle();
                  contactId = novo?.id ?? null;
                }
              }
              await supabaseAdmin.from("inbound_messages").insert({
                from_phone: phone,
                from_name: senderName,
                conteudo: text,
                tipo: safeStr(body.type) ?? "text",
                payload: body as never,
                contact_id: contactId,
              });
              // Opt-out via palavra-chave
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
            // Se o toggle estiver desligado, ignoramos silenciosamente (webhook_log guarda auditoria).

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
              let patch: RecipientPatch = {};
              if (evento === "on-send" || status === "sent" || status === "sent-by-server") {
                patch = { status: "sent", sent_at: now };
              } else if (evento === "on-delivery" || status === "received" || status === "delivered") {
                patch = { status: "delivered", delivered_at: now };
              } else if (evento === "on-read" || status === "read") {
                patch = { status: "read", read_at: now };
              } else if (status === "failed" || safeBool(body.error)) {
                patch = { status: "failed", failed_at: now, erro: safeStr(body.error) };
              }
              if (Object.keys(patch).length > 0) {
                let q = supabaseAdmin.from("campaign_recipients").update(patch);
                if (zaapId) q = q.eq("zaap_id", zaapId);
                else if (messageId) q = q.eq("message_id", messageId);
                await q;
              }
              // Always record the event
              const { data: rec } = await supabaseAdmin
                .from("campaign_recipients")
                .select("id, contact_id")
                .or([zaapId ? `zaap_id.eq.${zaapId}` : null, messageId ? `message_id.eq.${messageId}` : null]
                  .filter(Boolean)
                  .join(","))
                .maybeSingle();
              await supabaseAdmin.from("message_events").insert({
                recipient_id: rec?.id ?? null,
                contact_id: rec?.contact_id ?? null,
                tipo: evento,
                payload: body as never,
              });
            }
          }

          // Mark log as processed
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
