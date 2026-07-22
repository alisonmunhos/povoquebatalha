export const SHEET_PAGE_SIZES = [25, 50, 100, 1000] as const;
export type SheetPageSizeOption = (typeof SHEET_PAGE_SIZES)[number] | "all";

/** Teto do modo "Todos" na listagem (server + UI). */
export const SHEET_ALL_MAX = 2000;

/** Teto de segurança para "Selecionar tudo" na planilha BI. */
export const SHEET_SELECT_ALL_MAX = 5000;

/** A partir deste número de linhas na página, exibimos aviso de performance. */
export const SHEET_LARGE_PAGE_WARNING = 1000;

/** Máximo de colunas de dados no mobile (< 768px). */
export const MOBILE_MAX_COLUMNS = 5;

export function parseSheetPageSize(raw: string | undefined): SheetPageSizeOption {
  if (raw === "all") return "all";
  const n = Number(raw ?? "50");
  if (SHEET_PAGE_SIZES.includes(n as (typeof SHEET_PAGE_SIZES)[number])) {
    return n as (typeof SHEET_PAGE_SIZES)[number];
  }
  return 50;
}

export function mobileColumnWidthClass(colCount: number): string {
  if (colCount <= 1) return "min-w-[200px] max-w-[70vw]";
  if (colCount === 2) return "min-w-[140px]";
  if (colCount === 3) return "min-w-[120px]";
  return "min-w-[110px]";
}

/** Largura da coluna de checkbox — usada para offset do sticky da 1ª coluna de dados. */
export const SHEET_CHECKBOX_COL_PX = 40;

export function needsHorizontalScroll(isMobile: boolean, colCount: number): boolean {
  return isMobile && colCount >= 4;
}
