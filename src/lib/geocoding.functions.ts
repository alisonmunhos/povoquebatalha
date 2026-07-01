import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getGeocodingStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = context.supabase;
    const [total, comCoord, pendente, aproximado, erro, semEndereco] = await Promise.all([
      s.from("contacts").select("*", { count: "exact", head: true }).is("arquivado_at", null),
      s.from("contacts").select("*", { count: "exact", head: true }).is("arquivado_at", null).not("latitude", "is", null),
      s.from("contacts").select("*", { count: "exact", head: true }).is("arquivado_at", null).eq("geocoding_status", "pendente"),
      s.from("contacts").select("*", { count: "exact", head: true }).is("arquivado_at", null).eq("geocoding_status", "aproximado"),
      s.from("contacts").select("*", { count: "exact", head: true }).is("arquivado_at", null).eq("geocoding_status", "erro"),
      s.from("contacts").select("*", { count: "exact", head: true }).is("arquivado_at", null).is("endereco_completo", null),
    ]);
    return {
      total: total.count ?? 0,
      comCoordenada: comCoord.count ?? 0,
      pendente: pendente.count ?? 0,
      aproximado: aproximado.count ?? 0,
      erro: erro.count ?? 0,
      semEndereco: semEndereco.count ?? 0,
    };
  });

const runSchema = z.object({
  ids: z.array(z.string().uuid()).optional(),
  limit: z.number().int().min(1).max(50).default(20),
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
      .is("latitude", null)
      .is("arquivado_at", null)
      .limit(data.limit);
    if (data.ids?.length) q = q.in("id", data.ids);
    else q = q.or("geocoding_status.is.null,geocoding_status.in.(pendente,erro)");

    const { data: rows, error } = await q;
    if (error) throw error;
    const list = rows ?? [];
    let ok = 0, aprox = 0, fail = 0, cached = 0;

    for (const r of list) {
      const key = (r.endereco_completo ?? "").trim();
      if (!key) continue;
      const { data: hit } = await supabaseAdmin
        .from("geocode_cache")
        .select("latitude,longitude,provider,status")
        .eq("endereco_completo", key)
        .maybeSingle();

      let lat: number | null = null, lng: number | null = null, prov: string | null = null, status = "erro";
      if (hit && hit.latitude != null) {
        lat = hit.latitude; lng = hit.longitude; prov = hit.provider; status = hit.status; cached++;
      } else {
        const g = await geocodeAddress({
          endereco: r.endereco, numero: r.numero, bairro: r.bairro,
          cidade: r.cidade, uf: r.uf, cep: r.cep,
        });
        if (g && g.status !== "erro") {
          lat = g.latitude; lng = g.longitude; prov = g.provider;
          status = g.status === "aproximado" ? "aproximado" : "localizado";
        } else {
          status = g ? "erro" : "pendente";
        }
        await supabaseAdmin.from("geocode_cache").upsert({
          endereco_completo: key,
          latitude: lat, longitude: lng, provider: prov, status,
        });
        // Nominatim rate-limit: 1 req/s
        await new Promise((res) => setTimeout(res, 1100));
      }

      await supabaseAdmin.from("contacts").update({
        latitude: lat, longitude: lng,
        geocoding_provider: prov,
        geocoding_status: status as "aproximado" | "erro" | "localizado" | "pendente",
        geocoded_at: new Date().toISOString(),
      }).eq("id", r.id);

      if (status === "localizado") ok++;
      else if (status === "aproximado") aprox++;
      else fail++;
    }

    return { processed: list.length, ok, aprox, fail, cached };
  });
