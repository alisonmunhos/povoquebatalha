import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceIso = since.toISOString();

    // Escopo único do "Total da base": contatos ativos (não arquivados).
    // Usuário do sistema também é um contato e conta junto, por decisão do projeto.
    const base = () =>
      supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .is("arquivado_at", null);

    // Contagens que precisam ver a base inteira (inclusive arquivados).
    const all = () => supabase.from("contacts").select("*", { count: "exact", head: true });

    const nowIso = new Date().toISOString();

    const [
      total,
      novosSemana,
      comConsent,
      optOut,
      arquivados,
      campanhas,
      enviadasSemana,
      semGeo,
      comGeo,
      campDraft,
      campRunning,
      dupRevisar,
    ] = await Promise.all([
      base(),
      base().gte("created_at", sinceIso),
      base().eq("consentimento_whatsapp", true).is("opt_out_at", null),
      all().not("opt_out_at", "is", null),
      all().not("arquivado_at", "is", null),
      supabase.from("campaigns").select("*", { count: "exact", head: true }),
      supabase.from("campaign_recipients").select("*", { count: "exact", head: true })
        .gte("sent_at", sinceIso).in("status", ["sent", "delivered", "read"]),
      base().is("latitude", null),
      base().not("latitude", "is", null),
      supabase.from("campaigns").select("*", { count: "exact", head: true }).eq("status", "draft"),
      supabase.from("campaigns").select("*", { count: "exact", head: true }).eq("status", "running"),
      supabase
        .from("contact_duplicates")
        .select("id", { count: "exact", head: true })
        .eq("status", "pendente")
        .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`),
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
