import { useMemo, useState } from "react";
import { EMPTY_FILTER_TOKEN } from "@/lib/crm-filters";

export type CheckboxFilterOption = {
  value: string;
  label: string;
  count?: number;
  color?: string | null;
};

function normSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

type Props = {
  options: CheckboxFilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  showEmpty?: boolean;
  emptyLabel?: string;
  emptyCount?: number;
  loading?: boolean;
  searchPlaceholder?: string;
  maxHeight?: number;
};

export default function CheckboxListFilterPanel({
  options,
  selected,
  onChange,
  showEmpty = true,
  emptyLabel = "(Vazio) — sem valor preenchido",
  emptyCount,
  loading = false,
  searchPlaceholder = "Buscar na lista…",
  maxHeight = 220,
}: Props) {
  const [search, setSearch] = useState("");

  const filteredOptions = useMemo(() => {
    const q = normSearch(search);
    if (!q) return options;
    return options.filter((o) => normSearch(o.label).includes(q) || normSearch(o.value).includes(q));
  }, [options, search]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  function toggle(value: string) {
    const next = new Set(selectedSet);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(Array.from(next));
  }

  function selectAllVisible() {
    const next = new Set(selectedSet);
    for (const o of filteredOptions) next.add(o.value);
    if (showEmpty && !search.trim()) next.add(EMPTY_FILTER_TOKEN);
    onChange(Array.from(next));
  }

  function deselectAll() {
    onChange([]);
  }

  return (
    <div className="checkbox-list-filter-panel">
      <input
        className="border rounded px-2 py-1 text-sm w-full mb-2"
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={searchPlaceholder}
        aria-label="Buscar opções do filtro"
      />

      <div className="flex items-center gap-3 mb-1.5 pb-1.5 border-b text-[11px]">
        <button type="button" className="text-primary hover:underline" onClick={selectAllVisible}>
          Marcar tudo
        </button>
        <button type="button" className="text-muted-foreground hover:underline" onClick={deselectAll}>
          Desmarcar tudo
        </button>
      </div>

      <div style={{ maxHeight, overflow: "auto" }}>
        {loading && <div className="text-sm text-muted-foreground py-1">Carregando…</div>}
        {!loading && filteredOptions.length === 0 && (
          <div className="text-sm text-muted-foreground py-1">
            {search.trim() ? "Nenhuma opção encontrada." : "Sem opções"}
          </div>
        )}
        {filteredOptions.map((o) => {
          const checked = selectedSet.has(o.value);
          return (
            <label key={o.value} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer">
              <input type="checkbox" checked={checked} onChange={() => toggle(o.value)} />
              {o.color ? (
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: o.color }} />
              ) : null}
              <span className="flex-1 min-w-0 truncate">
                {o.label}
                {typeof o.count === "number" ? ` (${o.count})` : ""}
              </span>
            </label>
          );
        })}
      </div>

      {showEmpty ? (
        <div className="mt-1.5 pt-1.5 border-t">
          <label className="flex items-center gap-2 text-sm py-0.5 italic text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={selectedSet.has(EMPTY_FILTER_TOKEN)}
              onChange={() => toggle(EMPTY_FILTER_TOKEN)}
            />
            <span>
              {emptyLabel}
              {typeof emptyCount === "number" ? ` (${emptyCount})` : ""}
            </span>
          </label>
        </div>
      ) : null}
    </div>
  );
}
