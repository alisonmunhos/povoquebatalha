import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getContactFilterOptions } from "@/lib/crm-filter-options.functions";
import { encodeBase64UrlSafe as encodeFilters } from "@/lib/filters-encoding";
import type { CrmFilters } from "@/lib/crm-filters";
import { resolveFilterField, getColumnFilterValue, applyColumnFilter, clearColumnFilter } from "@/lib/column-filter-mapping";
import { getCatalogField } from "@/lib/form-field-catalog";
import CheckboxListFilterPanel, { type CheckboxFilterOption } from "./CheckboxListFilterPanel";

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
  const [arrayDraft, setArrayDraft] = useState<string[]>(() =>
    Array.isArray(currentValue) ? currentValue : currentValue ? [String(currentValue)] : [],
  );

  useEffect(() => {
    if (info?.uiType === "text") setTextDraft(typeof currentValue === "string" ? currentValue : "");
    if (info?.uiType === "array" || info?.uiType === "tag") {
      setArrayDraft(Array.isArray(currentValue) ? currentValue : currentValue ? [String(currentValue)] : []);
    }
  }, [columnKey, JSON.stringify(currentValue)]);

  if (!info) return null;

  function doApply() {
    let next = { ...(currentFilters ?? {}) } as CrmFilters;
    if (info!.uiType === "text") next = applyColumnFilter(next, columnKey, textDraft?.trim() ? textDraft.trim() : undefined);
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
      className={`column-filter-popover border rounded-md bg-card shadow-lg p-3 ${embedded ? "w-full border-0 shadow-none" : "w-72"}`}
      role="dialog"
      aria-modal={embedded ? "true" : "false"}
    >
      <div className="popover-header mb-2">
        <strong className="text-sm">{columnLabel}</strong>
      </div>

      <div className="popover-body">
        {info.uiType === "text" && (
          <input
            className="border rounded px-2 py-1 text-sm w-full"
            type="text"
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            placeholder={columnKey === "created_at" ? "AAAA, AAAA-MM ou AAAA-MM-DD" : "Contém..."}
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
          />
        )}
      </div>

      <div className="popover-footer flex gap-2 mt-3">
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
