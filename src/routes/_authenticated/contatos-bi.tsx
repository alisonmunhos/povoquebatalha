import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { listContactsSheet } from "@/lib/contacts-sheet.functions";
import { updateContactField } from "@/lib/update-contact-field.functions";
import { idsByFilter, bulkApplyTag, exportContactsCsv, copyContactsFormatted } from "@/lib/crm-bulk.functions";
import { createTag } from "@/lib/contacts.functions";
import ColumnPickerPanel from "@/components/contacts-sheet/ColumnPickerPanel";
import SavedViewsControl from "@/components/contacts-sheet/SavedViewsControl";
import SheetContainer from "@/components/contacts-sheet/SheetContainer";
import BulkActionBar from "@/components/contacts-sheet/BulkActionBar";
import { decodeBase64UrlSafe as decodeFilters } from "@/lib/filters-encoding";
import { toast } from "sonner";

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

function ContatosBI() {
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();

  const colsParam = (routeSearch.cols as string | undefined) ?? "nome,whatsapp";
  const cols = colsParam.split(",").map((c) => c.trim()).filter(Boolean);
  const filtersEncoded = (routeSearch.filters as string | undefined) ?? "";
  const sort = (routeSearch.sort as string | undefined) ?? "created_at:desc";
  const page = Number((routeSearch.page as string | undefined) ?? "1");
  const pageSizeRaw = (routeSearch.pageSize as string | undefined) ?? "50";
  const pageSize: number | "all" = pageSizeRaw === "all" ? "all" : Number(pageSizeRaw);

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [, setSelectAllMode] = useState<{ active: boolean; total?: number }>({ active: false });
  const [savedViews, setSavedViews] = useState<Array<{ name: string; payload: any }>>(() => {
    try {
      const raw = localStorage.getItem("whatsapp-connect.contacts-sheet.views");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const currentFilters = useMemo(() => (decodeFilters(filtersEncoded) ?? {}) as any, [filtersEncoded]);

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

  async function selectAllByFilter() {
    const r = await idsByFilterFn({ data: { filters: currentFilters, max: 2000 } });
    setSelection(new Set((r as any).ids));
    setSelectAllMode({ active: true, total: (r as any).ids.length });
  }

  async function onEditCell(contactId: string, fieldKey: string, newValue: unknown) {
    return updateFieldFn({ data: { contactId, fieldKey, value: newValue } });
  }

  const copyFormattedFn = useServerFn(copyContactsFormatted);
  async function onCopyFormatted(mode: "none" | "cidade" | "tag" | "disponibilidade") {
    if (!selection || selection.size === 0) {
      toast.error("Nenhum contato selecionado");
      return;
    }
    try {
      const r = await copyFormattedFn({ data: { ids: [...selection], groupBy: mode } });
      const text = (r as any).text as string;
      const count = (r as any).count as number;
      if (!text) {
        toast.error("Nada para copiar");
        return;
      }
      await navigator.clipboard.writeText(text);
      const suffix = mode === "none" ? "" :
        mode === "cidade" ? " (agrupado por cidade)" :
        mode === "tag" ? " (agrupado por tag)" :
        " (agrupado por disponibilidade)";
      toast.success(`${count} contato${count > 1 ? "s" : ""} copiado${count > 1 ? "s" : ""}${suffix}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao copiar para a área de transferência");
    }
  }

  return (
    <div className="contacts-sheet-page p-4">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Contatos — Visão BI</h1>
        <SavedViewsControl saved={savedViews} onSave={saveViewLocal} />
      </header>

      <div className="mb-4">
        <button
          type="button"
          aria-expanded={columnsOpen}
          aria-controls="column-picker-panel"
          onClick={() => setColumnsOpen((open) => !open)}
          className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Colunas {columnsOpen ? "▴" : "▾"}
        </button>
      </div>

      {columnsOpen && (
        <div id="column-picker-panel">
          <ColumnPickerPanel chosen={cols} onToggleColumn={toggleColumn} />
        </div>
      )}

      <SheetContainer
        cols={cols}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        onEditCell={onEditCell}
        selection={selection}
        setSelection={setSelection}
        currentFilters={currentFilters}
        pushSearch={(filtersEncodedNext?: string) => pushSearch({ filters: filtersEncodedNext || undefined, page: "1" })}
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
        onCopyFormatted={onCopyFormatted}
      />
    </div>
  );
}

