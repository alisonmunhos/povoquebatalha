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
  | {
      uiType: "textContains";
      containsKey: keyof CrmFilters;
      emptyKey: keyof CrmFilters;
      placeholder?: string;
    }
  | {
      uiType: "dateRange";
      fromKey: keyof CrmFilters;
      toKey: keyof CrmFilters;
      quickKey: keyof CrmFilters;
    }
  | { uiType: "array"; filterKey: keyof CrmFilters; source?: "catalog" | "server"; serverKey?: string; options?: { value: string; label: string }[]; emptyCountKey?: string }
  | { uiType: "tag"; filterKey: "tag_ids"; source: "server"; serverKey: "tags" };

export type TextContainsFilterValue = { contains: string; empty: boolean };
export type DateRangeFilterValue = { from: string; to: string; quick: string };

/** Modo de um filtro de lista: incluir os marcados ou excluir os marcados. */
export type ColumnFilterMode = "include" | "exclude";

/**
 * Colunas que aceitam exclusão ("exceto"). A chave é o campo de filtro usado
 * quando o modo é "excluir". Colunas fora deste mapa só aceitam inclusão.
 */
const EXCLUDE_KEY_BY_COLUMN: Record<string, keyof CrmFilters> = {
  tags: "tag_ids_excluir",
  cidade: "cidades_excluir",
  bairro: "bairros_excluir",
  uf: "ufs_excluir",
  profissao: "profissoes_excluir",
  instituicao: "instituicoes_excluir",
  tipo_contato: "tipos_contato_excluir",
  movimento_social_nome: "movimentos_sociais_excluir",
  quem_indicou: "quem_indicou_excluir",
  zona_eleitoral: "zona_eleitoral_excluir",
  como_conheceu: "como_conheceu_excluir",
  formas_ajuda_outro: "formas_ajuda_outro_excluir",
  origem: "origens_excluir",
  faixa_etaria: "faixas_etarias_excluir",
  lifecycle_status: "lifecycle_statuses_excluir",
  phone_status: "phone_statuses_excluir",
  whatsapp_status: "whatsapp_statuses_excluir",
  formas_ajuda: "formas_ajuda_excluir",
  disponibilidade: "disponibilidade_excluir",
};

/** Chave de exclusão da coluna (ou null quando a coluna não suporta "exceto"). */
export function getColumnExcludeKey(columnKey: string): keyof CrmFilters | null {
  const info = resolveFilterField(columnKey);
  if (!info || (info.uiType !== "array" && info.uiType !== "tag")) return null;
  return EXCLUDE_KEY_BY_COLUMN[columnKey] ?? null;
}

/** Modo atual do filtro da coluna (exclusão só quando há valores marcados nela). */
export function getColumnFilterMode(columnKey: string, filters: CrmFilters): ColumnFilterMode {
  const key = getColumnExcludeKey(columnKey);
  if (!key) return "include";
  const arr = (filters as Record<string, unknown>)[key as string];
  return Array.isArray(arr) && arr.length ? "exclude" : "include";
}

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
      return { uiType: "textContains", containsKey: "nome", emptyKey: "nome_empty", placeholder: "Contém…" };
    case "nome_social":
      return { uiType: "text", filterKey: "nome_social" };
    case "profissao":
      return { uiType: "array", filterKey: "profissoes", source: "server", serverKey: "profissoes" };
    case "instituicao":
      return { uiType: "array", filterKey: "instituicoes", source: "server", serverKey: "instituicoes" };
    case "email":
      return { uiType: "textContains", containsKey: "email_contains", emptyKey: "email_empty", placeholder: "Contém…" };
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
      return {
        uiType: "textContains",
        containsKey: "endereco_contains",
        emptyKey: "endereco_empty",
        placeholder: "Contém (rua, bairro, cidade…)",
      };
    case "formas_ajuda_outro":
      return {
        uiType: "array",
        filterKey: "formas_ajuda_outro_values",
        source: "server",
        serverKey: "formas_ajuda_outro",
      };
    case "movimento_social_nome":
      return {
        uiType: "array",
        filterKey: "movimentos_sociais",
        source: "server",
        serverKey: "movimentos_sociais",
      };
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
      return {
        uiType: "textContains",
        containsKey: "phone_contains",
        emptyKey: "phone_empty",
        placeholder: "Contém…",
      };
    case "cidade":
      return { uiType: "array", filterKey: "cidades", source: "server", serverKey: "cidades" };
    case "bairro":
      return { uiType: "array", filterKey: "bairros", source: "server", serverKey: "bairros" };
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
      return { uiType: "dateRange", fromKey: "created_desde", toKey: "created_ate", quickKey: "created_contem" };
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
      return { uiType: "array", filterKey: "quem_indicou_values", source: "server", serverKey: "quem_indicou" };
    case "rede_social":
      return { uiType: "text", filterKey: "rede_social" };
    case "zona_eleitoral":
      return { uiType: "array", filterKey: "zona_eleitoral_values", source: "server", serverKey: "zona_eleitoral" };
    case "como_conheceu":
      return { uiType: "array", filterKey: "como_conheceu_values", source: "server", serverKey: "como_conheceu" };
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

function legacyTextToArray(filters: CrmFilters, arrayKey: keyof CrmFilters, textKey: keyof CrmFilters): string[] | null {
  const arr = (filters as Record<string, unknown>)[arrayKey as string];
  if (Array.isArray(arr) && arr.length) return arr as string[];
  const text = (filters as Record<string, unknown>)[textKey as string];
  if (typeof text === "string" && text.trim()) return [text.trim()];
  return null;
}

