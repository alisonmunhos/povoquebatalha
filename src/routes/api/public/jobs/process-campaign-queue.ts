// Cron endpoint: processa 1 lote de cada campanha em envio (status = 'running').
// Chamado pelo pg_cron a cada minuto. Autenticação via header `apikey` (anon key).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/jobs/process-campaign-queue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!apikey || apikey !== expected) {
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
