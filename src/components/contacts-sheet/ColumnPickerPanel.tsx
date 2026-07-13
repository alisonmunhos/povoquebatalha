import { useMemo, useState } from "react";
import { FORM_FIELD_CATALOG, getCatalogField } from "@/lib/form-field-catalog";

export default function ColumnPickerPanel({ chosen, onToggleColumn }: { chosen: string[]; onToggleColumn: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const catalog = useMemo(() => [...FORM_FIELD_CATALOG.map((f) => f.key), "tags", "cidade", "bairro", "uf", "origem", "lifecycle_status", "created_at"], []);
  const systemLabels: Record<string, string> = { cidade: "Cidade", bairro: "Bairro", uf: "UF", tags: "Tags", origem: "Origem", lifecycle_status: "Status", created_at: "Criado em" };
  const readOnlySystem = new Set(["cidade", "bairro", "uf"]);
  return (
    <aside className="column-picker border rounded-md p-3 mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-2 text-sm font-medium flex items-center gap-1"
        aria-expanded={open}
      >
        Colunas {open ? "▴" : "▾"}
      </button>
      {open && (
        <>
          <div className="hint text-sm text-muted-foreground mb-2">Selecionar colunas (aviso a partir de 12)</div>
          <ul className="grid grid-cols-2 md:grid-cols-4 gap-1">
            {catalog.map((k) => {
              const f = getCatalogField(k);
              const readOnlyEdit = (f && f.targetColumns.length > 1) || readOnlySystem.has(k);
              const checked = chosen.includes(k);
              const label = f ? f.defaultLabel : (systemLabels[k] ?? k);
              return (
                <li key={k}>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={checked} onChange={() => onToggleColumn(k)} />
                    <span>{label}</span>
                    {readOnlyEdit && <small className="text-muted-foreground"> (sem edição inline)</small>}
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </aside>
  );
}
