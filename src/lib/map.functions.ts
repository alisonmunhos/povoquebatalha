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
    const tagMap: Record<string, string[]> = {};
    const lastActionMap: Record<string, { action: string; created_at: string }> = {};
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

      // Última ação de campo por contato (para colorir os pins)
      const { data: logs } = await context.supabase
        .from("territory_contact_logs")
        .select("contact_id,action,created_at")
        .in("contact_id", ids)
        .is("hidden_at", null)
        .in("action", ["contato_realizado", "nao_encontrado", "observacao", "whatsapp_aberto", "pediu_atualizacao"])
        .order("created_at", { ascending: false })
        .limit(10000);
      for (const l of logs ?? []) {
        const cid = (l as { contact_id: string }).contact_id;
        if (!lastActionMap[cid]) {
          lastActionMap[cid] = {
            action: (l as { action: string }).action,
            created_at: (l as { created_at: string }).created_at,
          };
        }
      }
    }
    return {
      rows: (rows ?? []).map((r) => ({
        ...r,
        tags: tagMap[r.id] ?? [],
        last_action: lastActionMap[r.id] ?? null,
      })),
      noScope: false,
    };
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

export const listMapFacets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("contacts")
      .select("cidade,bairro")
      .is("arquivado_at", null)
      .limit(20000);
    if (error) throw error;
    const cidCount = new Map<string, number>();
    const baiCount = new Map<string, number>();
    const baiByCid = new Map<string, Map<string, number>>();
    for (const r of data ?? []) {
      const c = (r.cidade ?? "").trim();
      const b = (r.bairro ?? "").trim();
      if (c) cidCount.set(c, (cidCount.get(c) ?? 0) + 1);
      if (b) baiCount.set(b, (baiCount.get(b) ?? 0) + 1);
      if (c && b) {
        if (!baiByCid.has(c)) baiByCid.set(c, new Map());
        const m = baiByCid.get(c)!;
        m.set(b, (m.get(b) ?? 0) + 1);
      }
    }
    const cmp = (a: [string, number], b: [string, number]) => a[0].localeCompare(b[0], "pt-BR");
    const cidades = [...cidCount.entries()].sort(cmp).map(([value, count]) => ({ value, label: value, count }));
    const bairros = [...baiCount.entries()].sort(cmp).map(([value, count]) => ({ value, label: value, count }));
    const bairrosPorCidade: Record<string, { value: string; label: string; count: number }[]> = {};
    for (const [cid, m] of baiByCid.entries()) {
      bairrosPorCidade[cid] = [...m.entries()].sort(cmp).map(([value, count]) => ({ value, label: value, count }));
    }
    return { cidades, bairros, bairrosPorCidade };
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

