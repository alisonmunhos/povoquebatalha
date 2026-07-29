import { useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type MultiOption = {
  value: string;
  label: string;
  count?: number;
  /** Quando true, a opção aparece mas não pode ser marcada (ex.: sem contatos na base). */
  disabled?: boolean;
  /** Explicação curta mostrada ao lado de uma opção desabilitada. */
  disabledReason?: string;
};

type Props = {
  options: MultiOption[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
};

export function MultiSelectFilter({
  options,
  value,
  onChange,
  placeholder = "Selecionar…",
  emptyText = "Sem opções.",
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(value);
  const selectedLabels = options.filter((o) => selectedSet.has(o.value)).map((o) => o.label);

  function toggle(v: string) {
    const next = new Set(selectedSet);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange([...next]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm text-left disabled:opacity-50",
            className,
          )}
        >
          <span className="truncate">
            {value.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : value.length <= 2 ? (
              selectedLabels.join(", ")
            ) : (
              `${value.length} selecionados`
            )}
          </span>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {value.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange([]);
                }}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Limpar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[280px]" align="start">
        <Command>
          <CommandInput placeholder="Buscar…" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const checked = selectedSet.has(o.value);
                const isDisabled = !!o.disabled && !checked;
                return (
                  <CommandItem
                    key={o.value}
                    value={`${o.label} ${o.value}`}
                    disabled={isDisabled}
                    onSelect={() => {
                      if (isDisabled) return;
                      toggle(o.value);
                    }}
                    className={cn("flex items-center gap-2", isDisabled && "opacity-50 cursor-not-allowed")}
                    title={isDisabled ? (o.disabledReason ?? "Nenhum contato com esta opção") : undefined}
                  >
                    <div
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded border",
                        checked ? "bg-primary border-primary text-primary-foreground" : "border-input",
                      )}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </div>
                    <span className="flex-1 truncate">{o.label}</span>
                    {isDisabled && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {o.disabledReason ?? "sem contatos"}
                      </span>
                    )}
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

type SingleProps = {
  options: MultiOption[];
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function SingleSelectFilter({ options, value, onChange, placeholder = "Selecionar…", disabled, className }: SingleProps) {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm text-left disabled:opacity-50",
            className,
          )}
        >
          <span className="truncate">{cur ? cur.label : <span className="text-muted-foreground">{placeholder}</span>}</span>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {value && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(undefined);
                }}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Limpar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[280px]" align="start">
        <Command>
          <CommandInput placeholder="Buscar…" />
          <CommandList>
            <CommandEmpty>Sem opções.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.value}`}
                  onSelect={() => {
                    onChange(o.value === value ? undefined : o.value);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2"
                >
                  <span className="flex-1 truncate">{o.label}</span>
                  {typeof o.count === "number" && (
                    <span className="text-xs text-muted-foreground tabular-nums">{o.count}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
