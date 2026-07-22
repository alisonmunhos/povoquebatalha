import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getContactFilterOptions } from "@/lib/crm-filter-options.functions";
import { encodeBase64UrlSafe as encodeFilters } from "@/lib/filters-encoding";
import type { CrmFilters } from "@/lib/crm-filters";
import {
  resolveFilterField,
  getColumnFilterValue,
  applyColumnFilter,
  clearColumnFilter,
  type TextContainsFilterValue,
  type DateRangeFilterValue,
} from "@/lib/column-filter-mapping";
import { getCatalogField } from "@/lib/form-field-catalog";
import CheckboxListFilterPanel, { type CheckboxFilterOption } from "./CheckboxListFilterPanel";
import TextContainsFilterPanel from "./TextContainsFilterPanel";
import DateRangeFilterPanel from "./DateRangeFilterPanel";

export default function ColumnFilterPopover(props: {
  columnKey: string;
  currentFilters: CrmFilters;
  onApplyEncoded: (encodedFilters: string | undefined) => void;
  onClose: () => void;
  embedded?: boolean;
}) {
  const { columnKey, currentFilters, onApplyEncoded, onClose, embedded = false } = props;
  const info = resolveFilterField(columnKey);
  const optionsFn = useServerFn(getContactFilterOptions);

  const needsServerOptions = !!(info && (info as { source?: string }).source === "server");
  const serverKey = info && "serverKey" in info ? info.serverKey : undefined;
  const emptyCountKey = info && "emptyCountKey" in info ? info.emptyCountKey : undefined;

  const optionsQ = useQuery({
    queryKey: ["contact-filter-options"],
    queryFn: () => optionsFn({ data: {} }),
    staleTime: 5 * 60_000,
    enabled: needsServerOptions,
  });

  const availableOptions: CheckboxFilterOption[] = useMemo(() => {
    if (!info) return [];

    const catalogFallback =
      "options" in info && info.options
        ? info.options.map((o) => ({ value: o.value, label: o.label }))
        : [];

    if (needsServerOptions && optionsQ.data && serverKey) {
      const d = optionsQ.data as Record<string, unknown>;
      const serverOpts = d[serverKey];
      if (Array.isArray(serverOpts) && serverOpts.length) {
        const serverList = serverOpts as {
          value: string;
          label: string;
          count?: number;
          cor?: string | null;
        }[];
        const byValue = new Map(serverList.map((o) => [o.value, o]));
        const base = catalogFallback.length
          ? catalogFallback
          : serverList.map((o) => ({ value: o.value, label: o.label }));

        return base.map((o) => {
          const fromServer = byValue.get(o.value);
          return {
            value: o.value,
            label: fromServer?.label ?? o.label,
            count: fromServer?.count ?? 0,
            color: fromServer?.cor ?? null,
          };
        });
      }
    }

    return catalogFallback;
  }, [info, optionsQ.data, needsServerOptions, serverKey]);

  const emptyCount = useMemo(() => {
    if (!emptyCountKey || !optionsQ.data) return undefined;
    const n = (optionsQ.data as Record<string, unknown>)[emptyCountKey];
    return typeof n === "number" ? n : undefined;
  }, [emptyCountKey, optionsQ.data]);

  const currentValue = getColumnFilterValue(columnKey, currentFilters);
  const [textDraft, setTextDraft] = useState<string>(() => (typeof currentValue === "string" ? currentValue : ""));
  const [textContainsDraft, setTextContainsDraft] = useState<TextContainsFilterValue>(() =>
    info?.uiType === "textContains"
      ? (currentValue as TextContainsFilterValue)
      : { contains: "", empty: false },
  );
  const [dateRangeDraft, setDateRangeDraft] = useState<DateRangeFilterValue>(() =>
    info?.uiType === "dateRange"
      ? (currentValue as DateRangeFilterValue)
      : { from: "", to: "", quick: "" },
  );
  const [arrayDraft, setArrayDraft] = useState<string[]>(() =>
    Array.isArray(currentValue) ? currentValue : currentValue ? [String(currentValue)] : [],
  );

  useEffect(() => {
    if (info?.uiType === "text") setTextDraft(typeof currentValue === "string" ? currentValue : "");
    if (info?.uiType === "textContains") {
      setTextContainsDraft(
        (currentValue as TextContainsFilterValue) ?? { contains: "", empty: false },
      );
    }
    if (info?.uiType === "dateRange") {
      setDateRangeDraft((currentValue as DateRangeFilterValue) ?? { from: "", to: "", quick: "" });
    }
    if (info?.uiType === "array" || info?.uiType === "tag") {
      setArrayDraft(Array.isArray(currentValue) ? currentValue : currentValue ? [String(currentValue)] : []);
    }
  }, [columnKey, JSON.stringify(currentValue)]);

  if (!info) return null;

  function doApply() {
    let next = { ...(currentFilters ?? {}) } as CrmFilters;
    if (info!.uiType === "text") next = applyColumnFilter(next, columnKey, textDraft?.trim() ? textDraft.trim() : undefined);
    else if (info!.uiType === "textContains") next = applyColumnFilter(next, columnKey, textContainsDraft);
    else if (info!.uiType === "dateRange") next = applyColumnFilter(next, columnKey, dateRangeDraft);
    else if (info!.uiType === "array" || info!.uiType === "tag") next = applyColumnFilter(next, columnKey, arrayDraft);
    const encoded = encodeFilters(next);
    onApplyEncoded(encoded || undefined);
    onClose();
  }

  function doClear() {
    const next = clearColumnFilter(currentFilters, columnKey);
    const encoded = encodeFilters(next);
    onApplyEncoded(encoded || undefined);
    onClose();
  }

  const columnLabel = getCatalogField(columnKey)?.defaultLabel ?? columnKey;
  const isListFilter = info.uiType === "array" || info.uiType === "tag";

  return (
    <div
      className={`column-filter-popover flex flex-col bg-card h-full max-h-full ${
        embedded
          ? "w-full min-h-0 border-0 shadow-none"
          : "w-full border rounded-md shadow-lg"
      }`}
      role="dialog"
      aria-modal={embedded ? "true" : "false"}
    >
      {!embedded ? (
      <div className="popover-header shrink-0 px-3 pt-3 pb-2 border-b">
        <strong className="text-sm">{columnLabel}</strong>
      </div>
      ) : null}

      <div
        className={`popover-body flex-1 min-h-0 ${embedded ? "py-0" : "px-3 py-2"} ${
          isListFilter ? "flex flex-col overflow-hidden" : "overflow-y-auto"
        }`}
      >
        {info.uiType === "text" && (
          <input
            className="border rounded px-2 py-1 text-sm w-full"
            type="text"
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            placeholder="Contém..."
          />
        )}

        {info.uiType === "textContains" && (
          <TextContainsFilterPanel
            contains={textContainsDraft.contains}
            empty={textContainsDraft.empty}
            onContainsChange={(contains) => setTextContainsDraft((prev) => ({ ...prev, contains }))}
            onEmptyChange={(empty) => setTextContainsDraft((prev) => ({ ...prev, empty }))}
            placeholder={info.placeholder}
          />
        )}

        {info.uiType === "dateRange" && (
          <DateRangeFilterPanel
            from={dateRangeDraft.from}
            to={dateRangeDraft.to}
            quick={dateRangeDraft.quick}
            onFromChange={(from) => setDateRangeDraft((prev) => ({ ...prev, from }))}
            onToChange={(to) => setDateRangeDraft((prev) => ({ ...prev, to }))}
            onQuickChange={(quick) => setDateRangeDraft((prev) => ({ ...prev, quick }))}
          />
        )}

        {isListFilter && (
          <CheckboxListFilterPanel
            options={availableOptions}
            selected={arrayDraft}
            onChange={setArrayDraft}
            loading={needsServerOptions && optionsQ.isLoading}
            searchPlaceholder={`Buscar em ${columnLabel.toLowerCase()}…`}
            emptyCount={emptyCount}
            maxHeight="fill"
          />
        )}
      </div>

      <div className="popover-footer shrink-0 flex gap-2 px-3 py-2.5 border-t bg-card">
        <button type="button" className="text-xs border rounded px-2 py-1" onClick={doApply}>
          Aplicar
        </button>
        <button type="button" className="text-xs border rounded px-2 py-1" onClick={doClear}>
          Limpar
        </button>
        <button type="button" className="text-xs text-muted-foreground" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
