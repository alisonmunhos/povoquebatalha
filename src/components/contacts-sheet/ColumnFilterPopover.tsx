import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getContactFilterOptions } from "@/lib/crm-filter-options.functions";
import { encodeBase64UrlSafe as encodeFilters } from "@/lib/filters-encoding";
import type { CrmFilters } from "@/lib/crm-filters";
import { EMPTY_FILTER_TOKEN } from "@/lib/crm-filters";
import { resolveFilterField, getColumnFilterValue, applyColumnFilter, clearColumnFilter } from "@/lib/column-filter-mapping";
import { getCatalogField } from "@/lib/form-field-catalog";

export default function ColumnFilterPopover(props: {
  columnKey: string;
  currentFilters: CrmFilters;
  onApplyEncoded: (encodedFilters: string | undefined) => void;
  onClose: () => void;
}) {
  const { columnKey, currentFilters, onApplyEncoded, onClose } = props;
  const info = resolveFilterField(columnKey);
  const optionsFn = useServerFn(getContactFilterOptions);

  const needsServerOptions = !!(info && (info as any).source === "server");
  const serverKey = (info && (info as any).serverKey) ? (info as any).serverKey : undefined;

  const optionsQ = useQuery({
    queryKey: ["contact-filter-options"],
    queryFn: () => optionsFn({ data: {} }),
    staleTime: 5 * 60_000,
    enabled: needsServerOptions,
  });

  const availableOptions: { value: string; label: string; count?: number }[] = useMemo(() => {
    if (!info) return [];
    if ((info as any).source === "catalog" && (info as any).options) {
      return ((info as any).options as { value: string; label: string }[]).map((o) => ({ value: o.value, label: o.label }));
    }
    if (needsServerOptions && optionsQ.data) {
      const d = optionsQ.data as any;
      if (serverKey && d[serverKey]) return d[serverKey].map((o: any) => ({ value: o.value, label: o.label, count: o.count }));
    }
    return [];
  }, [info, optionsQ.data, needsServerOptions, serverKey]);

  const currentValue = getColumnFilterValue(columnKey, currentFilters);
  const [textDraft, setTextDraft] = useState<string>(() => (typeof currentValue === "string" ? currentValue : ""));
  const [arrayDraft, setArrayDraft] = useState<string[]>(() => (Array.isArray(currentValue) ? currentValue : (currentValue ? [String(currentValue)] : [])));
  const [boolDraft, setBoolDraft] = useState<null | boolean>(() => (typeof currentValue === "boolean" ? currentValue : null));

  useEffect(() => {
    if (info?.uiType === "text") setTextDraft(typeof currentValue === "string" ? currentValue : "");
    if (info?.uiType === "array" || info?.uiType === "tag") setArrayDraft(Array.isArray(currentValue) ? currentValue : (currentValue ? [String(currentValue)] : []));
    if (info?.uiType === "boolean") setBoolDraft(typeof currentValue === "boolean" ? currentValue : null);
     
  }, [columnKey, JSON.stringify(currentValue)]);

  if (!info) return null;

  function doApply() {
    let next = { ...(currentFilters ?? {}) } as CrmFilters;
    if (info!.uiType === "text") next = applyColumnFilter(next, columnKey, textDraft?.trim() ? textDraft.trim() : undefined);
    else if (info!.uiType === "boolean") next = applyColumnFilter(next, columnKey, boolDraft);
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

  return (
    <div className="column-filter-popover border rounded-md bg-card shadow-lg p-3 w-64" role="dialog" aria-modal="false">
      <div className="popover-header mb-2">
        <strong className="text-sm">{(getCatalogField(columnKey)?.defaultLabel) ?? columnKey}</strong>
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

        {(info.uiType === "array" || info.uiType === "tag") && (
          <div>
            <div className="flex items-center gap-3 mb-1.5 pb-1.5 border-b text-[11px]">
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => {
                  const all = new Set(arrayDraft);
                  availableOptions.forEach((o) => all.add(o.value));
                  setArrayDraft(Array.from(all));
                }}
              >
                Selecionar tudo
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:underline"
                onClick={() => setArrayDraft([])}
              >
                Limpar seleção
              </button>
            </div>
            <div style={{ maxHeight: 220, overflow: "auto" }}>
              {optionsQ.isLoading && needsServerOptions && <div className="text-sm text-muted-foreground">Carregando…</div>}
              {availableOptions.length === 0 && !optionsQ.isLoading && <div className="text-sm text-muted-foreground">Sem opções</div>}
              {availableOptions.map((o) => {
                const checked = arrayDraft.includes(o.value);
                return (
                  <label key={o.value} className="flex items-center gap-2 text-sm py-0.5">
                    <input type="checkbox" checked={checked} onChange={() => {
                      const set = new Set(arrayDraft);
                      if (set.has(o.value)) set.delete(o.value); else set.add(o.value);
                      setArrayDraft(Array.from(set));
                    }} />
                    <span>{o.label}{typeof o.count === "number" ? ` (${o.count})` : ""}</span>
                  </label>
                );
              })}
            </div>
            <div className="mt-1.5 pt-1.5 border-t">
              <label className="flex items-center gap-2 text-sm py-0.5 italic text-muted-foreground">
                <input
                  type="checkbox"
                  checked={arrayDraft.includes(EMPTY_FILTER_TOKEN)}
                  onChange={() => {
                    const set = new Set(arrayDraft);
                    if (set.has(EMPTY_FILTER_TOKEN)) set.delete(EMPTY_FILTER_TOKEN);
                    else set.add(EMPTY_FILTER_TOKEN);
                    setArrayDraft(Array.from(set));
                  }}
                />
                <span>(Vazio) — sem valor preenchido</span>
              </label>
            </div>
          </div>
        )}

        {info.uiType === "boolean" && (
          <div className="flex flex-col gap-1 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="bool-filter" checked={boolDraft === null} onChange={() => setBoolDraft(null)} /> Qualquer</label>
            <label className="flex items-center gap-2"><input type="radio" name="bool-filter" checked={boolDraft === true} onChange={() => setBoolDraft(true)} /> Sim</label>
            <label className="flex items-center gap-2"><input type="radio" name="bool-filter" checked={boolDraft === false} onChange={() => setBoolDraft(false)} /> Não</label>
          </div>
        )}
      </div>

      <div className="popover-footer flex gap-2 mt-3">
        <button className="text-xs border rounded px-2 py-1" onClick={doApply}>Aplicar</button>
        <button className="text-xs border rounded px-2 py-1" onClick={doClear}>Limpar</button>
        <button className="text-xs text-muted-foreground" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  );
}
