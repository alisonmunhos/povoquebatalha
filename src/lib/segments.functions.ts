import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { crmFilterSchema, applyCrmFilters, type CrmFilters } from "@/lib/crm-filters";

const segmentSchema = z.object({
  nome: z.string().trim().min(1).max(120),
  descricao: z.string().trim().max(400).nullable().optional(),
  tipo: z.enum(["dinamico", "estatico"]).default("dinamico"),
  filtro: crmFilterSchema.partial().optional(),
  member_ids: z.array(z.string().uuid()).optional(),
});

export const listSegments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("segments")
      .select("id,nome,descricao,tipo,filtro,member_ids,created_at,updated_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { rows: data ?? [] };
  });

export const upsertSegment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid().optional() }).and(segmentSchema).parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...payload } = data;
    const row = {
      nome: payload.nome,
      descricao: payload.descricao ?? null,
      tipo: payload.tipo,
      filtro: (payload.filtro ?? {}) as never,
      member_ids: payload.tipo === "estatico" ? (payload.member_ids ?? []) : [],
      created_by: context.userId,
    };
    if (id) {
      const { error } = await context.supabase.from("segments").update(row).eq("id", id);
      if (error) throw error;
      return { id };
    }
    const { data: ins, error } = await context.supabase.from("segments").insert(row).select("id").single();
    if (error) throw error;
    return { id: ins.id };
  });

export const deleteSegment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: usadas } = await context.supabase
      .from("campaigns")
      .select("nome")
      .eq("segment_id", data.id)
      .limit(5);

    if (usadas?.length) {
      const nomes = usadas.map((c: { nome: string }) => c.nome).join(", ");
      throw new Error(
        `Este segmento está sendo usado em ${usadas.length} campanha(s) (${nomes}). Exclua ou troque o público dessas campanhas antes de remover o segmento.`,
      );
    }

    const { error } = await context.supabase.from("segments").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });


export const countSegment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: seg } = await context.supabase.from("segments").select("tipo,filtro,member_ids").eq("id", data.id).single();
    if (!seg) return { total: 0 };
    if (seg.tipo === "estatico") return { total: (seg.member_ids as string[] | null)?.length ?? 0 };
    const filtro = (seg.filtro ?? {}) as CrmFilters;
    let q = context.supabase.from("contacts").select("id", { count: "exact", head: true });
    q = applyCrmFilters(q as never, filtro) as typeof q;
    if (filtro.tag_ids?.length) {
      const { data: rels } = await context.supabase
        .from("contact_tags")
        .select("contact_id")
        .in("tag_id", filtro.tag_ids as string[]);
      const ids = Array.from(new Set((rels ?? []).map((r: { contact_id: string }) => r.contact_id)));
      if (!ids.length) return { total: 0 };
      q = q.in("id", ids);
    }
    const { count } = await q;
    return { total: count ?? 0 };
  });
