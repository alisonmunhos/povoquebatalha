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

export function isAnswerEmpty(value: AnswerValue | undefined): boolean {
  if (value == null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    return !Object.values(value).some((v) => v != null && v !== "" && String(v).trim());
  }
  return false;
}

export function questionVisibleForAnswers(
  q: { depends_on: { key: string; value: boolean } | null },
  parentAnswers: Record<string, boolean>,
): boolean {
  if (!q.depends_on) return true;
  return parentAnswers[q.depends_on.key] === q.depends_on.value;
}

export function findFirstRequiredEmpty(
  questions: Array<{
    id: string;
    label: string;
    required: boolean;
    depends_on: { key: string; value: boolean } | null;
  }>,
  values: Record<string, AnswerValue>,
  parentAnswers: Record<string, boolean>,
): string | null {
  for (const q of questions) {
    if (!questionVisibleForAnswers(q, parentAnswers)) continue;
    if (q.required && isAnswerEmpty(values[q.id])) {
      return `Campo obrigatório: ${q.label}`;
    }
  }
  return null;
}

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

/**
 * Seções visitadas do início até a terminal, seguindo ramificações e destino padrão.
 * Retorna o caminho percorrido; se a terminal não for alcançada, o último item não será a terminal.
 */
export function getSectionsOnPath(
  startSectionId: string,
  terminalSectionId: string,
  sections: SectionRouteInfo[],
  questions: Array<QuestionRowForShape & { id: string; section_id: string | null }>,
  branchRules: BranchRuleRouteInfo[],
  answers: Record<string, AnswerValue>,
): string[] {
  const path: string[] = [];
  let currentId: string | null = startSectionId;
  const maxSteps = sections.length + 1;
  let steps = 0;

  while (currentId && steps < maxSteps) {
    steps += 1;
    path.push(currentId);
    if (currentId === terminalSectionId) return path;
    currentId = resolveNextSectionId(currentId, sections, questions, branchRules, answers);
  }

  return path;
}

export function sortSections<T extends { order_index: number }>(sections: T[]): T[] {
  return [...sections].sort((a, b) => a.order_index - b.order_index);
}
