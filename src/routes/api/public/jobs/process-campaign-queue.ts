// Cron endpoint: processa 1 lote de cada campanha em envio (status = 'running').
// Chamado pelo pg_cron a cada minuto. Autenticação: header `x-cron-secret`
// comparado ao segredo `CRON_SECRET` via timingSafeEqual.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const Route = createFileRoute("/api/public/jobs/process-campaign-queue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_SECRET ?? "";
        const provided = request.headers.get("x-cron-secret") ?? "";
        if (!expected || !provided || !safeEqual(provided, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: running, error } = await supabaseAdmin
          .from("campaigns")
          .select("id")
          .eq("status", "running")
          .limit(20);
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }

        const { processCampaignBatchInternal } = await import("@/lib/campaigns.server");
        const results: Array<{ id: string; processed: number; ok: number; fail: number; done: boolean }> = [];
        for (const c of running ?? []) {
          try {
            const r = await processCampaignBatchInternal(c.id, 5);
            results.push({ id: c.id, ...r });
          } catch (e) {
            results.push({ id: c.id, processed: 0, ok: 0, fail: 0, done: false });
            console.error("[cron] batch error", c.id, e);
          }
        }
        return new Response(JSON.stringify({ ok: true, campaigns: results.length, results }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
