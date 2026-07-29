import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  crmFilterSchema,
  applyCrmFilters,
  resolveContactIdsForTagFilter,
  fetchAllPaged,
  paginateWithAllowedIds,
  INLINE_ID_LIMIT,
  type CrmFilters,
} from "@/lib/crm-filters";
import type { Database } from "@/integrations/supabase/types";

type ContactRow = Database["public"]["Tables"]["contacts"]["Row"];
type ContactRichRow = Pick<
  ContactRow,
  | "id" | "nome" | "phone_raw" | "phone_e164" | "phone_status" | "whatsapp_status" | "cidade" | "bairro" | "uf"
  | "origem" | "origem_detalhe" | "consentimento_whatsapp" | "opt_out_at" | "arquivado_at" | "lifecycle_status"
  | "tipo_contato" | "coletivo_alicerce" | "profissao" | "email" | "created_at"
>;

// ===== Listagem rica do CRM (substitui partes da listContacts) =====
const listSchema = z.object({
  filters: crmFilterSchema.partial().default({}),
  page: z.number().int().min(1).default(1),
  // Teto de segurança pra opção "Todos" da tela — cobre a base atual (~1200
  // contatos) com folga; se a base crescer muito além disso, essa opção
  // simplesmente para de aparecer na UI (ver contatos.index.tsx).
  pageSize: z.number().int().min(1).max(2000).default(25),
  sort: z.enum(["recent", "name", "name-desc"]).default("recent"),
});

const CONTACT_LIST_COLS =
  "id,nome,phone_raw,phone_e164,phone_status,whatsapp_status,cidade,bairro,uf,origem,origem_detalhe,consentimento_whatsapp,opt_out_at,arquivado_at,lifecycle_status,tipo_contato,coletivo_alicerce,profissao,email,created_at";

