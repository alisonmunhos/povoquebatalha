import { useEffect, useMemo, useState } from "react";
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
import type { CrmFilters } from "@/lib/crm-filters";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-is-mobile";
import {
  parseSheetPageSize,
  MOBILE_MAX_COLUMNS,
  SHEET_SELECT_ALL_MAX,
  SHEET_LARGE_PAGE_WARNING,
  type SheetPageSizeOption,
} from "@/lib/contacts-sheet.constants";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Columns3 } from "lucide-react";

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
  const isMobile = useIsMobile();

  const colsParam = (routeSearch.cols as string | undefined) ?? "nome,whatsapp";
  const colsAll = colsParam.split(",").map((c) => c.trim()).filter(Boolean);
  const cols = isMobile ? colsAll.slice(0, MOBILE_MAX_COLUMNS) : colsAll;
  const filtersEncoded = (routeSearch.filters as string | undefined) ?? "";
  const sort = (routeSearch.sort as string | undefined) ?? "created_at:desc";
  const page = Number((routeSearch.page as string | undefined) ?? "1");
  const pageSize = parseSheetPageSize(routeSearch.pageSize as string | undefined);

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [savedViews, setSavedViews] = useState<Array<{ name: string; payload: unknown }>>(() => {
    try {
      const raw = localStorage.getItem("whatsapp-connect.contacts-sheet.views");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const currentFilters = useMemo(() => {
    const raw = (decodeFilters(filtersEncoded) ?? {}) as CrmFilters;
    return { ...raw, archived: raw.archived ?? "nao" };
  }, [filtersEncoded]);

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

  const rows: ContactRow[] = (q.data as { rows?: ContactRow[] } | undefined)?.rows ?? [];
  const total: number = (q.data as { total?: number } | undefined)?.total ?? 0;

  function pushSearch(patch: Record<string, string | undefined>) {
    const next: Record<string, string | undefined> = { ...routeSearch, ...patch };
    Object.keys(next).forEach((k) => next[k] === undefined && delete next[k]);
    navigate({ search: next as never, replace: false });
  }

  /** Qualquer mudança nas colunas visíveis zera filtros, seleção e volta à página 1. */
  function applyColumnsChange(nextCols: string[], options?: { toastMessage?: string }) {
    setSelection(new Set());
    pushSearch({
      cols: nextCols.join(",") || undefined,
      filters: undefined,
      page: undefined,
    });
    toast.info(
      options?.toastMessage ?? "Colunas atualizadas. Os filtros foram limpos.",
      { id: "contacts-sheet-cols-reset" },
    );
  }

  useEffect(() => {
    if (q.isLoading || !q.data) return;
    if (rows.length >= SHEET_LARGE_PAGE_WARNING) {
      toast.info(`Exibindo ${rows.length} contatos — a tabela pode demorar um pouco para responder.`, {
        id: "contacts-sheet-large-page",
      });
    }
  }, [q.isLoading, q.data, rows.length]);

  useEffect(() => {
    if (!isMobile || colsAll.length <= MOBILE_MAX_COLUMNS) return;
    applyColumnsChange(colsAll.slice(0, MOBILE_MAX_COLUMNS), {
      toastMessage: `No celular, no máximo ${MOBILE_MAX_COLUMNS} colunas são exibidas. Os filtros foram limpos.`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, colsAll.length]);

  function saveViewLocal(name: string) {
    const v = { name, payload: { cols, sort, filtersEncoded, pageSize } };
    const key = "whatsapp-connect.contacts-sheet.views";
    const existing = [...savedViews.filter((s) => s.name !== name), v];
    setSavedViews(existing);
    localStorage.setItem(key, JSON.stringify(existing));
  }

  function toggleColumn(colKey: string) {
    const set = new Set(cols);
    if (set.has(colKey)) {
      if (set.size <= 1) {
        toast.error("Mantenha pelo menos uma coluna visível.");
        return;
      }
      set.delete(colKey);
    } else {
      if (isMobile && set.size >= MOBILE_MAX_COLUMNS) {
        toast.error(`No celular você pode exibir no máximo ${MOBILE_MAX_COLUMNS} colunas.`);
        return;
      }
      set.add(colKey);
    }
    applyColumnsChange(Array.from(set));
  }

  function onPageChange(nextPage: number) {
    pushSearch({ page: nextPage > 1 ? String(nextPage) : undefined });
  }

  function onPageSizeChange(next: SheetPageSizeOption) {
    pushSearch({
      pageSize: next === 50 ? undefined : String(next),
      page: undefined,
    });
    setSelection(new Set());
  }

  async function selectAllByFilter() {
    const r = await idsByFilterFn({ data: { filters: currentFilters, max: SHEET_SELECT_ALL_MAX } });
    const ids = (r as { ids: string[] }).ids;
    setSelection(new Set(ids));
    toast.success(`${ids.length} contato(s) selecionado(s)`);
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
      const text = (r as { text: string }).text;
      const count = (r as { count: number }).count;
      if (!text) {
        toast.error("Nada para copiar");
        return;
      }
      await navigator.clipboard.writeText(text);
      const suffix =
        mode === "none"
          ? ""
          : mode === "cidade"
            ? " (agrupado por cidade)"
            : mode === "tag"
              ? " (agrupado por tag)"
              : " (agrupado por disponibilidade)";
      toast.success(`${count} contato${count > 1 ? "s" : ""} copiado${count > 1 ? "s" : ""}${suffix}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao copiar para a área de transferência");
    }
  }

  const columnPicker = <ColumnPickerPanel chosen={cols} onToggleColumn={toggleColumn} isMobile={isMobile} />;

  return (
    <div className="contacts-sheet-page p-3 sm:p-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
        <h1 className="text-lg sm:text-xl font-semibold">Contatos — Visão BI</h1>
        <SavedViewsControl saved={savedViews} onSave={saveViewLocal} />
      </header>

      {isMobile ? (
        <Sheet open={columnsOpen} onOpenChange={setColumnsOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="mb-4 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <Columns3 className="h-4 w-4" />
              Colunas ({cols.length})
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Colunas visíveis</SheetTitle>
            </SheetHeader>
            <div className="mt-4">{columnPicker}</div>
          </SheetContent>
        </Sheet>
      ) : (
        <>
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
          {columnsOpen && <div id="column-picker-panel">{columnPicker}</div>}
        </>
      )}

      <SheetContainer
        cols={cols}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        onEditCell={onEditCell}
        selection={selection}
        setSelection={setSelection}
        currentFilters={currentFilters}
        pushSearch={(filtersEncodedNext?: string) =>
          pushSearch({ filters: filtersEncodedNext || undefined, page: undefined })
        }
        q={q}
        isMobile={isMobile}
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
          const blob = new Blob([(r as { csv: string }).csv], { type: "text/csv;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `contatos_${new Date().toISOString().slice(0, 10)}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        }}
        onCopyFormatted={onCopyFormatted}
        isMobile={isMobile}
      />
    </div>
  );
}
