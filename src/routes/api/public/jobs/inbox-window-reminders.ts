// Cron endpoint: avisos da janela de 24h do WhatsApp no Inbox.
// (a) alerta ao responsável quando a janela de uma conversa dele está a ~4h
//     de fechar; (b) resumo diário de janelas abertas/expirando para quem
//     tem acesso ao Inbox (o resumo já se protege sozinho contra rodar mais
//     de uma vez por dia, então é seguro chamar este job com frequência).
// Autenticação: header `x-cron-secret` (CRON_SECRET) ou `apikey` (chave pública).
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const Route = createFileRoute("/api/public/jobs/inbox-window-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expectedSecret = process.env["CRON_SECRET"] ?? "";
        const providedSecret = request.headers.get("x-cron-secret") ?? "";
        const expectedKey =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ??
          process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
          "";
        const providedKey = request.headers.get("apikey") ?? "";
        const okSecret =
          !!expectedSecret && !!providedSecret && safeEqual(providedSecret, expectedSecret);
        const okKey = !!expectedKey && !!providedKey && safeEqual(providedKey, expectedKey);
        if (!okSecret && !okKey) return new Response("Unauthorized", { status: 401 });

        let body: { mode?: "expiring" | "daily_summary" | "both" } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }
        const mode = body.mode ?? "both";

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { warnExpiringWindows, sendDailyWindowSummary } = await import(
            "@/lib/inbox-window-notify.server"
          );

          const result: {
            expiring?: Awaited<ReturnType<typeof warnExpiringWindows>>;
            daily_summary?: Awaited<ReturnType<typeof sendDailyWindowSummary>>;
          } = {};
          if (mode === "expiring" || mode === "both") {
            result.expiring = await warnExpiringWindows(supabaseAdmin as never);
          }
          if (mode === "daily_summary" || mode === "both") {
            result.daily_summary = await sendDailyWindowSummary(supabaseAdmin as never);
          }
          return Response.json({ ok: true, ...result });
        } catch (e) {
          console.error("[cron] inbox-window-reminders", e);
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : "erro" },
            { status: 500 },
          );
        }
      },
    },
  },
});