export const listContactsRich = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const empty = { rows: [] as never[], total: 0, page: data.page, pageSize: data.pageSize };

    // --- Restrições que dependem de consultas auxiliares (resolvidas antes) ---
    let allowedIds: string[] | null = null;
    if (data.filters.tag_ids?.length) {
      const { ids, noMatch } = await resolveContactIdsForTagFilter(context.supabase, data.filters.tag_ids);
      if (noMatch) return empty;
      if (ids?.length) allowedIds = ids;
    }

    async function idsForCampaign(campaignId: string, statuses?: string[]) {
      const rows = await fetchAllPaged<{ contact_id: string }>(() => {
        let qr = context.supabase.from("campaign_recipients").select("contact_id").eq("campaign_id", campaignId);
        if (statuses?.length) qr = qr.in("status", statuses as never[]);
        return qr as never;
      });
      return Array.from(new Set(rows.map((x) => x.contact_id)));
    }
    async function idsForTemplate(templateId: string) {
      const rows = await fetchAllPaged<{ contact_id: string }>(() =>
        context.supabase
          .from("automation_deliveries")
          .select("contact_id")
          .eq("template_id", templateId)
          .eq("status", "sent") as never,
      );
      return Array.from(new Set(rows.map((x) => x.contact_id)));
    }

    const excludeIds: string[] = [];
    function intersectAllowed(ids: string[]) {
      allowedIds = allowedIds ? allowedIds.filter((id) => ids.includes(id)) : ids;
    }

    if (data.filters.recebeu_campanha_id) {
      const ids = await idsForCampaign(data.filters.recebeu_campanha_id, ["sent", "delivered", "read"]);
      if (!ids.length) return empty;
      intersectAllowed(ids);
    }
    if (data.filters.nao_recebeu_campanha_id) {
      excludeIds.push(...(await idsForCampaign(data.filters.nao_recebeu_campanha_id, ["sent", "delivered", "read"])));
    }
    if (data.filters.erro_campanha_id) {
      const ids = await idsForCampaign(data.filters.erro_campanha_id, ["failed"]);
      if (!ids.length) return empty;
      intersectAllowed(ids);
    }
    if (data.filters.recebeu_template_id) {
      const ids = await idsForTemplate(data.filters.recebeu_template_id);
      if (!ids.length) return empty;
      intersectAllowed(ids);
    }
    if (data.filters.nao_recebeu_template_id) {
      excludeIds.push(...(await idsForTemplate(data.filters.nao_recebeu_template_id)));
    }
    if (allowedIds && !allowedIds.length) return empty;

    const excludeSet = new Set(excludeIds);

    function buildQuery(cols: string, withCount: boolean) {
      let q = withCount
        ? context.supabase.from("contacts").select(cols, { count: "exact" })
        : context.supabase.from("contacts").select(cols);
      if (data.sort === "name") q = q.order("nome", { ascending: true });
      else if (data.sort === "name-desc") q = q.order("nome", { ascending: false });
      else q = q.order("created_at", { ascending: false });
      q = applyCrmFilters(q as never, data.filters as CrmFilters);
      if (excludeSet.size && excludeSet.size <= INLINE_ID_LIMIT) {
        q = q.not("id", "in", `(${Array.from(excludeSet).map((v) => `"${v}"`).join(",")})`);
      }
      return q;
    }

    // Conjunto de IDs grande demais pra caber na URL: cruza em memória.
    const useMemoryIntersection =
      (allowedIds && allowedIds.length > INLINE_ID_LIMIT) || excludeSet.size > INLINE_ID_LIMIT;

    let rows: Array<Record<string, unknown> & { id: string }> = [];
    let total = 0;

    if (useMemoryIntersection) {
      const allowedSet = allowedIds ? new Set(allowedIds) : null;
      const { pageIds, total: t } = await paginateWithAllowedIds({
        buildIdQuery: () => buildQuery("id", false) as never,
        allowed: {
          has: (id: string) => (allowedSet ? allowedSet.has(id) : true) && !excludeSet.has(id),
        } as Set<string>,
        from,
        pageSize: data.pageSize,
      });
      total = t;
      if (pageIds.length) {
        const { data: pageRows, error } = await context.supabase
          .from("contacts")
          .select(CONTACT_LIST_COLS)
          .in("id", pageIds);
        if (error) throw error;
        const byId = new Map((pageRows ?? []).map((r) => [r.id, r]));
        rows = pageIds.map((id) => byId.get(id)).filter(Boolean) as typeof rows;
      }
    } else {
      let q = buildQuery(CONTACT_LIST_COLS, true).range(from, to);
      if (allowedIds?.length) q = q.in("id", allowedIds);
      const { data: r, count, error } = await q;
      if (error) throw error;
      rows = (r ?? []) as typeof rows;
      total = count ?? 0;
    }

    // Tags por contato
    const ids = rows.map((r) => r.id);
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
      rows: rows.map((r) => ({ ...r, tags: tagMap[r.id] ?? [] })),
      total,
      page: data.page,
      pageSize: data.pageSize,
    };
  });


