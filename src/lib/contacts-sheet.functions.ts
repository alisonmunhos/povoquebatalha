import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  applyCrmFilters,
  resolveContactIdsForTagFilter,
  paginateWithAllowedIds,
  fetchAllPaged,
  splitEmptyToken,
  INLINE_ID_LIMIT,
  type CrmFilters,
} from "@/lib/crm-filters";
import { FORM_FIELD_CATALOG, getCatalogField } from "@/lib/form-field-catalog";
import { parseSheetSort, resolveSortDbColumn } from "@/lib/column-sort-mapping";

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

const TAG_BATCH_SIZE = 500;

async function loadContactTagsBatched(
  supabase: SupabaseClient,
  contactIds: string[],
): Promise<Record<string, Array<{ id: string; nome: string; cor: string }>>> {
  const tagMap: Record<string, Array<{ id: string; nome: string; cor: string }>> = {};
  if (!contactIds.length) return tagMap;

  for (let i = 0; i < contactIds.length; i += TAG_BATCH_SIZE) {
    const chunk = contactIds.slice(i, i + TAG_BATCH_SIZE);
    const { data: rels, error: tagError } = await supabase
      .from("contact_tags")
      .select("contact_id, tags(id,nome,cor)")
      .in("contact_id", chunk);
    if (tagError) throw new Error(postgrestErrorMessage(tagError));
    for (const r of rels ?? []) {
      const row = r as unknown as { contact_id: string; tags: { id: string; nome: string; cor: string } | { id: string; nome: string; cor: string }[] | null };
      const t = row.tags;
      if (!t) continue;
      const list = Array.isArray(t) ? t : [t];
      (tagMap[row.contact_id] ??= []).push(...list);
    }
  }
  return tagMap;
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

    let allowedIds: string[] | null = null;
    const tagIdsRaw = filters.tag_ids;
    if (tagIdsRaw?.length) {
      const { ids, noMatch } = await resolveContactIdsForTagFilter(context.supabase, tagIdsRaw);
      if (noMatch) {
        return { rows: [], total: 0, page, pageSize: data.pageSize };
      }
      if (ids?.length) allowedIds = ids;
    }

    function buildQuery(cols: string, withCount: boolean) {
      let q = withCount
        ? context.supabase.from("contacts").select(cols, { count: "exact" })
        : context.supabase.from("contacts").select(cols);
      try {
        q = applyCrmFilters(q as never, filters);
      } catch (err: unknown) {
        throw new Error(`Filtros inválidos: ${(err as Error).message}`);
      }
      if (data.sort) {
        const { columnKey, direction } = parseSheetSort(data.sort);
        const dbCol = resolveSortDbColumn(columnKey);
        const ascending = direction === "asc";
        if (dbCol) {
          q = q.order(dbCol, { ascending, nullsFirst: false });
          if (dbCol !== "created_at") q = q.order("created_at", { ascending: false });
        } else {
          q = q.order("created_at", { ascending: false });
        }
      } else {
        q = q.order("created_at", { ascending: false });
      }
      return q;
    }

    let rows: Record<string, unknown>[] = [];
    let count: number | null = null;

    if (allowedIds && allowedIds.length > INLINE_ID_LIMIT) {
      // Conjunto grande demais pra caber na URL: cruza em memória.
      const allowedSet = new Set(allowedIds);
      const { pageIds, total } = await paginateWithAllowedIds({
        buildIdQuery: () => buildQuery("id", false) as never,
        allowed: allowedSet,
        from,
        pageSize: pageSize ?? 100_000,
      });
      count = total;
      if (pageIds.length) {
        const { data: pageRows, error } = await context.supabase
          .from("contacts")
          .select(projection)
          .in("id", pageIds);
        if (error) throw new Error(postgrestErrorMessage(error));
        const byId = new Map(
          ((pageRows ?? []) as unknown as Record<string, unknown>[]).map((r) => [r.id as string, r]),
        );
        rows = pageIds.map((id: string) => byId.get(id)).filter(Boolean) as Record<string, unknown>[];
      }
    } else {
      let q = buildQuery(projection, true);
      if (allowedIds?.length) q = q.in("id", allowedIds);
      if (typeof to === "number") q = q.range(from, to);
      const { data: rowsRaw, count: c, error } = await q;
      if (error) throw new Error(postgrestErrorMessage(error));
      rows = (rowsRaw ?? []) as unknown as Record<string, unknown>[];
      count = c ?? 0;
    }


    const ids = rows.map((r) => r.id).filter(Boolean) as string[];
    const tagMap = await loadContactTagsBatched(context.supabase, ids);

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
