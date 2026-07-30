import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-is-mobile";

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
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sincroniza o rascunho apenas ao abrir, para não sobrescrever a edição em andamento.
  useEffect(() => {
    if (open) setDraft(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const draftSet = new Set(draft);
  const selectedSet = new Set(value);
  const selectedLabels = options.filter((o) => selectedSet.has(o.value)).map((o) => o.label);

  function toggle(v: string) {
    const next = new Set(draftSet);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setDraft([...next]);
  }

  function apply() {
    onChange(draft);
    setOpen(false);
  }

  const panel = (
    <Command shouldFilter>
      <CommandInput ref={inputRef} placeholder="Buscar…" />
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b text-xs">
        <span className="text-muted-foreground">
          {draft.length > 0 ? `${draft.length} selecionado(s)` : "Nenhum selecionado"}
        </span>
        <button
          type="button"
          onClick={() => setDraft(options.filter((o) => !o.disabled).map((o) => o.value))}
          className="text-muted-foreground hover:text-foreground"
        >
          Selecionar todos
        </button>
      </div>
      <CommandList className={cn(isMobile && "max-h-[50vh]")}>
        <CommandEmpty>{emptyText}</CommandEmpty>
        <CommandGroup>
          {options.map((o) => {
            const checked = draftSet.has(o.value);
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
                    "flex h-4 w-4 items-center justify-center rounded border shrink-0",
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
      <div className="flex items-center gap-2 border-t bg-card px-2 py-2">
        <button
          type="button"
          onClick={apply}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          Aplicar{draft.length > 0 ? ` (${draft.length})` : ""}
        </button>
        <button
          type="button"
          onClick={() => setDraft([])}
          disabled={draft.length === 0}
          className="rounded-md border px-3 py-1.5 text-xs disabled:opacity-40"
        >
          Limpar
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
    </Command>
  );

  const trigger = (
    <button
      type="button"
      disabled={disabled}
      onClick={isMobile ? () => setOpen(true) : undefined}
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
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Limpar"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
        <ChevronDown className="h-4 w-4 opacity-50" />
      </div>
    </button>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        {open && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
            <div className="absolute inset-x-0 bottom-0 rounded-t-xl border-t bg-popover overflow-hidden">
              {panel}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="p-0 w-[280px]"
        align="start"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {panel}
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
  const inputRef = useRef<HTMLInputElement>(null);
  const cur = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen} modal>
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
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(undefined);
                }}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Limpar"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[280px]"
        align="start"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <Command>
          <CommandInput ref={inputRef} placeholder="Buscar…" />
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
