import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff, requireAdmin } from "@/lib/authz";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  type BranchRuleDraft,
  type FormSectionType,
  type SectionDraft,
  type SuccessScreenOrder,
  validateForwardOnlyRouting,
  validateForwardOnlyRoutingWithQuestionSections,
} from "@/lib/form-sections.types";
import type { AppRole } from "@/lib/roles";

type AppSupabase = SupabaseClient<Database>;

function orderIndexBySectionId(sections: Array<{ id: string; order_index: number }>) {
  return new Map(sections.map((s) => [s.id, s.order_index]));
}

function sectionIdByOrderIndex(sections: Array<{ id: string; order_index: number }>) {
  return new Map(sections.map((s) => [s.order_index, s.id]));
}

function toSectionDrafts(
  sections: Array<{
    id: string;
    order_index: number;
    title: string | null;
    section_type?: string | null;
    account_creation_role?: string | null;
    default_next_section_id: string | null;
    confirmation_active: boolean | null;
    whatsapp_button_enabled: boolean | null;
    whatsapp_button_message: string | null;
    success_screen_order: string | null;
  }>,
): SectionDraft[] {
  const orderById = orderIndexBySectionId(sections);
  return sections.map((s) => ({
    id: s.id,
    order_index: s.order_index,
    title: s.title,
    section_type: (s.section_type === "account_creation" ? "account_creation" : "questions") as SectionDraft["section_type"],
    account_creation_role: (s.account_creation_role as SectionDraft["account_creation_role"]) ?? "agitador",
    default_next_order_index:
      s.default_next_section_id != null ? (orderById.get(s.default_next_section_id) ?? null) : null,
    confirmation_active: s.confirmation_active,
    whatsapp_button_enabled: s.whatsapp_button_enabled,
    whatsapp_button_message: s.whatsapp_button_message,
    success_screen_order: (s.success_screen_order as SuccessScreenOrder | null) ?? null,
  }));
}

/** Normaliza seções vindas do Zod (campos .nullable().optional() podem ser undefined)
 *  para o formato estrito SectionDraft, onde opcionais são string | null. */
function normalizeSectionDrafts(
  sections: Array<{
    id?: string;
    order_index: number;
    title?: string | null;
    section_type?: FormSectionType;
    account_creation_role?: AppRole | null;
    default_next_order_index?: number | null;
    confirmation_active?: boolean | null;
    whatsapp_button_enabled?: boolean | null;
    whatsapp_button_message?: string | null;
    success_screen_order?: SuccessScreenOrder | null;
  }>,
): SectionDraft[] {
  return sections.map((s) => ({
    id: s.id,
    order_index: s.order_index,
    title: s.title ?? null,
    section_type: s.section_type ?? "questions",
    account_creation_role: s.account_creation_role ?? "agitador",
    default_next_order_index: s.default_next_order_index ?? null,
    confirmation_active: s.confirmation_active ?? null,
    whatsapp_button_enabled: s.whatsapp_button_enabled ?? null,
    whatsapp_button_message: s.whatsapp_button_message ?? null,
    success_screen_order: s.success_screen_order ?? null,
  }));
}

function toBranchRuleDrafts(
  rules: Array<{ id: string; question_id: string; option_value: string; next_section_id: string | null }>,
  orderById: Map<string, number>,
): BranchRuleDraft[] {
  return rules.map((r) => ({
    id: r.id,
    question_id: r.question_id,
    option_value: r.option_value,
    next_order_index: r.next_section_id != null ? (orderById.get(r.next_section_id) ?? null) : null,
  }));
}

export async function loadFormSectionsBundle(supabase: AppSupabase, formDefinitionId: string) {
  const { data: sections, error: secErr } = await supabase
    .from("form_sections")
    .select("*")
    .eq("form_definition_id", formDefinitionId)
    .order("order_index", { ascending: true });
  if (secErr) throw secErr;

  const sectionList = sections ?? [];
  const orderById = orderIndexBySectionId(sectionList);

  const { data: questions } = await supabase
    .from("form_definition_questions")
    .select("id")
    .eq("form_definition_id", formDefinitionId);
  const questionIds = (questions ?? []).map((q) => q.id);

  let branchRules: BranchRuleDraft[] = [];
  if (questionIds.length > 0) {
    const { data: rules, error: rulesErr } = await supabase
      .from("form_question_branch_rules")
      .select("id,question_id,option_value,next_section_id")
      .in("question_id", questionIds);
    if (rulesErr) throw rulesErr;
    branchRules = toBranchRuleDrafts(rules ?? [], orderById);
  }

  return {
    sections: toSectionDrafts(sectionList),
    branchRules,
  };
}

export const listFormSections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ form_definition_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context.supabase, context.userId);
    return loadFormSectionsBundle(context.supabase, data.form_definition_id);
  });

const sectionSchema = z.object({
  id: z.string().uuid().optional(),
  order_index: z.number().int().min(0),
  title: z.string().trim().max(200).nullable().optional(),
  section_type: z.enum(["questions", "account_creation"]).optional(),
  account_creation_role: z.enum(["operador", "leitor", "vrm", "agitador", "comunicacao"]).nullable().optional(),
  default_next_order_index: z.number().int().min(0).nullable().optional(),
  confirmation_active: z.boolean().nullable().optional(),
  whatsapp_button_enabled: z.boolean().nullable().optional(),
  whatsapp_button_message: z.string().trim().max(500).nullable().optional(),
  success_screen_order: z.enum(["whatsapp_first", "confirmation_first"]).nullable().optional(),
});

