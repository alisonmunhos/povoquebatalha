import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { crmFilterSchema, applyCrmFilters, type CrmFilters } from "@/lib/crm-filters";

// ===== Listagem rica do CRM (substitui partes da listContacts) =====
const listSchema = z.object({
  filters: crmFilterSchema.partial().default({}),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  sort: z.enum(["recent", "name"]).default("recent"),
});

export const listContactsRich = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    let q = context.supabase
      .from("contacts")
      .select(
        "id,nome,phone_e164,phone_status,whatsapp_status,cidade,bairro,uf,origem,origem_detalhe,consentimento_whatsapp,opt_out_at,arquivado_at,lifecycle_status,tipo_contato,coletivo_alicerce,profissao,email,created_at",
        { count: "exact" },
      )
      .range(from, to);
    if (data.sort === "name") q = q.order("nome", { ascending: true });
    else q = q.order("created_at", { ascending: false });
    q = applyCrmFilters(q as never, data.filters as CrmFilters);

    if (data.filters.tag_ids?.length) {
      const { data: rels } = await context.supabase
        .from("contact_tags")
        .select("contact_id")
        .in("tag_id", data.filters.tag_ids);
      const ids = Array.from(new Set((rels ?? []).map((r) => r.contact_id)));
      if (!ids.length) return { rows: [], total: 0, page: data.page, pageSize: data.pageSize };
      q = q.in("id", ids);
    }
    // Histórico por campanha
    async function idsForCampaign(campaignId: string, statuses?: string[]) {
      let qr = context.supabase.from("campaign_recipients").select("contact_id").eq("campaign_id", campaignId);
      if (statuses?.length) qr = qr.in("status", statuses as never[]);
      const { data: r } = await qr.limit(20000);
      return Array.from(new Set((r ?? []).map((x) => x.contact_id)));
    }
    if (data.filters.recebeu_campanha_id) {
      const ids = await idsForCampaign(data.filters.recebeu_campanha_id, ["sent","delivered","read"]);
      if (!ids.length) return { rows: [], total: 0, page: data.page, pageSize: data.pageSize };
      q = q.in("id", ids);
    }
    if (data.filters.nao_recebeu_campanha_id) {
      const ids = await idsForCampaign(data.filters.nao_recebeu_campanha_id, ["sent","delivered","read"]);
      if (ids.length) q = q.not("id", "in", `(${ids.map((v) => `"${v}"`).join(",")})`);
    }
    if (data.filters.erro_campanha_id) {
      const ids = await idsForCampaign(data.filters.erro_campanha_id, ["failed"]);
      if (!ids.length) return { rows: [], total: 0, page: data.page, pageSize: data.pageSize };
      q = q.in("id", ids);
    }

    const { data: rows, count, error } = await q;
    if (error) throw error;

    // Tags por contato
    const ids = (rows ?? []).map((r) => r.id);
    let tagMap: Record<string, Array<{ id: string; nome: string; cor: string }>> = {};
    if (ids.length) {
      const { data: rels } = await context.supabase
        .from("contact_tags")
        .select("contact_id, tags(id,nome,cor)")
        .in("contact_id", ids);
      tagMap = (rels ?? []).reduce<typeof tagMap>((acc, r) => {
        const t = r.tags as { id: string; nome: string; cor: string } | null;
        if (!t) return acc;
        (acc[r.contact_id] ??= []).push(t);
        return acc;
      }, {});
    }

    return {
      rows: (rows ?? []).map((r) => ({ ...r, tags: tagMap[r.id] ?? [] })),
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

// ===== IDs por filtro (selecionar tudo do filtro / export) =====
export const idsByFilter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ filters: crmFilterSchema.partial().default({}), max: z.number().int().min(1).max(10000).default(5000) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("contacts").select("id").limit(data.max);
    q = applyCrmFilters(q as never, data.filters as CrmFilters);
    if (data.filters.tag_ids?.length) {
      const { data: rels } = await context.supabase
        .from("contact_tags")
        .select("contact_id")
        .in("tag_id", data.filters.tag_ids);
      const ids = Array.from(new Set((rels ?? []).map((r) => r.contact_id)));
      if (!ids.length) return { ids: [] as string[] };
      q = q.in("id", ids);
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return { ids: (rows ?? []).map((r) => r.id) };
  });

