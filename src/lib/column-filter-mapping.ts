// src/lib/column-filter-mapping.ts
import { getCatalogField } from "@/lib/form-field-catalog";
import type { CrmFilters } from "@/lib/crm-filters";
import { EMPTY_FILTER_TOKEN } from "@/lib/crm-filters";
import { LIFECYCLE_LABEL } from "@/lib/phone-labels";

const FAIXA_ETARIA_OPTIONS = [
  { value: "16_17", label: "16-17 anos" },
  { value: "18_24", label: "18-24 anos" },
  { value: "25_34", label: "25-34 anos" },
  { value: "35_44", label: "35-44 anos" },
  { value: "45_59", label: "45-59 anos" },
  { value: "60_mais", label: "60+ anos" },
] as const;

export type ColumnFilterInfo =
  | { uiType: "text"; filterKey: keyof CrmFilters }
  | { uiType: "array"; filterKey: keyof CrmFilters; source?: "catalog" | "server"; serverKey?: string; options?: { value: string; label: string }[]; emptyCountKey?: string }
  | { uiType: "tag"; filterKey: "tag_ids"; source: "server"; serverKey: "tags" };

function labelsToOptions(m: Record<string, string>): { value: string; label: string }[] {
  return Object.keys(m).map((k) => ({ value: k, label: m[k] }));
}

function catalogOptions(columnKey: string): { value: string; label: string }[] | undefined {
  const f = getCatalogField(columnKey);
  if (!f?.options?.length) return undefined;
  return f.options.map((o) => ({ value: o.value, label: o.label }));
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
    case "email":
      return { uiType: "text", filterKey: "email_contains" };
    case "consentimento":
      return {
        uiType: "array",
        filterKey: "consent_values",
        source: "server",
        serverKey: "consentimento",
        options: [
          { value: "sim", label: "Sim" },
          { value: "nao", label: "Não" },
        ],
        emptyCountKey: "consentimento_empty",
      };
    case "endereco_completo":
      return { uiType: "text", filterKey: "endereco_contains" };
    case "formas_ajuda_outro":
      return { uiType: "text", filterKey: "formas_ajuda_outro" };
    case "movimento_social_nome":
      return { uiType: "text", filterKey: "movimento_social_contains" };
    case "participa_movimento_social":
      return {
        uiType: "array",
        filterKey: "participa_movimento_social_values",
        source: "server",
        serverKey: "participa_movimento_social",
        options: [
          { value: "true", label: "Sim" },
          { value: "false", label: "Não" },
        ],
        emptyCountKey: "participa_movimento_social_empty",
      };
    case "coletivo_alicerce":
      return {
        uiType: "array",
        filterKey: "coletivo_alicerce_values",
        source: "server",
        serverKey: "coletivo_alicerce",
        options: [
          { value: "true", label: "Sim" },
          { value: "false", label: "Não" },
        ],
        emptyCountKey: "coletivo_alicerce_empty",
      };
    case "whatsapp":
      return { uiType: "text", filterKey: "phone_contains" };
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
      return {
        uiType: "array",
        filterKey: "lifecycle_statuses",
        source: "server",
        serverKey: "lifecycle_statuses",
        options: labelsToOptions(LIFECYCLE_LABEL),
      };
    case "created_at":
      return { uiType: "text", filterKey: "created_contem" };
    case "faixa_etaria":
      return {
        uiType: "array",
        filterKey: "faixas_etarias",
        source: "server",
        serverKey: "faixa_etaria",
        options: [...FAIXA_ETARIA_OPTIONS],
      };
    case "formas_ajuda":
      return {
        uiType: "array",
        filterKey: "formas_ajuda",
        source: "server",
        serverKey: "formas_ajuda",
        options: catalogOptions("formas_ajuda"),
      };
    case "disponibilidade":
      return {
        uiType: "array",
        filterKey: "disponibilidade",
        source: "server",
        serverKey: "disponibilidade",
        options: catalogOptions("disponibilidade"),
      };
    case "quem_indicou":
      return { uiType: "text", filterKey: "quem_indicou" };
    case "rede_social":
      return { uiType: "text", filterKey: "rede_social" };
    case "zona_eleitoral":
      return { uiType: "text", filterKey: "zona_eleitoral" };
    case "como_conheceu":
      return { uiType: "text", filterKey: "como_conheceu" };
    default: {
      const f = getCatalogField(columnKey);
      if (!f) return null;
      if (f.filterKind === "text") return { uiType: "text", filterKey: f.key as keyof CrmFilters };
      if (f.filterKind === "boolean") {
        return {
          uiType: "array",
          filterKey: f.key as keyof CrmFilters,
          options: [
            { value: "true", label: "Sim" },
            { value: "false", label: "Não" },
          ],
        };
      }
      if (f.filterKind === "multiselect" || f.filterKind === "enum") {
        if (f.options && f.options.length) {
          return { uiType: "array", filterKey: f.key as keyof CrmFilters, source: "catalog", options: f.options.map((o) => ({ value: o.value, label: o.label })) };
        }
        return { uiType: "array", filterKey: f.key as keyof CrmFilters };
      }
      return null;
    }
  }
}