function legacyArrayValue(columnKey: string, filters: CrmFilters): string[] | null {
  switch (columnKey) {
    case "cidade":
      return legacyTextToArray(filters, "cidades", "cidade");
    case "bairro":
      return legacyTextToArray(filters, "bairros", "bairro");
    case "profissao":
      return legacyTextToArray(filters, "profissoes", "profissao");
    case "instituicao":
      return legacyTextToArray(filters, "instituicoes", "instituicao");
    case "quem_indicou":
      return legacyTextToArray(filters, "quem_indicou_values", "quem_indicou");
    case "como_conheceu":
      return legacyTextToArray(filters, "como_conheceu_values", "como_conheceu");
    case "zona_eleitoral":
      return legacyTextToArray(filters, "zona_eleitoral_values", "zona_eleitoral");
    case "formas_ajuda_outro":
      return legacyTextToArray(filters, "formas_ajuda_outro_values", "formas_ajuda_outro");
    default:
      return null;
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

  if (info.uiType === "textContains") {
    const contains = String((filters as Record<string, unknown>)[info.containsKey as string] ?? "");
    const empty = (filters as Record<string, unknown>)[info.emptyKey as string] === true;
    return { contains, empty } satisfies TextContainsFilterValue;
  }

  if (info.uiType === "dateRange") {
    return {
      from: String((filters as Record<string, unknown>)[info.fromKey as string] ?? ""),
      to: String((filters as Record<string, unknown>)[info.toKey as string] ?? ""),
      quick: String((filters as Record<string, unknown>)[info.quickKey as string] ?? ""),
    } satisfies DateRangeFilterValue;
  }

  const raw = (filters as Record<string, unknown>)[info.filterKey as string];
  if (info.uiType === "array" || info.uiType === "tag") {
    if (Array.isArray(raw) && raw.length) return raw;
    return (
      legacyArrayValue(columnKey, filters) ??
      legacyBooleanValues(columnKey, filters) ??
      (Array.isArray(raw) ? raw : raw ? [String(raw)] : [])
    );
  }
  return raw;
}

/** Indica se a coluna tem filtro ativo. */
export function isColumnFilterActive(columnKey: string, filters: CrmFilters): boolean {
  const info = resolveFilterField(columnKey);
  if (!info) return false;
  const v = getColumnFilterValue(columnKey, filters);
  if (info.uiType === "textContains") {
    const t = v as TextContainsFilterValue;
    return !!t.empty || !!t.contains.trim();
  }
  if (info.uiType === "dateRange") {
    const d = v as DateRangeFilterValue;
    return !!d.from || !!d.to || !!d.quick.trim();
  }
  if (info.uiType === "text") return typeof v === "string" && v.trim() !== "";
  if (info.uiType === "array" || info.uiType === "tag") return Array.isArray(v) && v.length > 0;
  return false;
}

function clearLegacyBooleanFilter(next: Record<string, unknown>, columnKey: string) {
  if (columnKey === "consentimento") delete next.consent;
  if (columnKey === "participa_movimento_social") delete next.participa_movimento_social;
  if (columnKey === "coletivo_alicerce") delete next.coletivo_alicerce;
}

function clearLegacyTextFilter(next: Record<string, unknown>, columnKey: string) {
  const legacyKeys: Record<string, string> = {
    cidade: "cidade",
    bairro: "bairro",
    profissao: "profissao",
    instituicao: "instituicao",
    quem_indicou: "quem_indicou",
    como_conheceu: "como_conheceu",
    zona_eleitoral: "zona_eleitoral",
    formas_ajuda_outro: "formas_ajuda_outro",
    movimento_social_nome: "movimento_social_contains",
  };
  const key = legacyKeys[columnKey];
  if (key) delete next[key];
}

export function applyColumnFilter(current: CrmFilters, column: string, payload: unknown): CrmFilters {
  const info = resolveFilterField(column);
  if (!info) return current;
  const next = { ...current } as Record<string, unknown>;
  clearLegacyBooleanFilter(next, column);
  clearLegacyTextFilter(next, column);

  if (info.uiType === "textContains") {
    const p = (payload ?? { contains: "", empty: false }) as TextContainsFilterValue;
    next[info.containsKey as string] = p.contains?.trim() || undefined;
    next[info.emptyKey as string] = p.empty ? true : undefined;
  } else if (info.uiType === "dateRange") {
    const p = (payload ?? { from: "", to: "", quick: "" }) as DateRangeFilterValue;
    next[info.fromKey as string] = p.from?.trim() || undefined;
    next[info.toKey as string] = p.to?.trim() || undefined;
    next[info.quickKey as string] = p.quick?.trim() || undefined;
  } else if (info.uiType === "text") {
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
  if (info.uiType === "textContains") {
    delete next[info.containsKey as string];
    delete next[info.emptyKey as string];
  } else if (info.uiType === "dateRange") {
    delete next[info.fromKey as string];
    delete next[info.toKey as string];
    delete next[info.quickKey as string];
  } else {
    delete next[info.filterKey as string];
  }
  clearLegacyBooleanFilter(next, column);
  clearLegacyTextFilter(next, column);
  return next as CrmFilters;
}

export { EMPTY_FILTER_TOKEN };
