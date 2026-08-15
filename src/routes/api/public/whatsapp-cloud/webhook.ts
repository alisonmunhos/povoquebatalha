// Receptor de webhook da WhatsApp Cloud API (Meta). Peça ADITIVA: não substitui
// nem altera o fluxo da Z-API (/api/public/zapi/$evento).
//
// Configurar no painel da Meta:
//   Callback URL: https://<dominio>/api/public/whatsapp-cloud/webhook
//   Verify token: valor do secret META_WEBHOOK_VERIFY_TOKEN
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

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
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let body: AnyRecord = {};
        try {
          body = (await request.json()) as AnyRecord;
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

              // ---- Mensagens recebidas ----
              for (const message of asArray(value.messages)) {
                const from = safeStr(message.from);
                const tipo = safeStr(message.type) ?? "text";
                const text = safeStr(asRecord(message.text)?.body);

                // Vincula ao contato apenas se ele já existir (nunca cria).
                let contactId: string | null = null;
                if (from) {
                  const digits = from.replace(/\D+/g, "");
                  const last8 = digits.length >= 8 ? digits.slice(-8) : null;
                  if (last8) {
                    const { data: c } = await supabaseAdmin
                      .from("contacts")
                      .select("id")
                      .or(`phone_last8.eq.${last8},phone_secundario_last8.eq.${last8}`)
                      .limit(1)
                      .maybeSingle();
                    contactId = c?.id ?? null;
                  }
                }

                await supabaseAdmin.from("inbound_messages").insert({
                  from_phone: from,
                  from_name: contactName,
                  conteudo: text,
                  tipo,
                  payload: message as never,
                  contact_id: contactId,
                  // Mídia da Cloud API vem como media ID e exige download
                  // autenticado — fica para uma etapa posterior.
                  media_url: null,
                  media_mime: null,
                  media_filename: null,
                  media_size: null,
                });

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

                if (statusValue === "failed" || errorMsg) {
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
