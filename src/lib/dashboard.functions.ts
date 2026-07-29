import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceIso = since.toISOString();

    // Escopo único: todo indicador de pessoas exclui arquivados e usuários do sistema.
    const base = () =>
      supabase.from("contacts").select("*", { count: "exact", head: true })
        .is("arquivado_at", null).eq("is_system_user", false);

    const [total, novosSemana, comConsent, optOut, campanhas, enviadasSemana, semGeo, comGeo, campDraft, campRunning] = await Promise.all([
      base(),
      base().gte("created_at", sinceIso),
      base().eq("consentimento_whatsapp", true).is("opt_out_at", null),
      base().not("opt_out_at", "is", null),
      supabase.from("campaigns").select("*", { count: "exact", head: true }),
      supabase.from("campaign_recipients").select("*", { count: "exact", head: true })
        .gte("sent_at", sinceIso).in("status", ["sent", "delivered", "read"]),
      base().is("latitude", null),
      base().not("latitude", "is", null),
      supabase.from("campaigns").select("*", { count: "exact", head: true }).eq("status", "draft"),
      supabase.from("campaigns").select("*", { count: "exact", head: true }).eq("status", "running"),
    ]);


    return {
      totalContatos: total.count ?? 0,
      novosNaSemana: novosSemana.count ?? 0,
      comConsentimento: comConsent.count ?? 0,
      optOut: optOut.count ?? 0,
      totalCampanhas: campanhas.count ?? 0,
      enviadasNaSemana: enviadasSemana.count ?? 0,
      semGeolocalizacao: semGeo.count ?? 0,
      comGeolocalizacao: comGeo.count ?? 0,
      campanhasRascunho: campDraft.count ?? 0,
      campanhasEmEnvio: campRunning.count ?? 0,
    };
  });
