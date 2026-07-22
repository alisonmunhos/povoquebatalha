import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyCrmFilters, resolveContactIdsForTagFilter, type CrmFilters } from "@/lib/crm-filters";
import { FORM_FIELD_CATALOG, getCatalogField } from "@/lib/form-field-catalog";

function decodeBase64UrlSafeToJson<T = unknown>(s?: string): T | null {
  if (!s) return null;
  const pad = (4 - (s.length % 4)) % 4;
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const buf = Buffer.from(base64, "base64");
  return JSON.parse(buf.toString("utf8")) as T;
}

function normalizeSheetFilters(raw: CrmFilters): CrmFilters {
  const f = { ...raw };
  if (f.archived === undefined) f.archived = "nao";
  return f;
}

function postgrestErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
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

    const SYSTEM_COLS = new Set(["tags", "cidade", "bairro", "uf", "origem", "lifecycle_status", "created_at"]);
    const invalidCols = data.cols.filter((c) => !getCatalogField(c) && !SYSTEM_COLS.has(c) && c !== "id");
    if (invalidCols.length) {
      throw new Error(`Colunas inválidas: ${invalidCols.join(", ")}`);
    }

    const requestedCols = Array.from(new Set(["id", ...data.cols]));
    const projectionParts: string[] = [];
    for (const key of requestedCols) {
      if (key === "id") {
        projectionParts.push("id");
        continue;
      }
      if (key === "tags") continue;
      const f = getCatalogField(key);
      if (f) {
        for (const tc of f.targetColumns) {
          if (!projectionParts.includes(tc)) projectionParts.push(tc);
        }
      } else if (SYSTEM_COLS.has(key)) {
        if (!projectionParts.includes(key)) projectionParts.push(key);
      }
    }
    if (!projectionParts.includes("created_at")) projectionParts.push("created_at");
    const projection = projectionParts.join(",");

    let filters: CrmFilters;
    try {
      const decoded = decodeBase64UrlSafeToJson<Record<string, unknown> | null>(data.filtersEncoded);
      filters = normalizeSheetFilters((decoded ?? {}) as CrmFilters);
    } catch (err: unknown) {
      throw new Error(`Filtros inválidos: ${(err as Error).message}`);
    }

    let q = context.supabase.from("contacts").select(projection, { count: "exact" });

    try {
      q = applyCrmFilters(q as never, filters);
    } catch (err: unknown) {
      throw new Error(`Filtros inválidos: ${(err as Error).message}`);
    }

    const tagIdsRaw = filters.tag_ids;
    if (tagIdsRaw?.length) {
      const { ids, noMatch } = await resolveContactIdsForTagFilter(context.supabase, tagIdsRaw);
      if (noMatch) {
        return { rows: [], total: 0, page, pageSize: data.pageSize };
      }
      if (ids?.length) {
        q = q.in("id", ids);
      }
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

    if (typeof to === "number") q = q.range(from, to);

    const { data: rowsRaw, count, error } = await q;
    if (error) throw new Error(postgrestErrorMessage(error));
    const rows = (rowsRaw ?? []) as unknown as Record<string, unknown>[];

    const ids = rows.map((r) => r.id).filter(Boolean) as string[];
    let tagMap: Record<string, Array<{ id: string; nome: string; cor: string }>> = {};
    if (ids.length) {
      const { data: rels, error: tagError } = await context.supabase
        .from("contact_tags")
        .select("contact_id, tags(id,nome,cor)")
        .in("contact_id", ids);
      if (tagError) throw new Error(postgrestErrorMessage(tagError));
      tagMap = (rels ?? []).reduce((acc: typeof tagMap, r: any) => {
        const t = r.tags as { id: string; nome: string; cor: string } | null;
        if (!t) return acc;
        (acc[r.contact_id] ??= []).push(t);
        return acc;
      }, {});
    }

    const finalRows = rows.map((r) => {
      const rid = r.id as string;
      const out: Record<string, unknown> = { contact_id: rid };
      for (const key of data.cols) {
        if (key === "tags") {
          out[key] = tagMap[rid] ?? [];
          continue;
        }
        const f = getCatalogField(key);
        if (!f) {
          out[key] = (r as Record<string, unknown>)[key] ?? null;
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
