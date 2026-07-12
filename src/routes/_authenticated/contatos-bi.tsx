import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { FORM_FIELD_CATALOG, getCatalogField } from "@/lib/form-field-catalog";
import { listContactsSheet } from "@/lib/contacts-sheet.functions";
import { updateContactField } from "@/lib/update-contact-field.functions";
import { idsByFilter, bulkApplyTag, exportContactsCsv, bulkArchive, bulkSetLifecycle } from "@/lib/crm-bulk.functions";
import { createTag } from "@/lib/contacts.functions";
import ColumnPickerPanel from "@/components/contacts-sheet/ColumnPickerPanel";
import SavedViewsControl from "@/components/contacts-sheet/SavedViewsControl";
import SheetContainer from "@/components/contacts-sheet/SheetContainer";
import BulkActionBar from "@/components/contacts-sheet/BulkActionBar";

const searchSchema = z.object({
  cols: z.string().optional(),
  filters: z.string().optional(),
  sort: z.string().optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/contatos-bi")({
  head: () => ({ meta: [{ title: "Contatos — BI" }] }),
  validateSearch: (s) => searchSchema.parse(s ?? {}),
  component: ContatosBI,
});

type ContactRow = { contact_id: string; [col: string]: unknown };

function encodeFiltersToBase64Url(obj: unknown): string {
  const json = JSON.stringify(obj);
  const utf8 = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16)));
  const b64 = btoa(utf8);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeFiltersEncoded<T = unknown>(s?: string): T | null {
  if (!s) return null;
  try {
    const base64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (base64.length % 4)) % 4;
    const b64 = base64 + "=".repeat(pad);
    const utf8 = atob(b64);
    const json = decodeURIComponent(Array.from(utf8).map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join(""));
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function ContatosBI() {
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();

  const colsParam = (routeSearch.cols as string | undefined) ?? "nome,whatsapp,cidade";
  const cols = colsParam.split(",").map((c) => c.trim()).filter(Boolean);
  const filtersEncoded = (routeSearch.filters as string | undefined) ?? "";
  const sort = (routeSearch.sort as string | undefined) ?? "created_at:desc";
  const page = Number((routeSearch.page as string | undefined) ?? "1");
  const pageSizeRaw = (routeSearch.pageSize as string | undefined) ?? "50";
  const pageSize: number | "all" = pageSizeRaw === "all" ? "all" : Number(pageSizeRaw);

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [selectAllMode, setSelectAllMode] = useState<{ active: boolean; total?: number }>({ active: false });
  const [savedViews, setSavedViews] = useState<Array<{ name: string; payload: any }>>(() => {
    try {
      const raw = localStorage.getItem("whatsapp-connect.contacts-sheet.views");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  

  const listFn = useServerFn(listContactsSheet);
  const updateFieldFn = useServerFn(updateContactField);
  const idsByFilterFn = useServerFn(idsByFilter);
  const createTagFn = useServerFn(createTag);
  const bulkApplyTagFn = useServerFn(bulkApplyTag);
  const exportCsvFn = useServerFn(exportContactsCsv);

  const q = useQuery({
    queryKey: ["contacts-sheet", colsParam, filtersEncoded, sort, page, pageSize],
    queryFn: () => listFn({ data: { cols, filtersEncoded, sort, page, pageSize } }),
  });

  const rows: ContactRow[] = (q.data as any)?.rows ?? [];
  const total: number = (q.data as any)?.total ?? 0;

  function replaceSearch(patch: Record<string, string | undefined>) {
    const next: Record<string, any> = { ...(routeSearch as Record<string, any>), ...patch };
    Object.keys(next).forEach((k) => next[k] === undefined && delete next[k]);
    navigate({ search: next as any, replace: true } as any);
  }

  function pushSearch(patch: Record<string, string | undefined>) {
    const next: Record<string, any> = { ...(routeSearch as Record<string, any>), ...patch };
    Object.keys(next).forEach((k) => next[k] === undefined && delete next[k]);
    navigate({ search: next as any, replace: false } as any);
  }

  function saveViewLocal(name: string) {
    const v = { name, payload: { cols, sort, filtersEncoded, pageSize } };
    const key = "whatsapp-connect.contacts-sheet.views";
    const existing = [...savedViews.filter((s) => s.name !== name), v];
    setSavedViews(existing);
    localStorage.setItem(key, JSON.stringify(existing));
  }

  function toggleColumn(colKey: string) {
    const set = new Set(cols);
    if (set.has(colKey)) set.delete(colKey);
    else set.add(colKey);
    pushSearch({ cols: Array.from(set).join(",") || undefined, page: "1" });
  }

  function onFilterChipClick(nextFiltersObj: unknown) {
    pushSearch({ filters: encodeFiltersToBase64Url(nextFiltersObj), page: "1" });
  }

  async function selectAllByFilter() {
    const parsedFilters = decodeFiltersEncoded(filtersEncoded) ?? {};
    const r = await idsByFilterFn({ data: { filters: parsedFilters, max: 2000 } });
    setSelection(new Set((r as any).ids));
    setSelectAllMode({ active: true, total: (r as any).ids.length });
  }

  async function onEditCell(contactId: string, fieldKey: string, newValue: unknown) {
    return updateFieldFn({ data: { contactId, fieldKey, value: newValue } });
  }

  return (
    <div className="contacts-sheet-page p-4">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Contatos — Visão BI</h1>
        <SavedViewsControl saved={savedViews} onSave={saveViewLocal} />
      </header>

      <ColumnPickerPanel chosen={cols} onToggleColumn={toggleColumn} />

      <SheetContainer
        cols={cols}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        onEditCell={onEditCell}
        onFilterChipClick={onFilterChipClick}
        q={q}
      />

      <BulkActionBar
        selection={selection}
        total={total}
        selectAllByFilter={selectAllByFilter}
        onCreateTag={async (name: string) => createTagFn({ data: { nome: name } })}
        onApplyTag={async (tagId: string) => {
          await bulkApplyTagFn({ data: { ids: [...selection], tag_id: tagId, add: true } });
          q.refetch();
        }}
        onExportSelected={async () => {
          if (!selection.size) return;
          const ids = [...selection];
          const r = await exportCsvFn({ data: { ids } });
          const blob = new Blob([(r as any).csv], { type: "text/csv;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `contatos_${new Date().toISOString().slice(0, 10)}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        }}
      />

      {phoneEditFor && (
        <PhoneQuickSave contactId={phoneEditFor} onClose={() => { setPhoneEditFor(null); q.refetch(); }} />
      )}
    </div>
  );
}
