import { getCatalogField } from "@/lib/form-field-catalog";

export type BranchableQuestion = {
  source: "catalog" | "custom";
  catalog_field_key: string | null;
};

/** Opções de resposta que podem ter destino de ramificação no construtor. */
export function getBranchableOptions(q: BranchableQuestion): { value: string; label: string }[] {
  if (q.source !== "catalog" || !q.catalog_field_key) return [];
  const field = getCatalogField(q.catalog_field_key);
  if (!field) return [];

  if (field.responseType === "yes_no") {
    return [
      { value: "true", label: "Sim" },
      { value: "false", label: "Não" },
    ];
  }

  // Ramificação só em escolha única — multiselect não entra no fluxo por seção.
  if (field.responseType === "multiple_choice" && field.filterKind === "enum" && field.options?.length) {
    return field.options.map((o) => ({ value: o.value, label: o.label }));
  }

  return [];
}

export function isBranchableQuestion(q: BranchableQuestion): boolean {
  return getBranchableOptions(q).length > 0;
}

export function sectionLabel(orderIndex: number, title: string | null | undefined): string {
  const name = title?.trim() || `Seção ${orderIndex + 1}`;
  return name;
}

export function destinationLabel(
  nextOrderIndex: number | null,
  sections: Array<{ order_index: number; title: string | null }>,
): string {
  if (nextOrderIndex == null) return "Finalizar formulário";
  const target = sections.find((s) => s.order_index === nextOrderIndex);
  return sectionLabel(nextOrderIndex, target?.title);
}
