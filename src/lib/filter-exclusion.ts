// src/lib/filter-exclusion.ts
// Fonte única do par "incluir os marcados" / "esconder os marcados" (exceto)
// usado nos filtros da Gestão da Base. O motor de consulta (crm-filters.ts)
// já entende as chaves *_excluir; aqui só mapeamos o que a interface oferece.
import type { CrmFilters } from "@/lib/crm-filters";

export type FilterMode = "include" | "exclude";

/** Filtro de lista → chave usada quando o modo é "esconder os marcados". */
export const EXCLUDE_KEY_BY_FILTER = {
  tag_ids: "tag_ids_excluir",
  cidades: "cidades_excluir",
  bairros: "bairros_excluir",
  ufs: "ufs_excluir",
  profissoes: "profissoes_excluir",
  instituicoes: "instituicoes_excluir",
  tipos_contato: "tipos_contato_excluir",
  movimentos_sociais: "movimentos_sociais_excluir",
  quem_indicou_values: "quem_indicou_excluir",
  rede_social_values: "rede_social_excluir",
  zona_eleitoral_values: "zona_eleitoral_excluir",
  como_conheceu_values: "como_conheceu_excluir",
  origens: "origens_excluir",
  faixas_etarias: "faixas_etarias_excluir",
  lifecycle_statuses: "lifecycle_statuses_excluir",
  phone_statuses: "phone_statuses_excluir",
  whatsapp_statuses: "whatsapp_statuses_excluir",
  formas_ajuda: "formas_ajuda_excluir",
  disponibilidade: "disponibilidade_excluir",
} as const satisfies Partial<Record<keyof CrmFilters, keyof CrmFilters>>;

/** Chaves de filtro que aceitam o modo "exceto". */
export type ExcludableFilterKey = keyof typeof EXCLUDE_KEY_BY_FILTER;

export function getExcludeKey(key: ExcludableFilterKey): keyof CrmFilters {
  return EXCLUDE_KEY_BY_FILTER[key];
}

function readArray(filters: CrmFilters, key: keyof CrmFilters): string[] {
  const v = (filters as Record<string, unknown>)[key as string];
  return Array.isArray(v) ? (v as string[]) : [];
}

/** Modo ativo: "exclude" apenas quando a chave de exclusão tem valores marcados. */
export function getFilterMode(filters: CrmFilters, key: ExcludableFilterKey): FilterMode {
  return readArray(filters, getExcludeKey(key)).length > 0 ? "exclude" : "include";
}

/** Valores marcados hoje, vindos do lado ativo (incluir ou excluir). */
export function getFilterValues(filters: CrmFilters, key: ExcludableFilterKey): string[] {
  const excluded = readArray(filters, getExcludeKey(key));
  return excluded.length > 0 ? excluded : readArray(filters, key);
}

/**
 * Grava a seleção no lado certo e limpa o outro — nunca deixa incluir e excluir
 * ativos ao mesmo tempo no mesmo campo.
 */
export function applyFilterSelection(
  filters: CrmFilters,
  key: ExcludableFilterKey,
  values: string[],
  mode: FilterMode,
): CrmFilters {
  const next = { ...filters } as Record<string, unknown>;
  const excludeKey = getExcludeKey(key) as string;
  delete next[key as string];
  delete next[excludeKey];
  if (values.length > 0) {
    next[mode === "exclude" ? excludeKey : (key as string)] = values;
  }
  return next as CrmFilters;
}
