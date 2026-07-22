import { useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import Cell from "./Cell";
import { getCatalogField } from "@/lib/form-field-catalog";
import ColumnFilterPopover from "./ColumnFilterPopover";
import { resolveFilterField, isColumnFilterActive } from "@/lib/column-filter-mapping";
import { Link } from "@tanstack/react-router";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  SHEET_PAGE_SIZES,
  SHEET_ALL_MAX,
  type SheetPageSizeOption,
  mobileColumnWidthClass,
  mobileTableIsWide,
} from "@/lib/contacts-sheet.constants";

const SYSTEM_LABELS: Record<string, string> = {
  cidade: "Cidade",
  bairro: "Bairro",
  uf: "UF",
  tags: "Tags",
  origem: "Origem",
  lifecycle_status: "Status",
  created_at: "Criado em",
};
const READ_ONLY_SYSTEM = new Set(["cidade", "bairro", "uf"]);

const ROW_HEIGHT = 41;
const VIRTUAL_VIEWPORT_HEIGHT = 560;

type ContactRow = { contact_id: string; [col: string]: unknown };

type SheetContainerProps = {
  cols: string[];
  rows: ContactRow[];
  total: number;
  page: number;
  pageSize: SheetPageSizeOption;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: SheetPageSizeOption) => void;
  onEditCell: (contactId: string, fieldKey: string, newValue: unknown) => Promise<unknown>;
  selection: Set<string>;
  setSelection: (s: Set<string>) => void;
  currentFilters: Record<string, unknown>;
  pushSearch: (filtersEncodedNext?: string) => void;
  q: { isLoading?: boolean; error?: unknown };
  isMobile?: boolean;
};

