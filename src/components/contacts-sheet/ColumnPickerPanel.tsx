import { useMemo } from "react";
import { FORM_FIELD_CATALOG, getCatalogField } from "@/lib/form-field-catalog";
import { MOBILE_MAX_COLUMNS } from "@/lib/contacts-sheet.constants";

export default function ColumnPickerPanel({
  chosen,
  onToggleColumn,
  isMobile = false,
}: {
  chosen: string[];
  onToggleColumn: (key: string) => void;
  isMobile?: boolean;
}) {
  const catalog = useMemo(
    () => [...FORM_FIELD_CATALOG.map((f) => f.key), "tags", "cidade", "bairro", "uf", "origem", "lifecycle_status", "created_at"],
    [],
  );
  const systemLabels: Record<string, string> = {
    cidade: "Cidade", bairro: "Bairro", uf: "UF", tags: "Tags",
    origem: "Origem", lifecycle_status: "Status", created_at: "Criado em",
  };
  const readOnlySystem = new Set(["cidade", "bairro", "uf"]);
  const atMobileLimit = isMobile && chosen.length >= MOBILE_MAX_COLUMNS;

  return (
    <aside className="column-picker border-0 md:border rounded-md p-0 md:p-3 mb-0 md:mb-4 bg-card">
      <div className="text-xs text-muted-foreground mb-2">
        {isMobile
          ? `Escolha de 1 a ${MOBILE_MAX_COLUMNS} colunas (${chosen.length}/${MOBILE_MAX_COLUMNS}).`
          : "Selecione as colunas que deseja exibir na tabela."}
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-1.5">
        {catalog.map((k) => {
          const f = getCatalogField(k);
          const readOnlyEdit = (f && f.targetColumns.length > 1) || readOnlySystem.has(k);
          const checked = chosen.includes(k);
          const disabled = isMobile && !checked && atMobileLimit;
          const label = f ? f.defaultLabel : (systemLabels[k] ?? k);
          return (
            <li key={k}>
              <label
                className={`flex items-start gap-2 text-sm py-0.5 rounded px-1 ${
                  disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-muted/40"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
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
