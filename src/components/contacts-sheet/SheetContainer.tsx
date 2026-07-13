import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import Cell from "./Cell";
import { getCatalogField } from "@/lib/form-field-catalog";
import ColumnFilterPopover from "./ColumnFilterPopover";
import { resolveFilterField } from "@/lib/column-filter-mapping";
import { Link } from "@tanstack/react-router";

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
  const headerRefs = useRef<Record<string, HTMLTableCellElement | null>>({});

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
  function openFilter(col: string) {
    const el = headerRefs.current[col];
    setAnchorRect(el ? el.getBoundingClientRect() : null);
    setOpenFilterFor(col);
  }
  function closeFilter() {
    setOpenFilterFor(null);
    setAnchorRect(null);
  }

  return (
    <div className="sheet-container border rounded-md overflow-x-auto" style={{ position: "relative" }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/40 sticky top-0">
            <th className="p-2 w-8"><input type="checkbox" checked={allChecked} onChange={togglePageSelection} /></th>
            {cols.map((c: string) => {
              const f = getCatalogField(c);
              const label = f ? f.defaultLabel : (SYSTEM_LABELS[c] ?? c);
              const showFilter = resolveFilterField(c) !== null;
              const active = isFilterActiveForColumn(c);
              return (
                <th key={c} ref={(el) => { headerRefs.current[c] = el; }} className="p-2 text-left font-medium min-w-[140px]">
                  <div className="flex items-center gap-2">
                    <span>{label}</span>
                    {showFilter && (
                      <button aria-label={`Filtrar ${label}`} onClick={() => openFilter(c)} className={active ? "text-primary" : "text-muted-foreground"}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5h18l-7 7v7l-4-2v-5L3 5z" /></svg>
                      </button>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {q.isLoading && <tr><td className="p-4 text-muted-foreground" colSpan={cols.length + 1}>Carregando…</td></tr>}
          {!q.isLoading && errorMsg && <tr><td className="p-4 text-destructive" colSpan={cols.length + 1}>Erro ao carregar: {errorMsg}</td></tr>}
          {!q.isLoading && !errorMsg && rows.length === 0 && <tr><td className="p-4 text-muted-foreground" colSpan={cols.length + 1}>Nenhum contato encontrado.</td></tr>}
          {!errorMsg && rows.map((r: any) => (
            <tr key={r.contact_id} className="border-t hover:bg-muted/20">
              <td className="p-2"><input type="checkbox" checked={sel.has(r.contact_id)} onChange={() => toggleSelection(r.contact_id)} /></td>
              {cols.map((col: string) => {
                const field = getCatalogField(col);
                const isPhone = field?.targetColumns.includes("phone_raw") || col === "whatsapp";
                const isMulti = (field?.targetColumns.length ?? 0) > 1;
                const isReadOnlySystem = READ_ONLY_SYSTEM.has(col);
                if (isPhone || isMulti || isReadOnlySystem) {
                  return (
                    <td key={col} className="p-2 min-w-[140px]">
                      <Link to="/contatos/$id" params={{ id: r.contact_id }} className="text-primary underline">
                        {isMulti ? previewComposite(r[col]) : String(r[col] ?? "—")}
                      </Link>
                    </td>
                  );
                }
                return <td key={col} className="p-0"><Cell contactId={r.contact_id} fieldKey={col} value={r[col]} onEdit={onEditCell} /></td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="p-2 text-sm text-muted-foreground">Resultados: {total} — Página {page}</footer>

      {openFilterFor && typeof document !== "undefined" && (
        createPortal(
          <div
            style={{
              position: "fixed",
              left: anchorRect ? anchorRect.left : 100,
              top: anchorRect ? anchorRect.bottom : 200,
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
  if (typeof v === "object") return Object.values(v as Record<string, any>).filter(Boolean).join(", ");
  return String(v);
}
