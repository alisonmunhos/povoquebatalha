// Cron endpoint: avisa quem tem contatos parados (1h) e devolve para a fila (2h).
// Autenticação: header `x-cron-secret` (CRON_SECRET) ou `apikey` (chave pública).
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const Route = createFileRoute("/api/public/jobs/release-stalled-missions")({
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

        let body: { warn_after_hours?: number; release_after_hours?: number } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { releaseStalledMissionTasks } = await import("@/lib/mission-release.server");
          const r = await releaseStalledMissionTasks(supabaseAdmin as never, {
            warnAfterHours:
              typeof body.warn_after_hours === "number" ? body.warn_after_hours : undefined,
            releaseAfterHours:
              typeof body.release_after_hours === "number" ? body.release_after_hours : undefined,
          });
          return Response.json({ ok: true, ...r });
        } catch (e) {
          console.error("[cron] release-stalled-missions", e);
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : "erro" },
            { status: 500 },
          );
        }
      },
    },
  },
});
