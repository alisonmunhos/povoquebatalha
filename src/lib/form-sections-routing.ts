import {
  getEffectiveQuestionShape,
  type QuestionRowForShape,
} from "@/lib/form-question-shape";

export type SectionRouteInfo = {
  id: string;
  order_index: number;
  default_next_section_id: string | null;
};

export type BranchRuleRouteInfo = {
  question_id: string;
  option_value: string;
  next_section_id: string | null;
};

type AnswerValue = string | string[] | boolean | Record<string, unknown> | null | undefined;

function answerToBranchValue(value: AnswerValue): string | null {
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

/**
 * Decide a próxima seção após a atual. Retorna `null` quando o fluxo termina.
 * Regras de ramificação têm prioridade sobre o destino padrão da seção.
 */
export function resolveNextSectionId(
  currentSectionId: string,
  sections: SectionRouteInfo[],
  questions: Array<QuestionRowForShape & { id: string; section_id: string | null }>,
  branchRules: BranchRuleRouteInfo[],
  answers: Record<string, AnswerValue>,
): string | null {
  const current = sections.find((s) => s.id === currentSectionId);
  if (!current) return null;

  const sectionQuestions = questions.filter((q) => q.section_id === currentSectionId);
  for (const q of sectionQuestions) {
    const shape = getEffectiveQuestionShape(q);
    if (!shape.isBranchable) continue;
    const branchValue = answerToBranchValue(answers[q.id]);
    if (!branchValue) continue;
    const rule = branchRules.find((r) => r.question_id === q.id && r.option_value === branchValue);
    if (rule) return rule.next_section_id;
  }

  return current.default_next_section_id;
}

export function sortSections<T extends { order_index: number }>(sections: T[]): T[] {
  return [...sections].sort((a, b) => a.order_index - b.order_index);
}