export default function SheetContainer({
  cols,
  rows,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onEditCell,
  selection,
  setSelection,
  currentFilters,
  pushSearch,
  q,
  isMobile = false,
}: SheetContainerProps) {
  const [openFilterFor, setOpenFilterFor] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const errorMsg = q?.error
    ? q.error instanceof Error
      ? q.error.message
      : typeof q.error === "object" && q.error && "message" in q.error
        ? String((q.error as { message: unknown }).message)
        : String(q.error)
    : null;

  const sel = selection ?? new Set<string>();
  const allOnPage = rows.map((r) => r.contact_id);
  const allChecked = allOnPage.length > 0 && allOnPage.every((id) => sel.has(id));

  const effectiveSize = pageSize === "all" ? Math.min(total, SHEET_ALL_MAX) : pageSize;
  const totalPages = pageSize === "all" ? 1 : Math.max(1, Math.ceil(total / effectiveSize));
  const showPagination = pageSize !== "all" && total > effectiveSize;
  const wideMobileTable = mobileTableIsWide(isMobile, cols.length);
  const useVirtualization = !isMobile;

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    enabled: useVirtualization,
  });

  function toggleSelection(id: string) {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelection(next);
  }

  function togglePageSelection() {
    const next = new Set(sel);
    if (allChecked) allOnPage.forEach((id) => next.delete(id));
    else allOnPage.forEach((id) => next.add(id));
    setSelection(next);
  }

  function isFilterActiveForColumn(col: string): boolean {
    return isColumnFilterActive(col, currentFilters ?? {});
  }

  function getActiveFilterValues(col: string): string[] | null {
    const info = resolveFilterField(col);
    if (!info) return null;
    if (info.uiType !== "array" && info.uiType !== "tag") return null;
    const v = (currentFilters as Record<string, unknown>)?.[info.filterKey];
    if (!Array.isArray(v)) return null;
    const cleaned = v.filter((x: string) => x !== "__EMPTY__");
    return cleaned.length ? cleaned : null;
  }

  function openFilter(col: string, anchor: HTMLElement) {
    if (isMobile) {
      setOpenFilterFor((current) => (current === col ? null : col));
      return;
    }
    const rect = anchor.getBoundingClientRect();
    if (!anchor.isConnected || !Number.isFinite(rect.left) || !Number.isFinite(rect.bottom)) return;
    setAnchorRect(rect);
    setOpenFilterFor((current) => (current === col ? null : col));
  }

  function closeFilter() {
    setOpenFilterFor(null);
    setAnchorRect(null);
  }

  function rowBgClass(idx: number): string {
    return idx % 2 === 1 ? "bg-muted/10" : "bg-card";
  }

  function renderHeaderCell(col: string) {
    const f = getCatalogField(col);
    const label = f ? f.defaultLabel : (SYSTEM_LABELS[col] ?? col);
    const showFilter = resolveFilterField(col) !== null;
    const active = isFilterActiveForColumn(col);
    const widthClass = isMobile ? mobileColumnWidthClass(cols.length) : "min-w-[140px]";
    return (
      <th key={col} className={`p-2 text-left font-medium whitespace-nowrap bg-muted/60 ${widthClass}`}>
        <div className="flex items-center gap-1.5">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
          {showFilter && (
            <button
              type="button"
              aria-label={`Filtrar ${label}`}
              aria-expanded={openFilterFor === col}
              onClick={(event) => openFilter(col, event.currentTarget)}
              className={`inline-flex items-center justify-center w-6 h-6 rounded transition-colors ${
                active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </th>
    );
  }

  function renderDataCell(r: ContactRow, col: string) {
    const field = getCatalogField(col);
    const isPhone = field?.targetColumns.includes("phone_raw") || col === "whatsapp";
    const isMulti = (field?.targetColumns.length ?? 0) > 1;
    const isReadOnlySystem = READ_ONLY_SYSTEM.has(col);
    const widthClass = isMobile ? mobileColumnWidthClass(cols.length) : "min-w-[140px]";

    if (isPhone || isMulti || isReadOnlySystem) {
      return (
        <td key={col} className={`p-2 align-middle ${widthClass}`}>
          <Link to="/contatos/$id" params={{ id: r.contact_id }} className="text-primary hover:underline">
            {isMulti ? previewComposite(r[col]) : (r[col] ? String(r[col]) : <span className="text-muted-foreground">—</span>)}
          </Link>
        </td>
      );
    }
    return (
      <td key={col} className={`p-0 align-middle ${widthClass}`}>
        <Cell
          contactId={r.contact_id}
          fieldKey={col}
          value={r[col]}
          onEdit={onEditCell}
          activeFilterValues={getActiveFilterValues(col)}
        />
      </td>
    );
  }

  function renderRow(r: ContactRow, idx: number, style?: CSSProperties) {
    return (
      <tr
        key={r.contact_id}
        style={style}
        className={`border-t hover:bg-muted/30 transition-colors ${rowBgClass(idx)}`}
      >
        <td className="p-2 align-middle w-10">
          <input type="checkbox" checked={sel.has(r.contact_id)} onChange={() => toggleSelection(r.contact_id)} />
        </td>
        {cols.map((col) => renderDataCell(r, col))}
      </tr>
    );
  }

  function renderBodyRows() {
    if (q.isLoading) {
      return Array.from({ length: 5 }).map((_, i) => (
        <tr key={`sk-${i}`} className="border-t">
          <td className="p-2">
            <div className="h-4 w-4 bg-muted rounded animate-pulse" />
          </td>
          {cols.map((c) => (
            <td key={c} className="p-2">
              <div
                className="h-4 bg-muted rounded animate-pulse"
                style={{ width: `${40 + ((i * 13 + c.length * 7) % 40)}%` }}
              />
            </td>
          ))}
        </tr>
      ));
    }

    if (errorMsg) {
      return (
        <tr>
          <td className="p-4 text-destructive" colSpan={cols.length + 1}>
            Erro ao carregar: {errorMsg}
          </td>
        </tr>
      );
    }

    if (rows.length === 0) {
      return (
        <tr>
          <td className="p-8 text-center text-muted-foreground" colSpan={cols.length + 1}>
            <div className="flex flex-col items-center gap-1">
              <span className="text-2xl">🔍</span>
              <span>Nenhum contato encontrado.</span>
              <span className="text-xs">Tente ajustar os filtros das colunas.</span>
            </div>
          </td>
        </tr>
      );
    }

    if (useVirtualization) {
      return (
        <>
          <tr aria-hidden style={{ height: rowVirtualizer.getVirtualItems()[0]?.start ?? 0 }}>
            <td colSpan={cols.length + 1} />
          </tr>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const r = rows[virtualRow.index];
            return renderRow(r, virtualRow.index, { height: `${virtualRow.size}px` });
          })}
          <tr
            aria-hidden
            style={{
              height:
                rowVirtualizer.getTotalSize() -
                (rowVirtualizer.getVirtualItems().at(-1)?.end ?? 0),
            }}
          >
            <td colSpan={cols.length + 1} />
          </tr>
        </>
      );
    }

    return rows.map((r, idx) => renderRow(r, idx));
  }

  const filterPopover = openFilterFor ? (
    <ColumnFilterPopover
      columnKey={openFilterFor}
      currentFilters={currentFilters ?? {}}
      onApplyEncoded={(encoded) => pushSearch?.(encoded)}
      onClose={closeFilter}
      embedded={isMobile}
    />
  ) : null;

  return (
    <div className="sheet-container border rounded-md bg-card flex flex-col" style={{ position: "relative" }}>
      <div
        ref={scrollRef}
        className={
          isMobile
            ? "overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]"
            : "overflow-auto"
        }
        style={isMobile ? undefined : { maxHeight: VIRTUAL_VIEWPORT_HEIGHT }}
      >
        <table
          className={`text-sm border-collapse ${
            wideMobileTable || (!isMobile && cols.length > 6) ? "min-w-max w-max" : "w-full"
          }`}
        >
          <thead>
            <tr className={`bg-muted/60 shadow-[0_1px_0_0_hsl(var(--border))] ${!isMobile ? "sticky top-0 z-10" : ""}`}>
              <th className="p-2 w-10 text-left bg-muted/60">
                <input type="checkbox" checked={allChecked} onChange={togglePageSelection} />
              </th>
              {cols.map((c) => renderHeaderCell(c))}
            </tr>
          </thead>
          <tbody>{renderBodyRows()}</tbody>
        </table>
      </div>

      <footer className="p-2 text-xs text-muted-foreground border-t flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span>
            Página {page} de {totalPages} · <strong className="text-foreground">{total}</strong> resultados
          </span>
          <span className="hidden sm:inline text-muted-foreground">|</span>
          <label className="flex items-center gap-1.5">
            <span>Exibir</span>
            <select
              value={pageSize}
              onChange={(e) => {
                const raw = e.target.value;
                onPageSizeChange(raw === "all" ? "all" : (Number(raw) as SheetPageSizeOption));
              }}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
            >
              {SHEET_PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              {total <= SHEET_ALL_MAX && <option value="all">Todos (até {SHEET_ALL_MAX})</option>}
            </select>
          </label>
          {total > SHEET_ALL_MAX && (
            <span className="text-[10px] text-muted-foreground">
              Use exportar CSV para mais de {SHEET_ALL_MAX}.
            </span>
          )}
        </div>
        {showPagination && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => onPageChange(Math.max(1, page - 1))}
            >
              Anterior
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Próxima
            </Button>
          </div>
        )}
      </footer>

      {isMobile ? (
        <Drawer open={!!openFilterFor} onOpenChange={(open) => !open && closeFilter()}>
          <DrawerContent className="max-h-[85vh]">
            <DrawerHeader>
              <DrawerTitle>Filtrar coluna</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-6 overflow-y-auto">{filterPopover}</div>
          </DrawerContent>
        </Drawer>
      ) : (
        openFilterFor &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              left: Math.min(anchorRect?.left ?? 16, window.innerWidth - 272),
              top: anchorRect?.bottom ?? 16,
              zIndex: 1400,
            }}
          >
            {filterPopover}
          </div>,
          document.body,
        )
      )}
    </div>
  );
}

function previewComposite(v: unknown) {
  if (!v) return "—";
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).filter(Boolean).join(" · ");
  return String(v);
}
