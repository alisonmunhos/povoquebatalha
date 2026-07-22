import { getCatalogField } from "@/lib/form-field-catalog";

export const DEFAULT_SHEET_SORT = "created_at:desc";

export type SortDirection = "asc" | "desc";

export type ParsedSort = {
  columnKey: string;
  direction: SortDirection;
};

const SYSTEM_SORT_COLUMNS: Record<string, string> = {
  cidade: "cidade",
  bairro: "bairro",
  uf: "uf",
  origem: "origem",
  lifecycle_status: "lifecycle_status",
  created_at: "created_at",
  tags: "",
  whatsapp: "phone_e164",
};

/** Colunas que não podem ser ordenadas no servidor. */
const UNSORTABLE_COLUMNS = new Set(["tags"]);

export function isColumnSortable(columnKey: string): boolean {
  if (UNSORTABLE_COLUMNS.has(columnKey)) return false;
  return resolveSortDbColumn(columnKey) !== null;
}

/** Mapeia chave de coluna da planilha → coluna do banco para ORDER BY. */
export function resolveSortDbColumn(columnKey: string): string | null {
  if (UNSORTABLE_COLUMNS.has(columnKey)) return null;
  if (columnKey in SYSTEM_SORT_COLUMNS) {
    const col = SYSTEM_SORT_COLUMNS[columnKey];
    return col || null;
  }
  const field = getCatalogField(columnKey);
  if (!field) return null;
  if (field.targetColumns.length === 1) return field.targetColumns[0]!;
  if (columnKey === "endereco_completo") return "cidade";
  return null;
}

export function parseSheetSort(sort?: string | null): ParsedSort {
  if (!sort) return parseSheetSort(DEFAULT_SHEET_SORT);
  const [columnKey, dir] = sort.split(":");
  if (!columnKey) return parseSheetSort(DEFAULT_SHEET_SORT);
  const direction: SortDirection = dir === "asc" ? "asc" : "desc";
  return { columnKey, direction };
}

export function formatSheetSort(columnKey: string, direction: SortDirection): string {
  return `${columnKey}:${direction}`;
}

export function getColumnSortState(
  columnKey: string,
  sort?: string | null,
): "asc" | "desc" | "none" {
  const parsed = parseSheetSort(sort);
  if (parsed.columnKey !== columnKey) return "none";
  return parsed.direction;
}

/** Ciclo: asc → desc → padrão (created_at desc). */
export function cycleColumnSort(columnKey: string, currentSort?: string | null): string {
  const state = getColumnSortState(columnKey, currentSort);
  if (state === "none") return formatSheetSort(columnKey, defaultFirstDirection(columnKey));
  if (state === "asc") return formatSheetSort(columnKey, "desc");
  return DEFAULT_SHEET_SORT;
}

function defaultFirstDirection(columnKey: string): SortDirection {
  if (columnKey === "created_at") return "desc";
  return "asc";
}

export function sortDirectionLabel(columnKey: string, direction: SortDirection): string {
  if (columnKey === "created_at") return direction === "asc" ? "mais antigos" : "mais recentes";
  return direction === "asc" ? "A → Z" : "Z → A";
}