// ===== Ações em massa =====
const idsInput = z.object({ ids: z.array(z.string().uuid()).min(1).max(5000) });

export const bulkApplyTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idsInput.extend({ tag_id: z.string().uuid(), add: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    if (data.add) {
      const rows = data.ids.map((cid) => ({ contact_id: cid, tag_id: data.tag_id }));
      await context.supabase.from("contact_tags").upsert(rows, { onConflict: "contact_id,tag_id" });
    } else {
      await context.supabase.from("contact_tags").delete().in("contact_id", data.ids).eq("tag_id", data.tag_id);
    }
    return { ok: true as const, affected: data.ids.length };
  });

export const bulkArchive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idsInput.extend({ archived: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("contacts")
      .update({ arquivado_at: data.archived ? new Date().toISOString() : null })
      .in("id", data.ids);
    return { ok: true as const, affected: data.ids.length };
  });

export const bulkOptOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idsInput.extend({ optOut: z.boolean(), motivo: z.string().max(240).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const upd: Record<string, unknown> = {
      opt_out_at: data.optOut ? new Date().toISOString() : null,
      opt_out_motivo: data.optOut ? (data.motivo ?? null) : null,
    };
    if (data.optOut) upd.lifecycle_status = "nao_enviar";
    await context.supabase.from("contacts").update(upd as never).in("id", data.ids);
    return { ok: true as const, affected: data.ids.length };
  });

export const bulkSetLifecycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idsInput.extend({ lifecycle_status: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("contacts")
      .update({ lifecycle_status: data.lifecycle_status as never })
      .in("id", data.ids);
    return { ok: true as const, affected: data.ids.length };
  });

// ===== Exportação CSV (UTF-8 com BOM) =====
const CSV_COLS: Array<{ key: string; label: string }> = [
  { key: "nome", label: "Nome" },
  { key: "phone_raw", label: "Telefone Original" },
  { key: "phone_e164", label: "Telefone Normalizado" },
  { key: "email", label: "E-mail" },
  { key: "cidade", label: "Cidade" },
  { key: "bairro", label: "Bairro" },
  { key: "uf", label: "UF" },
  { key: "profissao", label: "Profissão" },
  { key: "tipo_contato", label: "Tipo Contato" },
  { key: "tags_concat", label: "Tags" },
  { key: "lifecycle_status", label: "Lifecycle" },
  { key: "phone_status", label: "Status Telefone" },
  { key: "whatsapp_status", label: "Status WhatsApp" },
  { key: "consentimento_whatsapp", label: "Consentimento" },
  { key: "opt_out_at", label: "Opt-out" },
  { key: "origem", label: "Origem" },
  { key: "origem_detalhe", label: "Origem Detalhe" },
];

function csvEsc(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "boolean" ? (v ? "sim" : "nao") : String(v);
  if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const exportContactsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1).max(10000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("contacts")
      .select(
        "id,nome,phone_raw,phone_e164,email,cidade,bairro,uf,profissao,tipo_contato,lifecycle_status,phone_status,whatsapp_status,consentimento_whatsapp,opt_out_at,origem,origem_detalhe",
      )
      .in("id", data.ids);
    const { data: rels } = await context.supabase
      .from("contact_tags")
      .select("contact_id, tags(nome)")
      .in("contact_id", data.ids);
    const tagMap: Record<string, string[]> = {};
    for (const r of rels ?? []) {
      const n = (r.tags as { nome: string } | null)?.nome;
      if (n) (tagMap[r.contact_id] ??= []).push(n);
    }
    const header = CSV_COLS.map((c) => csvEsc(c.label)).join(";");
    const lines = (rows ?? []).map((row) => {
      const tags_concat = (tagMap[row.id] ?? []).join("|");
      const fullRow: Record<string, unknown> = { ...row, tags_concat };
      return CSV_COLS.map((c) => csvEsc(fullRow[c.key])).join(";");
    });
    const csv = "\uFEFF" + [header, ...lines].join("\r\n");
    return { csv, count: rows?.length ?? 0 };
  });
