// src/lib/filter-match-mode.ts
// Fonte única dos "modos de combinação" dos filtros de lista da Gestão da Base.
//
// Um contato pode ter VÁRIAS tags, várias formas de ajuda, vários dias de
// disponibilidade, ter recebido várias missões. Para esses campos, marcar 3
// opções pode significar coisas diferentes — e é isso que o modo define:
//
//   qualquer → tem pelo menos uma das marcadas               (OU)
//   todos    → tem todas as marcadas (pode ter outras)       (E)
//   somente  → tem as marcadas e nada além delas             (exato)
//
// "Nenhuma das marcadas" (NÃO) continua sendo o lado de exclusão do filtro
// (`<campo>_excluir`), que agora pode ser usado JUNTO com a inclusão.
import type { CrmFilters } from "@/lib/crm-filters";

export type MatchMode = "qualquer" | "todos" | "somente";

/**
 * Campos em que um contato pode ter vários valores ao mesmo tempo — só neles
 * "todos"/"somente" faz sentido. Nos demais (cidade, UF, status…) o contato tem
 * um único valor, então o modo é sempre "qualquer".
 */
export const MODE_KEY_BY_FILTER = {
  tag_ids: "tag_ids_modo",
  formas_ajuda: "formas_ajuda_modo",
  disponibilidade: "disponibilidade_modo",
  missao_ids: "missao_ids_modo",
  evento_ids: "evento_ids_modo",
} as const;

export type MatchModeFilterKey = keyof typeof MODE_KEY_BY_FILTER;

export function supportsMatchMode(key: string): key is MatchModeFilterKey {
  return key in MODE_KEY_BY_FILTER;
}

export function getModeKey(key: MatchModeFilterKey): string {
  return MODE_KEY_BY_FILTER[key];
}

export function getMatchMode(filters: CrmFilters, key: string): MatchMode {
  if (!supportsMatchMode(key)) return "qualquer";
  const v = (filters as Record<string, unknown>)[getModeKey(key)];
  return v === "todos" || v === "somente" ? v : "qualquer";
}

/** No motor de consulta, "somente" se comporta como "todos" + exclusão do resto. */
export function isAndMode(mode: MatchMode): boolean {
  return mode === "todos" || mode === "somente";
}

export const MATCH_MODE_LABEL: Record<MatchMode, string> = {
  qualquer: "Qualquer uma",
  todos: "Todas",
  somente: "Somente essas",
};

export const MATCH_MODE_HELP: Record<MatchMode, string> = {
  qualquer: "Mostra quem tem pelo menos uma das opções marcadas.",
  todos: "Mostra quem tem todas as opções marcadas (pode ter outras também).",
  somente: "Mostra quem tem exatamente as opções marcadas e nada além delas.",
};

export const MATCH_MODES: MatchMode[] = ["qualquer", "todos", "somente"];

/** Frase curta do filtro, usada no rodapé do menu e nos chips de filtros ativos. */
export function describeSelection(opts: {
  include: string[];
  exclude: string[];
  mode: MatchMode;
  labelOf?: (value: string) => string;
  maxNames?: number;
}): string {
  const label = opts.labelOf ?? ((v: string) => v);
  const max = opts.maxNames ?? 3;
  const names = (arr: string[]) =>
    arr.length <= max
      ? arr.map(label).join(", ")
      : `${arr.slice(0, max).map(label).join(", ")} +${arr.length - max}`;

  const parts: string[] = [];
  if (opts.include.length) {
    const prefix =
      opts.mode === "todos" ? "tem todas" : opts.mode === "somente" ? "tem somente" : "tem qualquer";
    parts.push(`${prefix}: ${names(opts.include)}`);
  }
  if (opts.exclude.length) parts.push(`não tem: ${names(opts.exclude)}`);
  return parts.join(" · ");
}