function legacyBooleanValues(columnKey: string, filters: CrmFilters): string[] | null {
  if (columnKey === "consentimento") {
    if (filters.consent === "sim") return ["sim"];
    if (filters.consent === "nao") return ["nao"];
    return null;
  }
  if (columnKey === "participa_movimento_social" && typeof filters.participa_movimento_social === "boolean") {
    return [filters.participa_movimento_social ? "true" : "false"];
  }
  if (columnKey === "coletivo_alicerce" && typeof filters.coletivo_alicerce === "boolean") {
    return [filters.coletivo_alicerce ? "true" : "false"];
  }
  return null;
}

/** Lê o valor atual do filtro para uma coluna (normaliza legado sim/nao → array). */
export function getColumnFilterValue(columnKey: string, filters: CrmFilters): unknown {
  const info = resolveFilterField(columnKey);
  if (!info) return null;
  const raw = (filters as Record<string, unknown>)[info.filterKey as string];
  if (info.uiType === "array" || info.uiType === "tag") {
    if (Array.isArray(raw) && raw.length) return raw;
    return legacyBooleanValues(columnKey, filters) ?? (Array.isArray(raw) ? raw : raw ? [String(raw)] : []);
  }
  return raw;
}

/** Indica se a coluna tem filtro ativo. */
export function isColumnFilterActive(columnKey: string, filters: CrmFilters): boolean {
  const info = resolveFilterField(columnKey);
  if (!info) return false;
  const v = getColumnFilterValue(columnKey, filters);
  if (info.uiType === "text") return typeof v === "string" && v.trim() !== "";
  if (info.uiType === "array" || info.uiType === "tag") return Array.isArray(v) && v.length > 0;
  return false;
}

function clearLegacyBooleanFilter(next: Record<string, unknown>, columnKey: string) {
  if (columnKey === "consentimento") delete next.consent;
  if (columnKey === "participa_movimento_social") delete next.participa_movimento_social;
  if (columnKey === "coletivo_alicerce") delete next.coletivo_alicerce;
}

export function applyColumnFilter(current: CrmFilters, column: string, payload: unknown): CrmFilters {
  const info = resolveFilterField(column);
  if (!info) return current;
  const next = { ...current } as Record<string, unknown>;
  clearLegacyBooleanFilter(next, column);

  if (info.uiType === "text") {
    next[info.filterKey as string] = String(payload ?? "").trim() || undefined;
  } else if (info.uiType === "array" || info.uiType === "tag") {
    const arr = Array.isArray(payload) ? payload : payload == null ? [] : [payload];
    next[info.filterKey as string] = arr.length ? arr : undefined;
  }
  return next as CrmFilters;
}

export function clearColumnFilter(current: CrmFilters, column: string): CrmFilters {
  const info = resolveFilterField(column);
  if (!info) return current;
  const next = { ...current } as Record<string, unknown>;
  delete next[info.filterKey as string];
  clearLegacyBooleanFilter(next, column);
  return next as CrmFilters;
}

export { EMPTY_FILTER_TOKEN };