// ===== IDs por filtro (selecionar tudo do filtro / export) =====
export const idsByFilter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      filters: crmFilterSchema.partial().default({}),
      max: z.number().int().min(1).max(10000).default(5000),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("contacts").select("id", { count: "exact" }).limit(data.max);
    q = applyCrmFilters(q as never, data.filters as CrmFilters);
    if (data.filters.tag_ids?.length) {
      const { ids, noMatch } = await resolveContactIdsForTagFilter(context.supabase, data.filters.tag_ids);
      if (noMatch) return { ids: [] as string[], total: 0, truncated: false };
      if (ids?.length) q = q.in("id", ids);
    }
    async function idsForCampaign(campaignId: string, statuses?: string[]) {
      let qr = context.supabase.from("campaign_recipients").select("contact_id").eq("campaign_id", campaignId);
      if (statuses?.length) qr = qr.in("status", statuses as never[]);
      const { data: r } = await qr.limit(20000);
      return Array.from(new Set((r ?? []).map((x) => x.contact_id)));
    }
    if (data.filters.recebeu_campanha_id) {
      const ids = await idsForCampaign(data.filters.recebeu_campanha_id, ["sent","delivered","read"]);
      if (!ids.length) return { ids: [] as string[], total: 0, truncated: false };
      q = q.in("id", ids);
    }
    if (data.filters.nao_recebeu_campanha_id) {
      const ids = await idsForCampaign(data.filters.nao_recebeu_campanha_id, ["sent","delivered","read"]);
      if (ids.length) q = q.not("id", "in", `(${ids.map((v) => `"${v}"`).join(",")})`);
    }
    if (data.filters.erro_campanha_id) {
      const ids = await idsForCampaign(data.filters.erro_campanha_id, ["failed"]);
      if (!ids.length) return { ids: [] as string[], total: 0, truncated: false };
      q = q.in("id", ids);
    }
    async function idsForTemplate(templateId: string) {
      const { data: r } = await context.supabase
        .from("automation_deliveries")
        .select("contact_id")
        .eq("template_id", templateId)
        .eq("status", "sent")
        .limit(20000);
      return Array.from(new Set((r ?? []).map((x) => x.contact_id as string)));
    }
    if (data.filters.recebeu_template_id) {
      const ids = await idsForTemplate(data.filters.recebeu_template_id);
      if (!ids.length) return { ids: [] as string[], total: 0, truncated: false };
      q = q.in("id", ids);
    }
    if (data.filters.nao_recebeu_template_id) {
      const ids = await idsForTemplate(data.filters.nao_recebeu_template_id);
      if (ids.length) q = q.not("id", "in", `(${ids.map((v) => `"${v}"`).join(",")})`);
    }
    const { data: rows, error, count } = await q;
    if (error) throw error;
    const ids = (rows ?? []).map((r) => r.id);
    // `total` é a contagem real do filtro; `truncated` avisa a interface que a
    // seleção não cobre todos os contatos filtrados (limite de segurança `max`).
    const total = count ?? ids.length;
    return { ids, total, truncated: total > ids.length };
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
// ⚠️ Ao adicionar um campo novo na ficha de contato, sempre volte aqui também:
//   (4) incluir a coluna aqui (CSV_COLS + select) com um cabeçalho reconhecido
//       por suggestMapping() em src/lib/imports.functions.ts, pra exportar e
//       reimportar sempre baterem — ver o mesmo checklist em crm-filters.ts:1-4
//       e imports.functions.ts:1-4.
const CSV_COLS: Array<{ key: string; label: string }> = [
  { key: "nome", label: "Nome" },
  { key: "nome_social", label: "Nome Social" },
  { key: "phone_raw", label: "Telefone Original" },
  { key: "phone_e164", label: "Telefone Normalizado" },
  { key: "phone_secundario_raw", label: "Telefone Secundário" },
  { key: "email", label: "E-mail" },
  { key: "email_secundario", label: "E-mail Secundário" },
  { key: "cep", label: "CEP" },
  { key: "endereco", label: "Endereço" },
  { key: "numero", label: "Número" },
  { key: "complemento", label: "Complemento" },
  { key: "bairro", label: "Bairro" },
  { key: "referencia", label: "Ponto de Referência" },
  { key: "cidade", label: "Cidade" },
  { key: "uf", label: "UF" },
  { key: "profissao", label: "Profissão" },
  { key: "instituicao", label: "Onde Trabalha" },
  { key: "tipo_contato", label: "Tipo Contato" },
  { key: "coletivo_alicerce", label: "Coletivo Alicerce" },
  { key: "participa_movimento_social", label: "Participa Movimento Social" },
  { key: "movimento_social_nome", label: "Qual Movimento Social" },
  { key: "formas_ajuda_concat", label: "Formas de Ajuda" },
  { key: "formas_ajuda_outro", label: "Formas de Ajuda - Outro" },
  { key: "disponibilidade_concat", label: "Disponibilidade" },
  { key: "quem_indicou", label: "Quem Indicou" },
  { key: "rede_social", label: "Rede Social" },
  { key: "zona_eleitoral", label: "Zona Eleitoral" },
  { key: "como_conheceu", label: "Como Conheceu" },
  { key: "faixa_etaria", label: "Faixa Etária" },
  { key: "observacoes", label: "Observações" },
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

// Bloco máximo de UUIDs por `.in(...)`. Cada UUID ocupa ~40 chars na URL
// (com aspas e vírgulas). O Worker/PostgREST cortam URLs muito longas e o
// erro chega como resposta vazia — por isso paginamos.
const IN_CHUNK = 200;

async function fetchContactsBatched<T>(
  supabase: unknown,
  select: string,
  ids: string[],
): Promise<T[]> {
  const client = supabase as { from: (t: string) => { select: (s: string) => { in: (c: string, v: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> } } };
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const { data: rows, error } = await client.from("contacts").select(select).in("id", chunk);
    if (error) throw new Error(`Falha ao buscar contatos (bloco ${i}): ${error.message}`);
    if (rows) out.push(...rows);
  }
  return out;
}

async function fetchContactTagsBatched(
  supabase: unknown,
  ids: string[],
): Promise<Array<{ contact_id: string; tags: { nome: string } | null }>> {
  type Rel = { contact_id: string; tags: { nome: string } | null };
  const client = supabase as { from: (t: string) => { select: (s: string) => { in: (c: string, v: string[]) => PromiseLike<{ data: Rel[] | null; error: { message: string } | null }> } } };
  const out: Rel[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const { data: rels, error } = await client.from("contact_tags").select("contact_id, tags(nome)").in("contact_id", chunk);
    if (error) throw new Error(`Falha ao buscar tags (bloco ${i}): ${error.message}`);
    if (rels) out.push(...rels);
  }
  return out;
}


export const exportContactsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1).max(10000) }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const selectCols =
      "id,nome,nome_social,phone_raw,phone_e164,phone_secundario_raw,email,email_secundario,cep,endereco,numero,complemento,bairro,referencia,cidade,uf,profissao,instituicao,tipo_contato,coletivo_alicerce,participa_movimento_social,movimento_social_nome,formas_ajuda,formas_ajuda_outro,disponibilidade,quem_indicou,rede_social,zona_eleitoral,como_conheceu,faixa_etaria,observacoes,lifecycle_status,phone_status,whatsapp_status,consentimento_whatsapp,opt_out_at,origem,origem_detalhe";

    const rows = await fetchContactsBatched<Record<string, unknown> & { id: string }>(
      supabase,
      selectCols,
      data.ids,
    );
    const rels = await fetchContactTagsBatched(supabase, data.ids);

    const tagMap: Record<string, string[]> = {};
    for (const r of rels) {
      const n = r.tags?.nome;
      if (n) (tagMap[r.contact_id] ??= []).push(n);
    }
    const header = CSV_COLS.map((c) => csvEsc(c.label)).join(";");
    const lines = rows.map((row) => {
      const tags_concat = (tagMap[row.id] ?? []).join("|");
      const formas_ajuda_concat = Array.isArray(row.formas_ajuda) ? (row.formas_ajuda as string[]).join("|") : "";
      const disponibilidade_concat = Array.isArray(row.disponibilidade) ? (row.disponibilidade as string[]).join("|") : "";
      const fullRow: Record<string, unknown> = { ...row, tags_concat, formas_ajuda_concat, disponibilidade_concat };
      return CSV_COLS.map((c) => csvEsc(fullRow[c.key])).join(";");
    });
    const csv = "\uFEFF" + [header, ...lines].join("\r\n");
    return { csv, count: rows.length };
  });

