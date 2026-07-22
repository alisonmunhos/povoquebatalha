import { X } from "lucide-react";
import type { CrmFilters } from "@/lib/crm-filters";
import { buildSheetFilterChips } from "@/lib/sheet-filter-chips";

type Props = {
  cols: string[];
  filters: CrmFilters;
  onRemoveColumn: (columnKey: string) => void;
  onClearAll: () => void;
};

export default function SheetActiveFiltersBar({ cols, filters, onRemoveColumn, onClearAll }: Props) {
  const chips = buildSheetFilterChips(cols, filters);
  if (!chips.length) return null;

  return (
    <div className="sheet-active-filters flex flex-wrap items-center gap-2 mb-3 rounded-md border bg-muted/30 px-3 py-2">
      <span className="text-xs font-medium text-muted-foreground shrink-0">Filtros ativos:</span>
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => onRemoveColumn(chip.id)}
          className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5 text-xs hover:bg-muted transition-colors"
          aria-label={`Remover filtro ${chip.label}`}
        >
          <span className="max-w-[220px] truncate">{chip.label}</span>
          <X className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="text-xs text-primary hover:underline ml-auto sm:ml-1"
      >
        Limpar todos os filtros
      </button>
    </div>
  );
}
