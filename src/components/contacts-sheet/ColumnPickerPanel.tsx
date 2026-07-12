import { useMemo } from "react";
import { FORM_FIELD_CATALOG, getCatalogField } from "@/lib/form-field-catalog";

export default function ColumnPickerPanel({ chosen, onToggleColumn }: { chosen: string[]; onToggleColumn: (key: string) => void }) {
  const catalog = useMemo(() => [...FORM_FIELD_CATALOG.map((f) => f.key), "tags", "origem", "lifecycle_status", "created_at"], []);
  return (
    <aside className="column-picker border rounded-md p-3 mb-4">
      <div className="hint text-sm text-muted-foreground mb-2">Selecionar colunas (aviso a partir de 12)</div>
      <ul className="grid grid-cols-2 md:grid-cols-4 gap-1">
        {catalog.map((k) => {
          const f = getCatalogField(k);
          const readOnlyEdit = f && f.targetColumns.length > 1;
          const checked = chosen.includes(k);
          return (
            <li key={k}>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={checked} onChange={() => onToggleColumn(k)} />
                <span>{f ? f.defaultLabel : k}</span>
                {readOnlyEdit && <small className="text-muted-foreground"> (sem edição inline)</small>}
              </label>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
