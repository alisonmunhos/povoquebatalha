import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { crmFilterSchema, applyCrmFilters, type CrmFilters } from "@/lib/crm-filters";
import { FORM_FIELD_CATALOG, getCatalogField } from "@/lib/form-field-catalog";

function decodeBase64UrlSafeToJson<T = unknown>(s?: string): T | null {
  if (!s) return null;
  const pad = (4 - (s.length % 4)) % 4;
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const buf = Buffer.from(base64, "base64");
  return JSON.parse(buf.toString("utf8")) as T;
}

const listInputSchema = z.object({
  cols: z.array(z.string()).min(1).max(30),
  filtersEncoded: z.string().optional(),
  sort: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.union([z.number().int().min(1).max(2000), z.literal("all")]).default(50),
});

export const listContactsSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listInputSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const page = data.page ?? 1;
    const pageSize = data.pageSize === "all" ? null : (data.pageSize as number);
    const from = pageSize ? (page - 1) * pageSize : 0;
    const to = pageSize ? from + pageSize - 1 : undefined;

    const invalidCols = data.cols.filter((c) => !getCatalogField(c) && c !== "tags" && c !== "id");
    if (invalidCols.length) {
      return { error: "InvalidColumns", invalid: invalidCols } as any;
    }

    const requestedCols = Array.from(new Set(["id", ...data.cols]));
    const projectionParts: string[] = [];
    for (const key of requestedCols) {
      if (key === "id") {
        projectionParts.push("id");
        continue;
      }
      const f = getCatalogField(key);
      if (!f) continue;
      for (const tc of f.targetColumns) {
        if (!projectionParts.includes(tc)) projectionParts.push(tc);
      }
    }
    if (!projectionParts.includes("created_at")) projectionParts.push("created_at");
    const projection = projectionParts.join(",");

    let filters: CrmFilters | null = null;
    try {
      const decoded = decodeBase64UrlSafeToJson<Record<string, unknown> | null>(data.filtersEncoded);
      filters = (decoded ?? {}) as CrmFilters;
    } catch (err: unknown) {
      return { error: "InvalidFilters", details: `cannot decode filters: ${(err as Error).message}` } as any;
    }

    let q = context.supabase.from("contacts").select(projection, { count: "exact" });
    if (typeof to === "number") q = q.range(from, to);

    try {
      q = applyCrmFilters(q as never, (filters ?? {}) as CrmFilters);
    } catch (err: unknown) {
      return { error: "InvalidFilters", details: `filter validation failed: ${(err as Error).message}` } as any;
    }

    if (data.sort) {
      const [field, dir] = String(data.sort).split(":");
      const ascending = dir === "asc";
      if (projectionParts.includes(field)) q = q.order(field, { ascending });
      else if (field === "nome") q = q.order("nome", { ascending });
      else q = q.order("created_at", { ascending: false });
    } else {
      q = q.order("created_at", { ascending: false });
    }

    const { data: rowsRaw, count, error } = await q;
    if (error) throw error;
    const rows = (rowsRaw ?? []) as Record<string, unknown>[];

    const ids = rows.map((r) => r.id).filter(Boolean) as string[];
    let tagMap: Record<string, Array<{ id: string; nome: string; cor: string }>> = {};
    if (ids.length) {
      const { data: rels } = await context.supabase
        .from("contact_tags")
        .select("contact_id, tags(id,nome,cor)")
        .in("contact_id", ids);
      tagMap = (rels ?? []).reduce((acc: typeof tagMap, r: any) => {
        const t = r.tags as { id: string; nome: string; cor: string } | null;
        if (!t) return acc;
        (acc[r.contact_id] ??= []).push(t);
        return acc;
      }, {});
    }

    const finalRows = rows.map((r) => {
      const out: Record<string, unknown> = { contact_id: r.id };
      for (const key of data.cols) {
        if (key === "tags") {
          out[key] = tagMap[r.id] ?? [];
          continue;
        }
        const f = getCatalogField(key);
        if (!f) {
          out[key] = null;
          continue;
        }
        if (f.targetColumns.length === 1) {
          out[key] = (r as Record<string, unknown>)[f.targetColumns[0]];
        } else {
          out[key] = f.targetColumns.reduce<Record<string, unknown>>((acc, c) => {
            acc[c] = (r as Record<string, unknown>)[c];
            return acc;
          }, {});
        }
      }
      return out;
    });

    return { rows: finalRows as any, total: count ?? 0, page, pageSize: data.pageSize };
  });
