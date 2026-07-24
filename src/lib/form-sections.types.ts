import type { Database } from "@/integrations/supabase/types";

export type FormLayoutMode = "flat" | "sectioned";
export type SuccessScreenOrder = "whatsapp_first" | "confirmation_first";

export type FormSectionRow = Database["public"]["Tables"]["form_sections"]["Row"];
export type BranchRuleRow = Database["public"]["Tables"]["form_question_branch_rules"]["Row"];

export type SectionDraft = {
  id?: string;
  order_index: number;
  title: string | null;
  description?: string | null;
  /** Índice da seção destino padrão, ou null = terminal */
  default_next_order_index: number | null;
  confirmation_active?: boolean | null;
  whatsapp_button_enabled?: boolean | null;
  whatsapp_button_message?: string | null;
  success_screen_order?: SuccessScreenOrder | null;
};

export type BranchRuleDraft = {
  id?: string;
  question_id: string;
  option_value: string;
  /** Índice da seção destino, ou null = terminal */
  next_order_index: number | null;
};

/** Valida que destinos só apontam para frente (order_index maior) ou terminal (null). */
export function validateForwardOnlyRouting(
  sections: SectionDraft[],
  branchRules: BranchRuleDraft[] = [],
): string | null {
  const orderSet = new Set(sections.map((s) => s.order_index));

  for (const s of sections) {
    if (s.default_next_order_index != null) {
      if (!orderSet.has(s.default_next_order_index)) {
        return `Seção ${s.order_index + 1}: destino padrão inválido.`;
      }
      if (s.default_next_order_index <= s.order_index) {
        return `Seção ${s.order_index + 1}: o destino padrão precisa ser uma seção posterior.`;
      }
    }
  }

  for (const r of branchRules) {
    if (r.next_order_index == null) continue;
    if (!orderSet.has(r.next_order_index)) {
      return `Regra de ramificação: destino inválido para opção "${r.option_value}".`;
    }
    const fromSection = sections.find((s) =>
      // caller should attach section order via question lookup; skip if unknown
      false,
    );
    void fromSection;
  }

  return null;
}

export function validateForwardOnlyRoutingWithQuestionSections(
  sections: SectionDraft[],
  rules: Array<BranchRuleDraft & { from_order_index: number }>,
): string | null {
  const base = validateForwardOnlyRouting(sections);
  if (base) return base;

  const orderSet = new Set(sections.map((s) => s.order_index));
  for (const r of rules) {
    if (r.next_order_index == null) continue;
    if (!orderSet.has(r.next_order_index)) {
      return `Ramificação inválida: seção destino não existe.`;
    }
    if (r.next_order_index <= r.from_order_index) {
      return `Ramificação inválida: só é permitido avançar para uma seção posterior.`;
    }
  }
  return null;
}
