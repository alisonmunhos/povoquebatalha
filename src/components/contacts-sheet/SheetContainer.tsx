import { useState } from "react";
import { createPortal } from "react-dom";
import Cell from "./Cell";
import { getCatalogField } from "@/lib/form-field-catalog";
import ColumnFilterPopover from "./ColumnFilterPopover";
import { resolveFilterField } from "@/lib/column-filter-mapping";
import { Link } from "@tanstack/react-router";
import { Filter } from "lucide-react";

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

export default function SheetContainer({
  cols, rows, total, page, onEditCell, selection, setSelection, currentFilters, pushSearch, q,
}: any) {
  const [openFilterFor, setOpenFilterFor] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const errorMsg = q?.error ? (q.error instanceof Error ? q.error.message : String(q.error)) : null;

  const sel: Set<string> = selection ?? new Set();
  const allOnPage: string[] = rows.map((r: any) => r.contact_id);
  const allChecked = allOnPage.length > 0 && allOnPage.every((id) => sel.has(id));

  function toggleSelection(id: string) {
    if (!setSelection) return;
    const next = new Set(sel);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelection(next);
  }
  function togglePageSelection() {
    if (!setSelection) return;
    const next = new Set(sel);
    if (allChecked) allOnPage.forEach((id) => next.delete(id));
    else allOnPage.forEach((id) => next.add(id));
    setSelection(next);
  }
  function isFilterActiveForColumn(col: string): boolean {
    const info = resolveFilterField(col);
    if (!info) return false;
    const v = (currentFilters as any)?.[info.filterKey];
    if (info.uiType === "text") return typeof v === "string" && v.trim() !== "";
    if (info.uiType === "boolean") return v === true || v === false;
    if (info.uiType === "array" || info.uiType === "tag") return Array.isArray(v) && v.length > 0;
    return false;
  }
  function getActiveFilterValues(col: string): string[] | null {
    const info = resolveFilterField(col);
    if (!info) return null;
    if (info.uiType !== "array" && info.uiType !== "tag") return null;
    const v = (currentFilters as any)?.[info.filterKey];
    if (!Array.isArray(v)) return null;
    const cleaned = v.filter((x: string) => x !== "__EMPTY__");
    return cleaned.length ? cleaned : null;
  }
  function openFilter(col: string, anchor: HTMLElement) {
    const rect = anchor.getBoundingClientRect();
    if (!anchor.isConnected || !Number.isFinite(rect.left) || !Number.isFinite(rect.bottom)) return;
    setAnchorRect(rect);
    setOpenFilterFor((current) => current === col ? null : col);
  }
  function closeFilter() {
    setOpenFilterFor(null);
    setAnchorRect(null);
  }

  return (
    <div className="sheet-container border rounded-md overflow-x-auto bg-card" style={{ position: "relative" }}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-muted/60 sticky top-0 z-10 shadow-[0_1px_0_0_hsl(var(--border))]">
            <th className="p-2 w-10 text-left"><input type="checkbox" checked={allChecked} onChange={togglePageSelection} /></th>
            {cols.map((c: string) => {
              const f = getCatalogField(c);
              const label = f ? f.defaultLabel : (SYSTEM_LABELS[c] ?? c);
              const showFilter = resolveFilterField(c) !== null;
              const active = isFilterActiveForColumn(c);
              return (
                <th key={c} className="p-2 text-left font-medium min-w-[140px] whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
                    {showFilter && (
                      <button
                        type="button"
                        aria-label={`Filtrar ${label}`}
                        aria-expanded={openFilterFor === c}
                        onClick={(event) => openFilter(c, event.currentTarget)}
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
            })}
          </tr>
        </thead>
        <tbody>
          {q.isLoading && (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={`sk-${i}`} className="border-t">
                <td className="p-2"><div className="h-4 w-4 bg-muted rounded animate-pulse" /></td>
                {cols.map((c: string) => (
                  <td key={c} className="p-2"><div className="h-4 bg-muted rounded animate-pulse" style={{ width: `${40 + ((i * 13 + c.length * 7) % 40)}%` }} /></td>
                ))}
              </tr>
            ))
          )}
          {!q.isLoading && errorMsg && <tr><td className="p-4 text-destructive" colSpan={cols.length + 1}>Erro ao carregar: {errorMsg}</td></tr>}
          {!q.isLoading && !errorMsg && rows.length === 0 && (
            <tr><td className="p-8 text-center text-muted-foreground" colSpan={cols.length + 1}>
              <div className="flex flex-col items-center gap-1">
                <span className="text-2xl">🔍</span>
                <span>Nenhum contato encontrado.</span>
                <span className="text-xs">Tente ajustar os filtros das colunas.</span>
              </div>
            </td></tr>
          )}
          {!q.isLoading && !errorMsg && rows.map((r: any, idx: number) => (
            <tr key={r.contact_id} className={`border-t hover:bg-muted/30 transition-colors ${idx % 2 === 1 ? "bg-muted/10" : ""}`}>
              <td className="p-2 align-middle"><input type="checkbox" checked={sel.has(r.contact_id)} onChange={() => toggleSelection(r.contact_id)} /></td>
              {cols.map((col: string) => {
                const field = getCatalogField(col);
                const isPhone = field?.targetColumns.includes("phone_raw") || col === "whatsapp";
                const isMulti = (field?.targetColumns.length ?? 0) > 1;
                const isReadOnlySystem = READ_ONLY_SYSTEM.has(col);
                if (isPhone || isMulti || isReadOnlySystem) {
                  return (
                    <td key={col} className="p-2 min-w-[140px] align-middle">
                      <Link to="/contatos/$id" params={{ id: r.contact_id }} className="text-primary hover:underline">
                        {isMulti ? previewComposite(r[col]) : (r[col] ? String(r[col]) : <span className="text-muted-foreground">—</span>)}
                      </Link>
                    </td>
                  );
                }
                return <td key={col} className="p-0 align-middle"><Cell contactId={r.contact_id} fieldKey={col} value={r[col]} onEdit={onEditCell} /></td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="p-2 text-xs text-muted-foreground border-t flex items-center justify-between">
        <span>Resultados: <strong className="text-foreground">{total}</strong></span>
        <span>Página {page}</span>
      </footer>


      {openFilterFor && typeof document !== "undefined" && (
        createPortal(
          <div
            style={{
              position: "fixed",
              left: Math.min(anchorRect?.left ?? 16, window.innerWidth - 272),
              top: anchorRect?.bottom ?? 16,
              zIndex: 1400,
            }}
          >
            <ColumnFilterPopover columnKey={openFilterFor} currentFilters={currentFilters ?? {}} onApplyEncoded={(encoded) => pushSearch?.(encoded)} onClose={closeFilter} />
          </div>,
          document.body
        )
      )}
    </div>
  );
}

function previewComposite(v: unknown) {
  if (!v) return "—";
  if (typeof v === "object") return Object.values(v as Record<string, any>).filter(Boolean).join(" · ");
  return String(v);
}
