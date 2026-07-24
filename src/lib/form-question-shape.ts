import { getCatalogField, type FormFieldFilterKind, type FormFieldResponseType } from "@/lib/form-field-catalog";

export type CustomResponseType = "short_text" | "single_choice";

export type CustomOption = { value: string; label: string };

export type QuestionRowForShape = {
  source: "catalog" | "custom" | string;
  catalog_field_key: string | null;
  custom_response_type?: CustomResponseType | string | null;
  custom_options?: CustomOption[] | null;
};

export type EffectiveQuestionShape = {
  response_type: FormFieldResponseType;
  filter_kind: FormFieldFilterKind;
  options: CustomOption[] | null;
  isBranchable: boolean;
};

const ACCENT_MARKS = /[\u0300-\u036f]/g;

function slugifyOptionBase(label: string): string {
  return label
    .normalize("NFD")
    .replace(ACCENT_MARKS, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Gera `value` estável a partir do rótulo; evita colisões dentro da mesma pergunta. */
export function slugifyOptionValue(label: string, used: Set<string>, fallbackIndex: number): string {
  const base = slugifyOptionBase(label) || `opcao-${fallbackIndex + 1}`;
  if (!used.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}-${n}`.slice(0, 60);
    if (!used.has(candidate)) return candidate;
  }
  return `opcao-${fallbackIndex + 1}`;
}

/** Normaliza opções vindas do construtor: preserva `value` quando o rótulo não mudou. */
export function normalizeCustomOptions(
  labelsOrOptions: Array<{ label: string; value?: string }>,
  existing: CustomOption[] | null | undefined,
): CustomOption[] {
  const existingByLabel = new Map((existing ?? []).map((o) => [o.label.trim(), o.value]));
  const used = new Set<string>();
  return labelsOrOptions
    .filter((opt) => opt.label.trim().length > 0)
    .map((opt, index) => {
      const label = opt.label.trim();
      const preserved = existingByLabel.get(label);
      let value = preserved && !used.has(preserved) ? preserved : opt.value?.trim();
      if (!value || used.has(value)) {
        value = slugifyOptionValue(label, used, index);
      }
      used.add(value);
      return { value, label };
    });
}

export function getEffectiveQuestionShape(row: QuestionRowForShape): EffectiveQuestionShape {
  if (row.source === "catalog" && row.catalog_field_key) {
    const catalog = getCatalogField(row.catalog_field_key);
    if (catalog) {
      const isBranchable =
        catalog.responseType === "yes_no" ||
        (catalog.responseType === "multiple_choice" && catalog.filterKind === "enum");
      return {
        response_type: catalog.responseType,
        filter_kind: catalog.filterKind,
        options: catalog.options ?? null,
        isBranchable,
      };
    }
  }

  if (row.source === "custom" && row.custom_response_type === "single_choice") {
    const options = Array.isArray(row.custom_options) ? row.custom_options : [];
    return {
      response_type: "multiple_choice",
      filter_kind: "enum",
      options: options.length ? options : null,
      isBranchable: options.length >= 2,
    };
  }

  return {
    response_type: "short_text",
    filter_kind: "text",
    options: null,
    isBranchable: false,
  };
}

export function getBranchableOptionsFromShape(shape: EffectiveQuestionShape): CustomOption[] {
  if (!shape.isBranchable || !shape.options?.length) return [];
  if (shape.response_type === "yes_no") {
    return [
      { value: "true", label: "Sim" },
      { value: "false", label: "Não" },
    ];
  }
  return shape.options;
}

export function labelForCustomOptionValue(
  options: CustomOption[] | null | undefined,
  value: string,
): string {
  const match = (options ?? []).find((o) => o.value === value);
  return match?.label ?? value;
}
