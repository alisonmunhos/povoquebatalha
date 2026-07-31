import { getCatalogField } from "@/lib/form-field-catalog";
import type { CrmFilters } from "@/lib/crm-filters";
import { EMPTY_FILTER_TOKEN } from "@/lib/crm-filters";
import { LIFECYCLE_LABEL } from "@/lib/phone-labels";
import {
  clearColumnFilter,
  getColumnFilterValue,
  getColumnFilterMode,
  isColumnFilterActive,
  resolveFilterField,
  type DateRangeFilterValue,
  type TextContainsFilterValue,
} from "@/lib/column-filter-mapping";

const SYSTEM_LABELS: Record<string, string> = {
  cidade: "Cidade",
  bairro: "Bairro",
  uf: "UF",
  tags: "Tags",
  origem: "Origem",
  lifecycle_status: "Status",
  created_at: "Criado em",
};

export type SheetFilterChip = {
  id: string;
  label: string;
};

function columnLabel(columnKey: string): string {
  return getCatalogField(columnKey)?.defaultLabel ?? SYSTEM_LABELS[columnKey] ?? columnKey;
}

function summarizeFilterValue(columnKey: string, value: unknown): string {
  const info = resolveFilterField(columnKey);
  if (!info || value == null) return "";

  if (info.uiType === "textContains") {
    const v = value as TextContainsFilterValue;
    const parts: string[] = [];
    if (v.contains.trim()) parts.push(`contém “${v.contains.trim()}”`);
    if (v.empty) parts.push("(Vazio)");
    return parts.join(" · ");
  }

  if (info.uiType === "dateRange") {
    const d = value as DateRangeFilterValue;
    const parts: string[] = [];
    if (d.from) parts.push(`de ${formatBrDate(d.from)}`);
    if (d.to) parts.push(`até ${formatBrDate(d.to)}`);
    if (d.quick.trim()) parts.push(d.quick.trim());
    return parts.join(" · ");
  }

  if (info.uiType === "array" || info.uiType === "tag") {
    const arr = Array.isArray(value) ? value : [];
    if (!arr.length) return "";
    const labels = arr.map((v) => {
      if (v === EMPTY_FILTER_TOKEN) return "(Vazio)";
      if (columnKey === "consentimento") return v === "sim" ? "Sim" : v === "nao" ? "Não" : v;
      if (columnKey === "lifecycle_status") return LIFECYCLE_LABEL[v] ?? v;
      if (v === "true") return "Sim";
      if (v === "false") return "Não";
      return v;
    });
    if (labels.length <= 2) return labels.join(", ");
    return `${labels.length} selecionados`;
  }

  if (info.uiType === "text" && typeof value === "string") {
    return `contém “${value.trim()}”`;
  }

  return String(value);
}

function formatBrDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** Lista chips legíveis para filtros ativos nas colunas visíveis. */
export function buildSheetFilterChips(cols: string[], filters: CrmFilters): SheetFilterChip[] {
  return cols
    .filter((col) => isColumnFilterActive(col, filters))
    .map((col) => {
      const prefix = getColumnFilterMode(col, filters) === "exclude" ? "exceto " : "";
      return {
        id: col,
        label: `${columnLabel(col)}: ${prefix}${summarizeFilterValue(col, getColumnFilterValue(col, filters))}`,
      };
    });
}

export function hasActiveSheetFilters(cols: string[], filters: CrmFilters): boolean {
  return buildSheetFilterChips(cols, filters).length > 0;
}

/** Remove um filtro de coluna mantendo archived padrão. */
export function removeSheetFilterChip(filters: CrmFilters, columnKey: string): CrmFilters {
  return clearColumnFilter(filters, columnKey);
}

/** Zera todos os filtros da planilha (mantém só “não arquivados”). */
export function clearAllSheetFilters(): CrmFilters {
  return { archived: "nao" };
}
