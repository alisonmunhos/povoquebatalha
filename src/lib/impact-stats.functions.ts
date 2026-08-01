// "Meu Impacto": números agregados para a tela de retrospectiva.
// - getMyImpactStats: o próprio usuário logado.
// - getImpactStatsForUser: staff (admin/vrm/operador) vendo a jornada de um agitador.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ImpactStats } from "@/lib/impact-stats-types";

export type { ImpactStats, WeekStat } from "@/lib/impact-stats-types";

export const getMyImpactStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ImpactStats> => {
    const { computeImpactStats } = await import("@/lib/impact-stats.server");
    return computeImpactStats(context.userId);
  });

export const getImpactStatsForUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ImpactStats> => {
    const { requireStaff } = await import("@/lib/authz");
    await requireStaff(context.supabase, context.userId);
    const { computeImpactStats } = await import("@/lib/impact-stats.server");
    return computeImpactStats(data.userId);
  });
