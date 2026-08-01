// Cron endpoint: envia a conquista da semana (notificação roxa) no sábado.
// Autenticação: header `x-cron-secret` comparado ao segredo `CRON_SECRET`.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const Route = createFileRoute("/api/public/jobs/weekly-impact")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Aceita o segredo do cron (x-cron-secret) ou a chave pública do projeto
        // no header `apikey` — padrão usado pelos jobs agendados no banco.
        const expectedSecret = process.env["CRON_SECRET"] ?? "";
        const providedSecret = request.headers.get("x-cron-secret") ?? "";
        const expectedKey =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "";
        const providedKey = request.headers.get("apikey") ?? "";
        const okSecret = !!expectedSecret && !!providedSecret && safeEqual(providedSecret, expectedSecret);
        const okKey = !!expectedKey && !!providedKey && safeEqual(providedKey, expectedKey);
        if (!okSecret && !okKey) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: { user_ids?: string[]; force?: boolean; only_active?: boolean } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }

        try {
          const { sendWeeklyImpactNotifications } = await import("@/lib/weekly-impact.server");
          const r = await sendWeeklyImpactNotifications({
            userIds: Array.isArray(body.user_ids) ? body.user_ids : undefined,
            force: body.force === true,
            onlyActive: body.only_active === true,
          });
          return Response.json({ ok: true, ...r });
        } catch (e) {
          console.error("[cron] weekly-impact", e);
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : "erro" },
            { status: 500 },
          );
        }
      },
    },
  },
});
