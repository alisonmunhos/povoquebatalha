import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { crmFilterSchema, applyCrmFilters, type CrmFilters } from "@/lib/crm-filters";


export const listMapContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => crmFilterSchema.partial().parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("contacts")
      .select("id,nome,phone_e164,bairro,cidade,uf,profissao,tipo_contato,formas_ajuda,consentimento_whatsapp,lifecycle_status,latitude,longitude")
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(5000);
    q = applyCrmFilters(q as never, data as CrmFilters) as typeof q;
    const { data: rows, error } = await q;
    if (error) throw error;


    const ids = (rows ?? []).map((r) => r.id);
    let tagMap: Record<string, string[]> = {};
    if (ids.length) {
      const { data: t } = await context.supabase
        .from("contact_tags")
        .select("contact_id, tags(nome)")
        .in("contact_id", ids);
      for (const row of t ?? []) {
        const cid = (row as { contact_id: string }).contact_id;
        const tg = (row as unknown as { tags: { nome: string } | null }).tags;
        if (!tg) continue;
        (tagMap[cid] ??= []).push(tg.nome);
      }
    }
    return { rows: (rows ?? []).map((r) => ({ ...r, tags: tagMap[r.id] ?? [] })), noScope: false };
  });

export const listUnmappedContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cidade: z.string().optional(), bairro: z.string().optional(), limit: z.number().int().max(500).default(200) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("contacts")
      .select("id,nome,phone_e164,bairro,cidade,uf,endereco_completo,geocoding_status")
      .is("arquivado_at", null)
      .is("latitude", null)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.cidade) q = q.ilike("cidade", `%${data.cidade}%`);
    if (data.bairro) q = q.ilike("bairro", `%${data.bairro}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return { rows: rows ?? [] };
  });

export const getMapContactDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: c, error } = await context.supabase
      .from("contacts")
      .select("id,nome,phone_e164,phone_whatsapp_candidate,bairro,cidade,uf,endereco_completo,profissao,tipo_contato,lifecycle_status,consentimento_whatsapp,opt_out_at,whatsapp_status,formas_ajuda")
      .eq("id", data.id).maybeSingle();
    if (error) throw error;
    if (!c) throw new Error("Contato não encontrado.");

    const { data: tagRows } = await context.supabase
      .from("contact_tags")
      .select("tags(nome)")
      .eq("contact_id", data.id);
    const tags = (tagRows ?? [])
      .map((r: { tags: { nome: string } | { nome: string }[] | null }) => {
        const t = Array.isArray(r.tags) ? r.tags[0] : r.tags;
        return t?.nome ?? null;
      })
      .filter(Boolean) as string[];

    const { data: audit } = await context.supabase
      .from("contact_audit_log")
      .select("action,changes,created_at")
      .eq("contact_id", data.id)
      .order("created_at", { ascending: false })
      .limit(3);

    return { contact: c, tags, timeline: audit ?? [] };
  });

