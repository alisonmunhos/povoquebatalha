// src/lib/filter-exclusion.ts
// Fonte única do par "mostrar os marcados" / "esconder os marcados" (exceto)
// usado nos filtros da Gestão da Base. O motor de consulta (crm-filters.ts)
// já entende as chaves *_excluir; aqui só mapeamos o que a interface oferece.
//
// IMPORTANTE: desde a revisão dos filtros combináveis, incluir e excluir podem
// coexistir no mesmo campo — é assim que se pergunta "tem as tags 4 a 13, mas
// não tem a tag 2".
import type { CrmFilters } from "@/lib/crm-filters";
import { getModeKey, supportsMatchMode, type MatchMode } from "@/lib/filter-match-mode";

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
  missao_ids: "missao_ids_excluir",
  evento_ids: "evento_ids_excluir",
} as const satisfies Partial<Record<keyof CrmFilters, keyof CrmFilters>>;

/** Chaves de filtro que aceitam o modo "exceto". */
export type ExcludableFilterKey = keyof typeof EXCLUDE_KEY_BY_FILTER;

export function getExcludeKey(key: ExcludableFilterKey): keyof CrmFilters {
  return EXCLUDE_KEY_BY_FILTER[key];
}

function readArray(filters: CrmFilters, key: keyof CrmFilters | string): string[] {
  const v = (filters as Record<string, unknown>)[key as string];
  return Array.isArray(v) ? (v as string[]) : [];
}

/** Valores marcados para MOSTRAR. */
export function getIncludeValues(filters: CrmFilters, key: ExcludableFilterKey): string[] {
  return readArray(filters, key);
}

/** Valores marcados para ESCONDER. */
export function getExcludeValues(filters: CrmFilters, key: ExcludableFilterKey): string[] {
  return readArray(filters, getExcludeKey(key));
}

/**
 * Grava os dois lados de uma só vez (mostrar + esconder + modo).
 * Chaves vazias são removidas, para a URL e as visões salvas ficarem limpas.
 */
export function applyFilterSides(
  filters: CrmFilters,
  key: ExcludableFilterKey,
  include: string[],
  exclude: string[],
  mode: MatchMode = "qualquer",
): CrmFilters {
  const next = { ...filters } as Record<string, unknown>;
  const excludeKey = getExcludeKey(key) as string;

  if (include.length) next[key as string] = include;
  else delete next[key as string];

  if (exclude.length) next[excludeKey] = exclude;
  else delete next[excludeKey];

  if (supportsMatchMode(key)) {
    const modeKey = getModeKey(key);
    // "nenhuma destas" vive só no lado de exclusão: o modo precisa ser guardado
    // mesmo sem inclusão, senão o menu não consegue reconstituir a escolha.
    const keepMode =
      mode === "nenhuma" ? exclude.length > 0 : include.length > 0 && mode !== "qualquer";
    if (keepMode) next[modeKey] = mode;
    else delete next[modeKey];
  }

  return next as CrmFilters;
}

/** Limpa completamente um campo (mostrar, esconder e modo). */
export function clearFilterField(filters: CrmFilters, key: ExcludableFilterKey): CrmFilters {
  return applyFilterSides(filters, key, [], [], "qualquer");
}

// ————————————————————————————————————————————————————————————————
// Compatibilidade com o formato antigo (um lado por vez). Ainda usado pela
// planilha BI e por visões salvas anteriores.
// ————————————————————————————————————————————————————————————————

/** Modo ativo: "exclude" apenas quando a chave de exclusão tem valores marcados. */
export function getFilterMode(filters: CrmFilters, key: ExcludableFilterKey): FilterMode {
  return getExcludeValues(filters, key).length > 0 && !getIncludeValues(filters, key).length
    ? "exclude"
    : "include";
}

/** Valores marcados hoje, vindos do lado ativo (incluir ou excluir). */
export function getFilterValues(filters: CrmFilters, key: ExcludableFilterKey): string[] {
  const included = getIncludeValues(filters, key);
  return included.length > 0 ? included : getExcludeValues(filters, key);
}

/** Grava a seleção em um único lado, limpando o outro (comportamento legado). */
export function applyFilterSelection(
  filters: CrmFilters,
  key: ExcludableFilterKey,
  values: string[],
  mode: FilterMode,
): CrmFilters {
  return mode === "exclude"
    ? applyFilterSides(filters, key, [], values, "qualquer")
    : applyFilterSides(filters, key, values, [], "qualquer");
}
