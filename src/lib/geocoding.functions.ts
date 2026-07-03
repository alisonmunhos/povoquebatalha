import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff } from "@/lib/authz";

export const getGeocodingStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = context.supabase;
    const [total, comCoord, pendente, aproximado, erro, semEndereco, exato, rua, cepPrec, cidadePrec] =
      await Promise.all([
        s.from("contacts").select("*", { count: "exact", head: true }).is("arquivado_at", null),
        s.from("contacts").select("*", { count: "exact", head: true }).is("arquivado_at", null).not("latitude", "is", null),
        s.from("contacts").select("*", { count: "exact", head: true }).is("arquivado_at", null).eq("geocoding_status", "pendente"),
        s.from("contacts").select("*", { count: "exact", head: true }).is("arquivado_at", null).eq("geocoding_status", "aproximado"),
        s.from("contacts").select("*", { count: "exact", head: true }).is("arquivado_at", null).eq("geocoding_status", "erro"),
        s.from("contacts").select("*", { count: "exact", head: true }).is("arquivado_at", null).is("endereco_completo", null),
        s.from("contacts").select("*", { count: "exact", head: true }).is("arquivado_at", null).eq("geocoding_precision", "exato"),
        s.from("contacts").select("*", { count: "exact", head: true }).is("arquivado_at", null).eq("geocoding_precision", "rua"),
        s.from("contacts").select("*", { count: "exact", head: true }).is("arquivado_at", null).eq("geocoding_precision", "cep"),
        s.from("contacts").select("*", { count: "exact", head: true }).is("arquivado_at", null).eq("geocoding_precision", "cidade"),
      ]);
    return {
      total: total.count ?? 0,
      comCoordenada: comCoord.count ?? 0,
      pendente: pendente.count ?? 0,
      aproximado: aproximado.count ?? 0,
      erro: erro.count ?? 0,
      semEndereco: semEndereco.count ?? 0,
      exato: exato.count ?? 0,
      rua: rua.count ?? 0,
      cep: cepPrec.count ?? 0,
      cidade: cidadePrec.count ?? 0,
    };
  });

const runSchema = z.object({
  ids: z.array(z.string().uuid()).optional(),
  limit: z.number().int().min(1).max(50).default(20),
  onlyImprecise: z.boolean().optional(),
});

export const runGeocodingBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => runSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { geocodeAddress } = await import("@/lib/cep.server");

    let q = supabaseAdmin
      .from("contacts")
      .select("id,endereco,numero,complemento,bairro,cidade,uf,cep,endereco_completo")
      .not("endereco_completo", "is", null)
      .is("arquivado_at", null)
      .limit(data.limit);
    if (data.ids?.length) {
      q = q.in("id", data.ids);
    } else if (data.onlyImprecise) {
      // Endereços completos que ficaram imprecisos: sem lat/lng OU precisão inferior a "rua"
      q = q.or("latitude.is.null,geocoding_precision.is.null,geocoding_precision.in.(cep,cidade)");
    } else {
      q = q.is("latitude", null).or("geocoding_status.is.null,geocoding_status.in.(pendente,erro)");
    }

    const { data: rows, error } = await q;
    if (error) throw error;
    const list = rows ?? [];
    let ok = 0, aprox = 0, fail = 0, cached = 0;

    for (const r of list) {
      const key = (r.endereco_completo ?? "").trim();
      if (!key) continue;
      const { data: hit } = await supabaseAdmin
        .from("geocode_cache")
        .select("latitude,longitude,provider,status,geocoding_precision,geocoding_match_score")
        .eq("endereco_completo", key)
        .maybeSingle();

      let lat: number | null = null;
      let lng: number | null = null;
      let prov: string | null = null;
      let status = "erro";
      let precision: "exato" | "rua" | "cep" | "cidade" | null = null;
      let matchScore: number | null = null;

      const cacheUsable = hit && hit.latitude != null && hit.geocoding_precision === "exato";
      if (cacheUsable) {
        lat = hit!.latitude; lng = hit!.longitude; prov = hit!.provider; status = hit!.status;
        precision = hit!.geocoding_precision as typeof precision;
        matchScore = hit!.geocoding_match_score ?? 1;
        cached++;
      } else {
        const g = await geocodeAddress({
          endereco: r.endereco, numero: r.numero, bairro: r.bairro,
          cidade: r.cidade, uf: r.uf, cep: r.cep,
        });
        if (g && g.status !== "erro") {
          lat = g.latitude; lng = g.longitude; prov = g.provider;
          status = g.status === "aproximado" ? "aproximado" : "localizado";
          precision = g.precision;
          matchScore = g.match_score;
        } else {
          status = g ? "erro" : "pendente";
        }
        await supabaseAdmin.from("geocode_cache").upsert({
          endereco_completo: key,
          latitude: lat, longitude: lng, provider: prov, status,
          geocoding_precision: precision,
          geocoding_match_score: matchScore,
        });
        // Nominatim rate-limit: 1 req/s
        await new Promise((res) => setTimeout(res, 1100));
      }

      await supabaseAdmin.from("contacts").update({
        latitude: lat, longitude: lng,
        geocoding_provider: prov,
        geocoding_status: status as "aproximado" | "erro" | "localizado" | "pendente",
        geocoding_precision: precision,
        geocoding_match_score: matchScore,
        geocoded_at: new Date().toISOString(),
      }).eq("id", r.id);

      if (precision === "exato") ok++;
      else if (status === "aproximado" || status === "localizado") aprox++;
      else fail++;
    }

    return { processed: list.length, ok, aprox, fail, cached };
  });

// Re-geocodifica um único contato (força re-tentativa ignorando cache imprecisa).
export const regeocodeOne = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { geocodeAddress } = await import("@/lib/cep.server");

    const { data: r, error } = await context.supabase
      .from("contacts")
      .select("id,endereco,numero,bairro,cidade,uf,cep,endereco_completo")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!r) throw new Error("Contato não encontrado.");
    if (!r.endereco_completo) throw new Error("Contato sem endereço.");

    const g = await geocodeAddress({
      endereco: r.endereco, numero: r.numero, bairro: r.bairro,
      cidade: r.cidade, uf: r.uf, cep: r.cep,
    });

    let lat: number | null = null, lng: number | null = null;
    let prov: string | null = null, status = "erro";
    let precision: "exato" | "rua" | "cep" | "cidade" | null = null;
    let matchScore: number | null = null;
    if (g && g.status !== "erro") {
      lat = g.latitude; lng = g.longitude; prov = g.provider;
      status = g.status === "aproximado" ? "aproximado" : "localizado";
      precision = g.precision;
      matchScore = g.match_score;
    }

    // Refresh do cache também
    await supabaseAdmin.from("geocode_cache").upsert({
      endereco_completo: r.endereco_completo,
      latitude: lat, longitude: lng, provider: prov, status,
      geocoding_precision: precision,
      geocoding_match_score: matchScore,
    });

    await supabaseAdmin.from("contacts").update({
      latitude: lat, longitude: lng,
      geocoding_provider: prov,
      geocoding_status: status as "aproximado" | "erro" | "localizado" | "pendente",
      geocoding_precision: precision,
      geocoding_match_score: matchScore,
      geocoded_at: new Date().toISOString(),
    }).eq("id", data.id);

    return { ok: precision === "exato", precision, provider: prov, status };
  });