const upsertSectionsSchema = z.object({
  form_definition_id: z.string().uuid(),
  sections: z.array(sectionSchema).min(1).max(40),
});

export const upsertFormSections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSectionsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);

    const normalizedSections = normalizeSectionDrafts(data.sections);

    const routingError = validateForwardOnlyRouting(normalizedSections);
    if (routingError) throw new Error(routingError);

    const keepIds = data.sections.map((s) => s.id).filter((id): id is string => Boolean(id));
    if (keepIds.length > 0) {
      await context.supabase
        .from("form_sections")
        .delete()
        .eq("form_definition_id", data.form_definition_id)
        .not("id", "in", `(${keepIds.join(",")})`);
    } else {
      await context.supabase.from("form_sections").delete().eq("form_definition_id", data.form_definition_id);
    }

    for (const s of data.sections) {
      const row = {
        form_definition_id: data.form_definition_id,
        order_index: s.order_index,
        title: s.title ?? null,
        section_type: s.section_type ?? "questions",
        account_creation_role: s.section_type === "account_creation" ? (s.account_creation_role ?? "agitador") : null,
        default_next_section_id: null as string | null,
        confirmation_active: s.confirmation_active ?? null,
        whatsapp_button_enabled: s.whatsapp_button_enabled ?? null,
        whatsapp_button_message: s.whatsapp_button_message ?? null,
        success_screen_order: s.success_screen_order ?? null,
      };
      if (s.id) {
        const { error } = await context.supabase.from("form_sections").update(row).eq("id", s.id);
        if (error) throw error;
      } else {
        const { error } = await context.supabase.from("form_sections").insert(row);
        if (error) throw error;
      }
    }

    const { data: saved, error: loadErr } = await context.supabase
      .from("form_sections")
      .select("id,order_index")
      .eq("form_definition_id", data.form_definition_id);
    if (loadErr) throw loadErr;

    const idByOrder = sectionIdByOrderIndex(saved ?? []);
    for (const s of data.sections) {
      const sectionId = s.id ?? idByOrder.get(s.order_index);
      if (!sectionId) continue;
      const nextId =
        s.default_next_order_index != null ? (idByOrder.get(s.default_next_order_index) ?? null) : null;
      const { error } = await context.supabase
        .from("form_sections")
        .update({ default_next_section_id: nextId })
        .eq("id", sectionId);
      if (error) throw error;
    }

    return { ok: true as const };
  });

const branchRuleSchema = z.object({
  id: z.string().uuid().optional(),
  question_id: z.string().uuid(),
  option_value: z.string().trim().min(1).max(200),
  next_order_index: z.number().int().min(0).nullable(),
});

const upsertBranchRulesSchema = z.object({
  form_definition_id: z.string().uuid(),
  rules: z.array(branchRuleSchema).max(200),
});

export const upsertBranchRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertBranchRulesSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);

    const { data: sections, error: secErr } = await context.supabase
      .from("form_sections")
      .select("id,order_index")
      .eq("form_definition_id", data.form_definition_id);
    if (secErr) throw secErr;
    const sectionList = sections ?? [];
    const idByOrder = sectionIdByOrderIndex(sectionList);
    const orderBySectionId = orderIndexBySectionId(sectionList);

    const { data: questions, error: qErr } = await context.supabase
      .from("form_definition_questions")
      .select("id,section_id")
      .eq("form_definition_id", data.form_definition_id);
    if (qErr) throw qErr;

    const questionSectionOrder = new Map<string, number>();
    for (const q of questions ?? []) {
      if (!q.section_id) continue;
      const order = orderBySectionId.get(q.section_id);
      if (order != null) questionSectionOrder.set(q.id, order);
    }

    const rulesWithFrom = data.rules.map((r) => ({
      ...r,
      from_order_index: questionSectionOrder.get(r.question_id) ?? -1,
    }));
    if (rulesWithFrom.some((r) => r.from_order_index < 0)) {
      throw new Error("Toda regra de ramificação precisa pertencer a uma pergunta de seção válida.");
    }

    const routingError = validateForwardOnlyRoutingWithQuestionSections(
      sectionList.map((s) => ({ order_index: s.order_index, title: null, default_next_order_index: null })),
      rulesWithFrom,
    );
    if (routingError) throw new Error(routingError);

    const questionIds = (questions ?? []).map((q) => q.id);
    const keepIds = data.rules.map((r) => r.id).filter((id): id is string => Boolean(id));

    if (questionIds.length > 0) {
      if (keepIds.length > 0) {
        await context.supabase
          .from("form_question_branch_rules")
          .delete()
          .in("question_id", questionIds)
          .not("id", "in", `(${keepIds.join(",")})`);
      } else {
        await context.supabase.from("form_question_branch_rules").delete().in("question_id", questionIds);
      }
    }

    for (const r of data.rules) {
      const nextSectionId = r.next_order_index != null ? (idByOrder.get(r.next_order_index) ?? null) : null;
      const row = {
        question_id: r.question_id,
        option_value: r.option_value,
        next_section_id: nextSectionId,
      };
      if (r.id) {
        const { error } = await context.supabase.from("form_question_branch_rules").update(row).eq("id", r.id);
        if (error) throw error;
      } else {
        const { error } = await context.supabase.from("form_question_branch_rules").insert(row);
        if (error) throw error;
      }
    }

    return { ok: true as const };
  });
