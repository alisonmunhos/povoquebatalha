import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type ColumnFilterOption = {
  value: string;
  label: string;
  count?: number;
  color?: string | null;
};

type Props = {
  label: string;
  options: ColumnFilterOption[];
  selected: string[];
  onChange: (v: string[]) => void;
  emptyText?: string;
  align?: "start" | "end" | "center";
  className?: string;
};

/**
 * Cabeçalho de coluna com filtro multi-select em popover.
 * Uso: <th><ColumnFilterHeader label="Cidade" options={...} selected={...} onChange={...} /></th>
 */
export function ColumnFilterHeader({
  label,
  options,
  selected,
  onChange,
  emptyText = "Sem opções.",
  align = "start",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(selected);
  const count = selected.length;
  const hasOptions = options.length > 0;

  function toggle(v: string) {
    const next = new Set(selectedSet);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange([...next]);
  }
  function selectAll() {
    onChange(options.map((o) => o.value));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={!hasOptions}
          className={cn(
            "inline-flex items-center gap-1 hover:text-foreground uppercase tracking-wide text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed",
            count > 0 && "text-primary",
            className,
          )}
        >
          {label}
          {count > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] px-1">
              {count}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[280px]" align={align}>
        <Command>
          <CommandInput placeholder={`Buscar ${label.toLowerCase()}…`} />
          <div className="flex items-center justify-between px-2 py-1.5 border-b text-xs">
            <button
              type="button"
              onClick={selectAll}
              className="text-muted-foreground hover:text-foreground"
            >
              Selecionar todos
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              disabled={count === 0}
              className="text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              Limpar
            </button>
          </div>
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const checked = selectedSet.has(o.value);
                return (
                  <CommandItem
                    key={o.value}
                    value={`${o.label} ${o.value}`}
                    onSelect={() => toggle(o.value)}
                    className="flex items-center gap-2"
                  >
                    <div
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded border shrink-0",
                        checked ? "bg-primary border-primary text-primary-foreground" : "border-input",
                      )}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </div>
                    {o.color && (
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: o.color }}
                      />
                    )}
                    <span className="flex-1 truncate normal-case">{o.label}</span>
                    {typeof o.count === "number" && (
                      <span className="text-xs text-muted-foreground tabular-nums">{o.count}</span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

type SortState = "asc" | "desc" | "none";

type SortProps = {
  label: string;
  state: SortState;
  onCycle: () => void;
  className?: string;
};

/**
 * Cabeçalho ordenável (asc → desc → none).
 */
export function ColumnSortHeader({ label, state, onCycle, className }: SortProps) {
  const Icon = state === "asc" ? ArrowUp : state === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={onCycle}
      className={cn(
        "inline-flex items-center gap-1 hover:text-foreground uppercase tracking-wide text-xs font-medium",
        state !== "none" && "text-primary",
        className,
      )}
    >
      {label}
      <Icon className="h-3 w-3 opacity-70" />
    </button>
  );
}
