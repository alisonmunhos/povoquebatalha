import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceIso = since.toISOString();

    const [total, novosSemana, comConsent, optOut, campanhas, enviadasSemana] = await Promise.all([
      supabase.from("contacts").select("*", { count: "exact", head: true }),
      supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .gte("created_at", sinceIso),
      supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("consentimento_whatsapp", true)
        .is("opt_out_at", null),
      supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .not("opt_out_at", "is", null),
      supabase.from("campaigns").select("*", { count: "exact", head: true }),
      supabase
        .from("campaign_recipients")
        .select("*", { count: "exact", head: true })
        .gte("sent_at", sinceIso)
        .in("status", ["sent", "delivered", "read"]),
    ]);

    return {
      totalContatos: total.count ?? 0,
      novosNaSemana: novosSemana.count ?? 0,
      comConsentimento: comConsent.count ?? 0,
      optOut: optOut.count ?? 0,
      totalCampanhas: campanhas.count ?? 0,
      enviadasNaSemana: enviadasSemana.count ?? 0,
    };
  });
