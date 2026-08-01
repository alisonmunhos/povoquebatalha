import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-is-mobile";
import type { FilterMode } from "@/lib/filter-exclusion";
import {
  MATCH_MODES,
  MATCH_MODE_HELP,
  MATCH_MODE_LABEL,
  describeSelection,
  type MatchMode,
} from "@/lib/filter-match-mode";

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
  /** Legado: quando informado junto de onApply, habilita "esconder os marcados". */
  mode?: FilterMode;
  /** Legado: aplica seleção + modo de uma só vez. */
  onApply?: (values: string[], mode: FilterMode) => void;
  /**
   * Modo de combinação atual (qualquer / todas / somente). Quando informado,
   * o menu mostra os botões de combinação.
   */
  matchMode?: MatchMode;
  /** Valores marcados para ESCONDER (aba "Esconder"). */
  excludeValue?: string[];
  /** Aplica os dois lados + modo de uma vez. Ativa a experiência completa. */
  onApplyFull?: (p: { include: string[]; exclude: string[]; mode: MatchMode }) => void;
};

export function MultiSelectFilter({
  options,
  value,
  onChange,
  placeholder = "Selecionar…",
  emptyText = "Sem opções.",
  disabled,
  className,
  mode,
  onApply,
  matchMode,
  excludeValue,
  onApplyFull,
}: Props) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const advanced = !!onApplyFull;
  const excludable = advanced || (!!onApply && !!mode);

  const [draft, setDraft] = useState<string[]>(value);
  const [draftExclude, setDraftExclude] = useState<string[]>(excludeValue ?? []);
  const [tab, setTab] = useState<"mostrar" | "esconder">("mostrar");
  const [draftMode, setDraftMode] = useState<FilterMode>(mode ?? "include");
  const [draftMatch, setDraftMatch] = useState<MatchMode>(matchMode ?? "qualquer");
  const inputRef = useRef<HTMLInputElement>(null);

  // Sincroniza o rascunho apenas ao abrir, para não sobrescrever a edição em andamento.
  useEffect(() => {
    if (open) {
      const savedMode = matchMode ?? "qualquer";
      // No modo "nenhuma destas" as opções ficam guardadas no lado de exclusão,
      // mas aparecem marcadas na aba "Mostrar" para o usuário editar ali mesmo.
      if (savedMode === "nenhuma") {
        setDraft(excludeValue ?? []);
        setDraftExclude([]);
      } else {
        setDraft(value);
        setDraftExclude(excludeValue ?? []);
      }
      setDraftMode(mode ?? "include");
      setDraftMatch(savedMode);
      setTab("mostrar");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const activeList = advanced && tab === "esconder" ? draftExclude : draft;
  const setActiveList = (next: string[]) => {
    if (advanced && tab === "esconder") setDraftExclude(next);
    else setDraft(next);
  };

  const activeSet = new Set(activeList);
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  const selectedLabels = value.map(labelOf);
  const hiddenCount = excludeValue?.length ?? 0;
  const noneMode = advanced && draftMatch === "nenhuma";
  const overlap = draft.filter((v) => draftExclude.includes(v));

  function toggle(v: string) {
    const next = new Set(activeSet);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    // Um item nunca pode ficar nos dois lados: marcar em um lado desmarca no outro.
    if (advanced && tab === "esconder") {
      setDraftExclude([...next]);
      setDraft(draft.filter((x) => x !== v));
    } else {
      setDraft([...next]);
      setDraftExclude(draftExclude.filter((x) => x !== v));
    }
  }

  function fixOverlap() {
    setDraftExclude(draftExclude.filter((v) => !draft.includes(v)));
  }

  function apply() {
    if (onApplyFull) {
      if (draftMatch === "nenhuma") {
        // "Nenhuma destas": tudo o que foi marcado vira exclusão; nada de inclusão.
        onApplyFull({
          include: [],
          exclude: [...new Set([...draft, ...draftExclude])],
          mode: "nenhuma",
        });
        setOpen(false);
        return;
      }
      // "Somente essas" = tem as marcadas e nada além: as demais opções entram
      // automaticamente no lado de exclusão.
      const includeSet = new Set(draft);
      const autoExclude =
        draftMatch === "somente"
          ? options.filter((o) => !includeSet.has(o.value)).map((o) => o.value)
          : [];
      onApplyFull({
        include: draft,
        exclude: [...new Set([...draftExclude.filter((v) => !includeSet.has(v)), ...autoExclude])],
        mode: draftMatch,
      });
    } else if (onApply) {
      onApply(draft, draftMode);
    } else {
      onChange(draft);
    }
    setOpen(false);
  }

  function clearAll() {
    if (onApplyFull) onApplyFull({ include: [], exclude: [], mode: "qualquer" });
    else if (onApply) onApply([], mode ?? "include");
    else onChange([]);
  }

  const phrase = describeSelection({
    include: draft,
    exclude: draftExclude,
    mode: draftMatch,
    labelOf,
  });

  const panel = (
    // Altura em coluna: a lista rola por dentro e o rodapé com "Aplicar"
    // fica sempre visível, mesmo quando o menu abre no rodapé da tela.
    <Command shouldFilter className="flex flex-col max-h-full min-h-0">
      <CommandInput ref={inputRef} placeholder="Buscar…" />

      {advanced && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b text-xs">
          <button
            type="button"
            onClick={() => setTab("mostrar")}
            className={cn(
              "rounded px-2 py-1 border",
              tab === "mostrar" ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground",
            )}
          >
            Mostrar {draft.length > 0 ? `(${draft.length})` : ""}
          </button>
          <button
            type="button"
            onClick={() => setTab("esconder")}
            className={cn(
              "rounded px-2 py-1 border",
              tab === "esconder" ? "bg-destructive text-destructive-foreground border-destructive" : "text-muted-foreground",
            )}
          >
            Esconder {draftExclude.length > 0 ? `(${draftExclude.length})` : ""}
          </button>
        </div>
      )}

      {advanced && matchMode && tab === "mostrar" && (
        <div className="px-2 py-1.5 border-b">
          <div className="flex items-center gap-1 text-[11px]">
            {MATCH_MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setDraftMatch(m)}
                className={cn(
                  "rounded px-2 py-1 border",
                  draftMatch === m ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground",
                )}
              >
                {MATCH_MODE_LABEL[m]}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">{MATCH_MODE_HELP[draftMatch]}</p>
        </div>
      )}

      {!advanced && excludable && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b text-xs">
          <button
            type="button"
            onClick={() => setDraftMode("include")}
            className={cn(
              "rounded px-2 py-1 border",
              draftMode === "include" ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground",
            )}
          >
            Mostrar os marcados
          </button>
          <button
            type="button"
            onClick={() => setDraftMode("exclude")}
            className={cn(
              "rounded px-2 py-1 border",
              draftMode === "exclude" ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground",
            )}
          >
            Esconder os marcados
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b text-xs">
        <span className="text-muted-foreground">
          {activeList.length > 0 ? `${activeList.length} marcado(s)` : "Nenhum marcado"}
        </span>
        <button
          type="button"
          onClick={() => setActiveList(options.filter((o) => !o.disabled).map((o) => o.value))}
          className="text-muted-foreground hover:text-foreground"
        >
          Marcar todos
        </button>
      </div>
      <CommandList className={cn("flex-1 min-h-0", isMobile ? "max-h-[50vh]" : "max-h-none")}>
        <CommandEmpty>{emptyText}</CommandEmpty>
        <CommandGroup>
          {options.map((o) => {
            const checked = activeSet.has(o.value);
            const isDisabled = !!o.disabled && !checked;
            const otherSide =
              advanced && (tab === "mostrar" ? draftExclude.includes(o.value) : draft.includes(o.value));
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
                    checked
                      ? tab === "esconder" && advanced
                        ? "bg-destructive border-destructive text-destructive-foreground"
                        : "bg-primary border-primary text-primary-foreground"
                      : "border-input",
                  )}
                >
                  {checked && <Check className="h-3 w-3" />}
                </div>
                <span className="flex-1 truncate">{o.label}</span>
                {otherSide && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {tab === "mostrar" ? "escondido" : "mostrado"}
                  </span>
                )}
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

      {advanced && phrase && (
        <p className="shrink-0 border-t bg-muted/40 px-2 py-1.5 text-[10px] text-muted-foreground">{phrase}</p>
      )}

      <div className="shrink-0 flex items-center gap-2 border-t bg-card px-2 py-2">
        <button
          type="button"
          onClick={apply}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          Aplicar
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft([]);
            setDraftExclude([]);
            setDraftMatch("qualquer");
          }}
          disabled={draft.length === 0 && draftExclude.length === 0}
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

  const nothingSelected = value.length === 0 && hiddenCount === 0;
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
        {nothingSelected ? (
          <span className="text-muted-foreground">{placeholder}</span>
        ) : (
          <>
            {!advanced && mode === "exclude" && value.length > 0 && (
              <span className="text-destructive font-medium">exceto </span>
            )}
            {advanced && matchMode === "todos" && value.length > 0 && (
              <span className="font-medium">todas: </span>
            )}
            {advanced && matchMode === "somente" && value.length > 0 && (
              <span className="font-medium">somente: </span>
            )}
            {value.length > 0
              ? value.length <= 2
                ? selectedLabels.join(", ")
                : `${value.length} selecionados`
              : null}
            {hiddenCount > 0 && (
              <span className="text-destructive">
                {value.length > 0 ? " · " : ""}
                {hiddenCount} escondido(s)
              </span>
            )}
          </>
        )}
      </span>
      <div className="flex items-center gap-1 ml-2 shrink-0">
        {!nothingSelected && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              clearAll();
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
        className="p-0 w-[300px] flex flex-col overflow-hidden max-h-[min(70vh,var(--radix-popover-content-available-height))]"
        align="start"
        collisionPadding={16}
        avoidCollisions
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
        className="p-0 w-[280px] flex flex-col overflow-hidden max-h-[min(70vh,var(--radix-popover-content-available-height))]"
        align="start"
        collisionPadding={16}
        avoidCollisions
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <Command className="flex flex-col max-h-full min-h-0">
          <CommandInput ref={inputRef} placeholder="Buscar…" />
          <CommandList className="flex-1 min-h-0 max-h-none">
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
