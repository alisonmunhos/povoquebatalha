import { getCatalogField } from "@/lib/form-field-catalog";
import type { CrmFilters } from "@/lib/crm-filters";
import { LIFECYCLE_LABEL, PHONE_STATUS_LABEL, WHATSAPP_STATUS_LABEL } from "@/lib/phone-labels";

export type ColumnFilterInfo =
  | { uiType: "text"; filterKey: keyof CrmFilters }
  | { uiType: "boolean"; filterKey: keyof CrmFilters }
  | { uiType: "array"; filterKey: keyof CrmFilters; source?: "catalog" | "server"; serverKey?: string; options?: { value: string; label: string }[] }
  | { uiType: "tag"; filterKey: "tag_ids"; source: "server"; serverKey: "tags" };

function labelsToOptions(m: Record<string, string>): { value: string; label: string }[] {
  return Object.keys(m).map((k) => ({ value: k, label: m[k] }));
}

export function resolveFilterField(columnKey: string): ColumnFilterInfo | null {
  switch (columnKey) {
    case "nome":
      return { uiType: "text", filterKey: "nome" };
    case "nome_social":
      return { uiType: "text", filterKey: "nome_social" };
    case "profissao":
      return { uiType: "text", filterKey: "profissao" };
    case "instituicao":
      return { uiType: "text", filterKey: "instituicao" };
    case "cidade":
      return { uiType: "text", filterKey: "cidade" };
    case "bairro":
      return { uiType: "text", filterKey: "bairro" };
    case "uf":
      return { uiType: "array", filterKey: "ufs", source: "server", serverKey: "ufs" };
    case "tags":
      return { uiType: "tag", filterKey: "tag_ids", source: "server", serverKey: "tags" };
    case "origem":
      return { uiType: "array", filterKey: "origens", source: "server", serverKey: "origens" };
    case "lifecycle_status":
      return { uiType: "array", filterKey: "lifecycle_statuses", source: "catalog", options: labelsToOptions(LIFECYCLE_LABEL) };
    case "faixa_etaria":
      return {
        uiType: "array",
        filterKey: "faixas_etarias",
        options: [
          { value: "16_17", label: "16-17 anos" },
          { value: "18_24", label: "18-24 anos" },
          { value: "25_34", label: "25-34 anos" },
          { value: "35_44", label: "35-44 anos" },
          { value: "45_59", label: "45-59 anos" },
          { value: "60_mais", label: "60+ anos" },
        ],
      };
    case "formas_ajuda":
      return { uiType: "array", filterKey: "formas_ajuda", source: "catalog" };
    case "disponibilidade":
      return { uiType: "array", filterKey: "disponibilidade", source: "catalog" };
    case "quem_indicou":
      return { uiType: "text", filterKey: "quem_indicou" };
    case "rede_social":
      return { uiType: "text", filterKey: "rede_social" };
    case "zona_eleitoral":
      return { uiType: "text", filterKey: "zona_eleitoral" };
    case "como_conheceu":
      return { uiType: "text", filterKey: "como_conheceu" };
    case "whatsapp":
      return { uiType: "array", filterKey: "whatsapp_statuses", source: "catalog", options: labelsToOptions(WHATSAPP_STATUS_LABEL) };
    case "phone":
    case "telefone":
      return { uiType: "array", filterKey: "phone_statuses", source: "catalog", options: labelsToOptions(PHONE_STATUS_LABEL) };
    default: {
      const f = getCatalogField(columnKey);
      if (!f) return null;
      if (f.filterKind === "text") return { uiType: "text", filterKey: f.key as keyof CrmFilters };
      if (f.filterKind === "boolean") return { uiType: "boolean", filterKey: f.key as keyof CrmFilters };
      if (f.filterKind === "multiselect" || f.filterKind === "enum") {
        if (f.options && f.options.length) return { uiType: "array", filterKey: f.key as keyof CrmFilters, source: "catalog", options: f.options.map((o) => ({ value: o.value, label: o.label })) };
        return { uiType: "array", filterKey: f.key as keyof CrmFilters };
      }
      return null;
    }
  }
}

export function applyColumnFilter(current: CrmFilters, column: string, payload: any): CrmFilters {
  const info = resolveFilterField(column);
  if (!info) return current;
  const next = { ...current } as any;
  if (info.uiType === "text") {
    next[info.filterKey] = String(payload ?? "").trim() || undefined;
  } else if (info.uiType === "boolean") {
    if (payload === null || payload === undefined) delete next[info.filterKey];
    else next[info.filterKey] = !!payload;
  } else if (info.uiType === "array" || info.uiType === "tag") {
    const arr = Array.isArray(payload) ? payload : payload == null ? [] : [payload];
    next[info.filterKey] = arr.length ? arr : undefined;
  }
  return next as CrmFilters;
}

export function clearColumnFilter(current: CrmFilters, column: string): CrmFilters {
  const info = resolveFilterField(column);
  if (!info) return current;
  const next = { ...current } as any;
  delete next[info.filterKey];
  return next as CrmFilters;
}