// ===== Cópia formatada (lista simples ou agrupada) =====
const DAY_ORDER = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"];
const DAY_LABEL: Record<string, string> = {
  segunda: "Segunda", terca: "Terça", quarta: "Quarta", quinta: "Quinta",
  sexta: "Sexta", sabado: "Sábado", domingo: "Domingo",
};

export const copyContactsFormatted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    ids: z.array(z.string().uuid()).min(1).max(5000),
    groupBy: z.enum(["none", "cidade", "tag", "disponibilidade"]).default("none"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("contacts")
      .select("id,nome,phone_e164,phone_raw,cidade,disponibilidade")
      .in("id", data.ids);
    const contacts = rows ?? [];

    const fmtLine = (r: any) => {
      const phone = r.phone_e164 || r.phone_raw || "";
      const name = r.nome || "(sem nome)";
      return phone ? `${name} — ${phone}` : name;
    };

    if (data.groupBy === "none") {
      const text = contacts.map(fmtLine).join("\n");
      return { text, count: contacts.length };
    }

    if (data.groupBy === "cidade") {
      const byCity: Record<string, any[]> = {};
      for (const r of contacts) {
        const key = (r.cidade as string | null)?.trim() || "Sem cidade";
        (byCity[key] ??= []).push(r);
      }
      const parts = Object.keys(byCity).sort().map((city) => {
        const lines = byCity[city].map(fmtLine).join("\n");
        return `*${city}* (${byCity[city].length})\n${lines}`;
      });
      return { text: parts.join("\n\n"), count: contacts.length };
    }

    if (data.groupBy === "tag") {
      const { data: rels } = await context.supabase
        .from("contact_tags")
        .select("contact_id, tags(nome)")
        .in("contact_id", data.ids);
      const byTag: Record<string, Set<string>> = {};
      for (const rel of rels ?? []) {
        const tagName = (rel.tags as { nome: string } | null)?.nome;
        if (!tagName) continue;
        (byTag[tagName] ??= new Set()).add(rel.contact_id as string);
      }
      const withTag = new Set<string>();
      Object.values(byTag).forEach((s) => s.forEach((id) => withTag.add(id)));
      const untagged = contacts.filter((r) => !withTag.has(r.id as string));
      const parts: string[] = [];
      Object.keys(byTag).sort().forEach((tag) => {
        const list = contacts.filter((r) => byTag[tag].has(r.id as string));
        parts.push(`*${tag}* (${list.length})\n${list.map(fmtLine).join("\n")}`);
      });
      if (untagged.length) {
        parts.push(`*Sem tag* (${untagged.length})\n${untagged.map(fmtLine).join("\n")}`);
      }
      return { text: parts.join("\n\n"), count: contacts.length };
    }

    // disponibilidade — agrupa por dia da semana (contato aparece em cada dia em que está disponível)
    const byDay: Record<string, any[]> = {};
    const semDisp: any[] = [];
    for (const r of contacts) {
      const disp = (r.disponibilidade as string[] | null) ?? [];
      const days = new Set<string>();
      for (const d of disp) {
        const [day] = String(d).split("_");
        if (day) days.add(day);
      }
      if (days.size === 0) {
        semDisp.push(r);
      } else {
        days.forEach((d) => (byDay[d] ??= []).push(r));
      }
    }
    const parts: string[] = [];
    for (const d of DAY_ORDER) {
      if (!byDay[d]?.length) continue;
      parts.push(`*${DAY_LABEL[d]}* (${byDay[d].length})\n${byDay[d].map(fmtLine).join("\n")}`);
    }
    if (semDisp.length) {
      parts.push(`*Sem disponibilidade informada* (${semDisp.length})\n${semDisp.map(fmtLine).join("\n")}`);
    }
    return { text: parts.join("\n\n"), count: contacts.length };
  });
