import { useMemo } from "react";
import { FORM_FIELD_CATALOG, getCatalogField } from "@/lib/form-field-catalog";

export default function ColumnPickerPanel({ chosen, onToggleColumn }: { chosen: string[]; onToggleColumn: (key: string) => void }) {
  const catalog = useMemo(
    () => [...FORM_FIELD_CATALOG.map((f) => f.key), "tags", "cidade", "bairro", "uf", "origem", "lifecycle_status", "created_at"],
    [],
  );
  const systemLabels: Record<string, string> = {
    cidade: "Cidade", bairro: "Bairro", uf: "UF", tags: "Tags",
    origem: "Origem", lifecycle_status: "Status", created_at: "Criado em",
  };
  const readOnlySystem = new Set(["cidade", "bairro", "uf"]);

  return (
    <aside className="column-picker border rounded-md p-3 mb-4 bg-card">
      <div className="text-xs text-muted-foreground mb-2">
        Selecione as colunas que deseja exibir na tabela.
      </div>
      <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-1.5">
        {catalog.map((k) => {
          const f = getCatalogField(k);
          const readOnlyEdit = (f && f.targetColumns.length > 1) || readOnlySystem.has(k);
          const checked = chosen.includes(k);
          const label = f ? f.defaultLabel : (systemLabels[k] ?? k);
          return (
            <li key={k}>
              <label className="flex items-start gap-2 text-sm cursor-pointer py-0.5 hover:bg-muted/40 rounded px-1">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleColumn(k)}
                  className="mt-0.5"
                />
                <span className="flex-1">
                  {label}
                  {readOnlyEdit && (
                    <small className="block text-[10px] text-muted-foreground">sem edição inline</small>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
