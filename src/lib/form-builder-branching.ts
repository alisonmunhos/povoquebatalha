import {
  getEffectiveQuestionShape,
  getBranchableOptionsFromShape,
  type QuestionRowForShape,
} from "@/lib/form-question-shape";

export type BranchableQuestion = QuestionRowForShape;

/** Opções de resposta que podem ter destino de ramificação no construtor. */
export function getBranchableOptions(q: BranchableQuestion): { value: string; label: string }[] {
  const shape = getEffectiveQuestionShape(q);
  return getBranchableOptionsFromShape(shape);
}

export function isBranchableQuestion(q: BranchableQuestion): boolean {
  return getEffectiveQuestionShape(q).isBranchable;
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
