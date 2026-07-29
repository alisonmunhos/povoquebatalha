import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  type FormCatalogField,
  getCatalogField,
} from "@/lib/form-field-catalog";
import CatalogFieldPicker from "@/components/form-builder/CatalogFieldPicker";
import {
  buildSectionFlowLines,
  destinationLabel,
  getBranchableOptions,
  isBranchableQuestion,
  sectionLabel,
} from "@/lib/form-builder-branching";
import { upsertFormSections, upsertBranchRules } from "@/lib/form-sections.functions";
import { upsertFormQuestions, getFormDefinition } from "@/lib/form-definitions.functions";
import { ensureCoreQuestionsInFirstSection, isCoreCatalogFieldKey } from "@/lib/form-section-core-questions";
import {
  effectiveBoolean,
  onOffLabel,
  overrideFromTriState,
  triStateFromOverride,
  type TriStateChoice,
} from "@/lib/form-builder-section-success";
import type { BranchRuleDraft, FormSectionType, SectionDraft } from "@/lib/form-sections.types";
import { CustomQuestionFields, type CustomQuestionDraft } from "@/components/form-builder/CustomQuestionFields";
import { CatalogOptionsPreview } from "@/components/form-builder/CatalogOptionsPreview";
import { getEffectiveQuestionShape, type CustomOption, type CustomResponseType } from "@/lib/form-question-shape";
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

type QuestionDraft = CustomQuestionDraft & {
  clientKey: string;
  id?: string;
  sectionClientKey: string;
  order_index: number;
  source: "catalog" | "custom";
  catalog_field_key: string | null;
  label: string;
  help_text: string | null;
  link_text: string | null;
  link_url: string | null;
  required: boolean;
};

type LocalSection = SectionDraft & { clientKey: string };

type LocalBranchRule = BranchRuleDraft & {
  questionClientKey: string;
};

type Props = {
  formId: string;
  initialSections: SectionDraft[];
  initialQuestions: Array<{
    id: string;
    section_id: string | null;
    order_index: number;
    source: string;
    catalog_field_key: string | null;
    label: string;
    help_text: string | null;
    link_text: string | null;
    link_url: string | null;
    required: boolean;
    custom_response_type?: string | null;
    custom_options?: CustomOption[] | null;
  }>;
  initialBranchRules: BranchRuleDraft[];
  formDefaultConfirmationActive?: boolean;
  formDefaultWhatsappEnabled?: boolean;
  formDefaultWhatsappPhone?: string | null;
  formDefaultWhatsappMessage?: string | null;
  formDefaultPushEnabled?: boolean;
  onSaved: () => void;
};

function newClientKey(): string {
  return crypto.randomUUID();
}

function toLocalSections(sections: SectionDraft[]): LocalSection[] {
  return sections.map((s) => ({
    ...s,
    clientKey: s.id ?? newClientKey(),
  }));
}

function mergeLocalSections(prev: LocalSection[], serverSections: SectionDraft[]): LocalSection[] {
  const clientKeyById = new Map(prev.filter((s) => s.id).map((s) => [s.id!, s.clientKey]));
  const clientKeyByOrder = new Map(prev.map((s) => [s.order_index, s.clientKey]));
  return serverSections.map((s) => ({
    ...s,
    clientKey:
      (s.id && clientKeyById.get(s.id)) ??
      clientKeyByOrder.get(s.order_index) ??
      s.id ??
      newClientKey(),
  }));
}

function buildInitialQuestions(
  sections: LocalSection[],
  rows: Props["initialQuestions"],
): QuestionDraft[] {
  const sectionKeyById = new Map(sections.map((s) => [s.id, s.clientKey]));
  return rows
    .filter((q) => q.section_id)
    .map((q) => ({
      clientKey: q.id,
      id: q.id,
      sectionClientKey: sectionKeyById.get(q.section_id!) ?? sections[0]?.clientKey ?? "",
      order_index: q.order_index,
      source: q.source as "catalog" | "custom",
      catalog_field_key: q.catalog_field_key,
      label: q.label,
      help_text: q.help_text,
      link_text: q.link_text,
      link_url: q.link_url,
      required: Boolean(q.required),
      custom_response_type: (q.custom_response_type as CustomResponseType | null) ?? "short_text",
      custom_options: (q.custom_options as CustomOption[] | null) ?? null,
    }));
}

function buildInitialBranchRules(
  questions: QuestionDraft[],
  rules: BranchRuleDraft[],
): LocalBranchRule[] {
  const keyByQuestionId = new Map(questions.filter((q) => q.id).map((q) => [q.id!, q.clientKey]));
  return rules
    .filter((r) => keyByQuestionId.has(r.question_id))
    .map((r) => ({
      ...r,
      questionClientKey: keyByQuestionId.get(r.question_id)!,
    }));
}

function validateQuestionLinks(items: QuestionDraft[]): string | null {
  for (const qu of items) {
    const hasText = Boolean(qu.link_text?.trim());
    const hasUrl = Boolean(qu.link_url?.trim());
    if (hasText !== hasUrl) {
      return "Em cada pergunta, preencha texto e URL do link juntos — ou deixe ambos vazios.";
    }
  }
  return null;
}

export function SectionedQuestionsPanel({
  formId,
  initialSections,
  initialQuestions,
  initialBranchRules,
  formDefaultConfirmationActive = false,
  formDefaultWhatsappEnabled = false,
  formDefaultWhatsappPhone,
  formDefaultWhatsappMessage,
  formDefaultPushEnabled = false,
  onSaved,
}: Props) {
  const upsertSectionsFn = useServerFn(upsertFormSections);
  const upsertQuestionsFn = useServerFn(upsertFormQuestions);
  const upsertBranchRulesFn = useServerFn(upsertBranchRules);
  const getFn = useServerFn(getFormDefinition);

  const [sections, setSections] = useState<LocalSection[]>(() => toLocalSections(initialSections));
  const [questions, setQuestions] = useState<QuestionDraft[]>(() => {
    const localSections = toLocalSections(initialSections);
    const built = buildInitialQuestions(localSections, initialQuestions);
    return ensureCoreQuestionsInFirstSection(localSections, built, newClientKey);
  });
  const [branchRules, setBranchRules] = useState<LocalBranchRule[]>(() => {
    const localSections = toLocalSections(initialSections);
    const built = ensureCoreQuestionsInFirstSection(
      localSections,
      buildInitialQuestions(localSections, initialQuestions),
      newClientKey,
    );
    return buildInitialBranchRules(built, initialBranchRules);
  });
  const [activeSectionKey, setActiveSectionKey] = useState(() => {
    const initial = toLocalSections(initialSections);
    return initial[0]?.clientKey ?? "";
  });
  const [dirtySections, setDirtySections] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);

  function markDirty(sectionClientKey: string) {
    setDirtySections((prev) => {
      if (prev.has(sectionClientKey)) return prev;
      const next = new Set(prev);
      next.add(sectionClientKey);
      return next;
    });
  }

  function markDirtyForQuestion(questionClientKey: string) {
    const qu = questions.find((q) => q.clientKey === questionClientKey);
    if (qu) markDirty(qu.sectionClientKey);
  }

  const activeSection = sections.find((s) => s.clientKey === activeSectionKey) ?? sections[0];
  const sectionQuestions = useMemo(
    () =>
      questions
        .filter((q) => q.sectionClientKey === activeSection?.clientKey)
        .sort((a, b) => a.order_index - b.order_index),
    [questions, activeSection?.clientKey],
  );

  // Núcleo (nome/whatsapp/consentimento): trava no formulário inteiro (só na Etapa 1).
  // Demais campos do catálogo: podem se repetir em seções diferentes, mas não na mesma seção.
  const usedCatalogKeys = new Set(
    questions
      .filter((q) => q.source === "catalog" && q.catalog_field_key)
      .filter((q) => {
        const cat = getCatalogField(q.catalog_field_key!);
        if (cat?.core) return true;
        return q.sectionClientKey === activeSection?.clientKey;
      })
      .map((q) => q.catalog_field_key!),
  );

  const isFirstSection = activeSection?.order_index === 0;

  function reindexSections(next: LocalSection[]): LocalSection[] {
    return next.map((s, i) => ({ ...s, order_index: i }));
  }

  function reindexSectionQuestions(sectionKey: string, items: QuestionDraft[]): QuestionDraft[] {
    const others = questions.filter((q) => q.sectionClientKey !== sectionKey);
    const reindexed = items.map((q, i) => ({ ...q, order_index: i }));
    return [...others, ...reindexed];
  }

  function addSection() {
    const clientKey = newClientKey();
    setSections((prev) => {
      const next = reindexSections([
        ...prev,
        {
          clientKey,
          order_index: prev.length,
          title: `Seção ${prev.length + 1}`,
          section_type: "questions",
          account_creation_role: "agitador",
          default_next_order_index: null,
        },
      ]);
      return next;
    });
    setActiveSectionKey(clientKey);
    markDirty(clientKey);
  }

  function setSectionType(clientKey: string, sectionType: FormSectionType) {
    const section = sections.find((s) => s.clientKey === clientKey);
    if (sectionType === "account_creation" && section?.order_index === 0) {
      toast.error("A primeira seção precisa ser de perguntas — ela contém Nome, WhatsApp e Consentimento.");
      return;
    }
    updateSection(clientKey, {
      section_type: sectionType,
      account_creation_role: sectionType === "account_creation" ? "agitador" : null,
    });
    markDirty(clientKey);
  }


  function removeSection(clientKey: string) {
    if (sections.length <= 1) {
      toast.error("O formulário precisa ter pelo menos uma seção.");
      return;
    }
    setSections((prev) => {
      const next = reindexSections(prev.filter((s) => s.clientKey !== clientKey));
      setQuestions((q) => ensureCoreQuestionsInFirstSection(next, q.filter((qu) => qu.sectionClientKey !== clientKey), newClientKey));
      return next;
    });
    setQuestions((prev) => prev.filter((q) => q.sectionClientKey !== clientKey));
    setBranchRules((prev) => {
      const removedQuestionKeys = new Set(
        questions.filter((q) => q.sectionClientKey === clientKey).map((q) => q.clientKey),
      );
      return prev.filter((r) => !removedQuestionKeys.has(r.questionClientKey));
    });
    if (activeSectionKey === clientKey) {
      const remaining = sections.filter((s) => s.clientKey !== clientKey);
      setActiveSectionKey(remaining[0]?.clientKey ?? "");
    }
    setDirtySections((prev) => {
      const next = new Set(prev);
      next.delete(clientKey);
      return next;
    });
  }

  function moveSection(clientKey: string, dir: -1 | 1) {
    const idx = sections.findIndex((s) => s.clientKey === clientKey);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= sections.length) return;
    const swappedKey = sections[target]!.clientKey;
    setSections((prev) => {
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      const reindexed = reindexSections(next);
      setQuestions((q) => ensureCoreQuestionsInFirstSection(reindexed, q, newClientKey));
      return reindexed;
    });
    markDirty(clientKey);
    markDirty(swappedKey);
  }

  function updateSection(clientKey: string, patch: Partial<SectionDraft>) {
    setSections((prev) => prev.map((s) => (s.clientKey === clientKey ? { ...s, ...patch } : s)));
    markDirty(clientKey);
  }

  function addCatalogField(field: FormCatalogField) {
    if (!activeSection) return;
    setQuestions((prev) => [
      ...prev,
      {
        clientKey: newClientKey(),
        sectionClientKey: activeSection.clientKey,
        order_index: sectionQuestions.length,
        source: "catalog",
        catalog_field_key: field.key,
        label: field.defaultLabel,
        help_text: field.defaultHelpText ?? null,
        link_text: null,
        link_url: null,
        required: Boolean(field.alwaysRequired),
      },
    ]);
    markDirty(activeSection.clientKey);
  }

  function addCustomQuestion() {
    if (!activeSection) return;
    setQuestions((prev) => [
      ...prev,
      {
        clientKey: newClientKey(),
        sectionClientKey: activeSection.clientKey,
        order_index: sectionQuestions.length,
        source: "custom",
        catalog_field_key: null,
        label: "",
        help_text: null,
        link_text: null,
        link_url: null,
        required: false,
        custom_response_type: "short_text",
        custom_options: null,
      },
    ]);
    markDirty(activeSection.clientKey);
  }

  function removeQuestion(clientKey: string) {
    const qu = questions.find((q) => q.clientKey === clientKey);
    if (!qu) return;
    if (qu.source === "catalog" && isCoreCatalogFieldKey(qu.catalog_field_key)) {
      toast.error("Nome, WhatsApp e Consentimento são fixos na primeira seção e não podem ser removidos.");
      return;
    }
    const remaining = sectionQuestions.filter((q) => q.clientKey !== clientKey);
    setQuestions((prev) => reindexSectionQuestions(qu.sectionClientKey, remaining));
    setBranchRules((prev) => prev.filter((r) => r.questionClientKey !== clientKey));
    markDirty(qu.sectionClientKey);
  }

  function moveQuestion(clientKey: string, dir: -1 | 1) {
    const qu = questions.find((q) => q.clientKey === clientKey);
    if (!qu) return;
    if (qu.source === "catalog" && isCoreCatalogFieldKey(qu.catalog_field_key)) {
      return;
    }
    const list = [...sectionQuestions];
    const idx = list.findIndex((q) => q.clientKey === clientKey);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    setQuestions((prev) => reindexSectionQuestions(qu.sectionClientKey, list));
    markDirty(qu.sectionClientKey);
  }

  function updateQuestion(clientKey: string, patch: Partial<QuestionDraft>) {
    const qu = questions.find((q) => q.clientKey === clientKey);
    setQuestions((prev) => prev.map((q) => (q.clientKey === clientKey ? { ...q, ...patch } : q)));
    if (qu) markDirty(qu.sectionClientKey);
  }

  function getBranchRule(questionClientKey: string, optionValue: string): LocalBranchRule | undefined {
    return branchRules.find((r) => r.questionClientKey === questionClientKey && r.option_value === optionValue);
  }

  function setBranchDestination(
    questionClientKey: string,
    optionValue: string,
    nextOrderIndex: number | null | "default",
  ) {
    setBranchRules((prev) => {
      const filtered = prev.filter(
        (r) => !(r.questionClientKey === questionClientKey && r.option_value === optionValue),
      );
      if (nextOrderIndex === "default") return filtered;
      const existing = prev.find(
        (r) => r.questionClientKey === questionClientKey && r.option_value === optionValue,
      );
      return [
        ...filtered,
        {
          id: existing?.id,
          questionClientKey,
          question_id: existing?.question_id ?? "",
          option_value: optionValue,
          next_order_index: nextOrderIndex,
        },
      ];
    });
    markDirtyForQuestion(questionClientKey);
  }

  function forwardDestinations(fromOrderIndex: number) {
    return sections.filter((s) => s.order_index > fromOrderIndex);
  }

  function validateForSave(): { ok: true } | { ok: false; message: string; sectionKey?: string } {
    for (const s of sections) {
      if (!s.title?.trim()) {
        return {
          ok: false,
          message: `${sectionLabel(s.order_index, s.title)} precisa de um título.`,
          sectionKey: s.clientKey,
        };
      }
    }

    for (const s of sections) {
      const sectionQs = questions.filter((q) => q.sectionClientKey === s.clientKey);
      for (const q of sectionQs) {
        if (!q.label.trim()) {
          return {
            ok: false,
            message: `${sectionLabel(s.order_index, s.title)}: toda pergunta precisa de um enunciado.`,
            sectionKey: s.clientKey,
          };
        }
        if (q.source === "custom" && q.custom_response_type === "single_choice") {
          const filled = (q.custom_options ?? []).filter((o) => o.label.trim()).length;
          if (filled < 2) {
            return {
              ok: false,
              message: `${sectionLabel(s.order_index, s.title)}: "${q.label.trim() || "Pergunta customizada"}" precisa de pelo menos 2 alternativas.`,
              sectionKey: s.clientKey,
            };
          }
        }
      }
    }


    const linkErr = validateQuestionLinks(questions);
    if (linkErr) return { ok: false, message: linkErr };

    return { ok: true };
  }

  function setSectionOverride(
    clientKey: string,
    field: "confirmation_active" | "whatsapp_button_enabled" | "push_button_enabled",
    choice: TriStateChoice,
  ) {
    const value = overrideFromTriState(choice);
    if (field === "whatsapp_button_enabled" && value !== true) {
      updateSection(clientKey, { whatsapp_button_enabled: value, whatsapp_button_message: null });
      return;
    }
    updateSection(clientKey, { [field]: value });
  }

  async function saveSection() {
    const validation = validateForSave();
    if (!validation.ok) {
      toast.error(validation.message);
      if (validation.sectionKey) setActiveSectionKey(validation.sectionKey);
      return;
    }
    setSaving(true);
    try {
      await upsertSectionsFn({
        data: {
          form_definition_id: formId,
          sections: sections.map((s) => ({
            id: s.id,
            order_index: s.order_index,
            title: s.title?.trim() || null,
            section_type: s.section_type ?? "questions",
            account_creation_role: s.section_type === "account_creation" ? (s.account_creation_role ?? "agitador") : null,
            description: s.description?.trim() || null,
            default_next_order_index: s.default_next_order_index ?? null,
            confirmation_active: s.confirmation_active ?? null,
            whatsapp_button_enabled: s.whatsapp_button_enabled ?? null,
            whatsapp_button_message: s.whatsapp_button_message ?? null,
            whatsapp_button_phone: s.whatsapp_button_phone?.trim() || null,
            success_screen_order: s.success_screen_order ?? null,
            push_button_enabled: s.push_button_enabled ?? null,
          })),
        },
      });

      const fresh = await getFn({ data: { id: formId } });
      const savedSections = fresh.sections?.sections ?? [];
      const sectionIdByOrder = new Map(savedSections.map((s) => [s.order_index, s.id]));
      const sectionIdByClientKey = new Map<string, string>();
      for (const s of sections) {
        const savedId = s.id ?? sectionIdByOrder.get(s.order_index);
        if (savedId) sectionIdByClientKey.set(s.clientKey, savedId);
      }

      const questionsWithCore = ensureCoreQuestionsInFirstSection(sections, questions, newClientKey);

      const questionsToSave = questionsWithCore;


      const missingSection = questionsToSave.find((q) => !sectionIdByClientKey.get(q.sectionClientKey));
      if (missingSection) {
        const sec = sections.find((s) => s.clientKey === missingSection.sectionClientKey);
        throw new Error(
          `Não foi possível vincular perguntas à ${sectionLabel(sec?.order_index ?? 0, sec?.title)}. Recarregue a página e tente de novo.`,
        );
      }

      const upsertResult = await upsertQuestionsFn({
        data: {
          form_definition_id: formId,
          questions: questionsToSave.map((q) => ({
            id: q.id,
            client_key: q.clientKey,
            order_index: q.order_index,
            source: q.source,
            catalog_field_key: q.catalog_field_key,
            label: q.label,
            help_text: q.help_text,
            link_text: q.link_text,
            link_url: q.link_url,
            required: q.required,
            section_id: sectionIdByClientKey.get(q.sectionClientKey) ?? null,
            custom_response_type: q.source === "custom" ? (q.custom_response_type ?? "short_text") : null,
            custom_options:
              q.source === "custom" && q.custom_response_type === "single_choice"
                ? (q.custom_options ?? [])
                : null,
          })),
        },
      });

      // Mapa determinístico: o servidor devolve o id salvo casando com o client_key
      // que enviamos, então regras de ramificação nunca dependem de casamento por rótulo.
      const questionIdByClientKey = new Map<string, string>();
      for (const row of upsertResult.saved ?? []) {
        if (row.client_key) questionIdByClientKey.set(row.client_key, row.id);
      }

      const unmappedRule = branchRules.find((r) => !questionIdByClientKey.has(r.questionClientKey));
      if (unmappedRule) {
        throw new Error(
          "Uma regra de ramificação ficou sem pergunta correspondente. Recarregue a página e tente de novo.",
        );
      }

      const rulesPayload = branchRules.map((r) => ({
        id: r.id,
        question_id: questionIdByClientKey.get(r.questionClientKey)!,
        option_value: r.option_value,
        next_order_index: r.next_order_index,
      }));

      await upsertBranchRulesFn({
        data: {
          form_definition_id: formId,
          rules: rulesPayload,
        },
      });

      const freshFinal = await getFn({ data: { id: formId } });
      const serverSections = freshFinal.sections?.sections ?? [];
      if (serverSections.length > 0) {
        const merged = mergeLocalSections(sections, serverSections);
        const rebuiltQuestions = ensureCoreQuestionsInFirstSection(
          merged,
          buildInitialQuestions(merged, (freshFinal.questions ?? []) as Props["initialQuestions"]),
          newClientKey,
        );
        setSections(merged);
        setQuestions(rebuiltQuestions);
        setBranchRules(
          buildInitialBranchRules(rebuiltQuestions, freshFinal.sections?.branchRules ?? []),
        );
      }

      toast.success("Seção salva com sucesso");
      setDirtySections(new Set());
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  function collectExplicitBranchRules(sectionKey: string) {
    const sectionQs = questions
      .filter((q) => q.sectionClientKey === sectionKey)
      .sort((a, b) => a.order_index - b.order_index);
    const rules: Array<{ questionLabel: string; optionLabel: string; nextOrderIndex: number | null }> = [];
    for (const qu of sectionQs) {
      if (!isBranchableQuestion(qu)) continue;
      for (const opt of getBranchableOptions(qu)) {
        const rule = getBranchRule(qu.clientKey, opt.value);
        if (!rule) continue;
        rules.push({
          questionLabel: qu.label.trim() || "Pergunta sem título",
          optionLabel: opt.label,
          nextOrderIndex: rule.next_order_index,
        });
      }
    }
    return rules;
  }

  const activeSectionFlowLines = useMemo(() => {
    if (!activeSection) return [];
    return buildSectionFlowLines(
      activeSection.default_next_order_index ?? null,
      sections,
      collectExplicitBranchRules(activeSection.clientKey),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- collectExplicitBranchRules reads branchRules/questions
  }, [activeSection, sections, questions, branchRules]);

  const hasUnsavedChanges = dirtySections.size > 0;

  const effectiveConfirmation = effectiveBoolean(
    activeSection?.confirmation_active,
    formDefaultConfirmationActive,
  );
  const effectiveWhatsapp = effectiveBoolean(
    activeSection?.whatsapp_button_enabled,
    formDefaultWhatsappEnabled,
  );
  const effectivePush = effectiveBoolean(
    activeSection?.push_button_enabled,
    formDefaultPushEnabled,
  );

  if (!activeSection) {
    return <p className="text-sm text-muted-foreground">Nenhuma seção encontrada.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Monte o formulário em etapas. Você pode trocar de seção à vontade — o que editou fica guardado
        na memória até clicar em <strong>Salvar seção</strong>. Use o salvamento como proteção se a
        internet cair ou a página fechar sem querer.
      </p>

      <div className="flex flex-wrap gap-2">
        {sections.map((s) => {
          const isActive = s.clientKey === activeSection.clientKey;
          const isDirty = dirtySections.has(s.clientKey);
          return (
            <button
              key={s.clientKey}
              type="button"
              onClick={() => setActiveSectionKey(s.clientKey)}
              className={`text-xs px-3 py-1.5 rounded-full border inline-flex items-center gap-1.5 ${
                isActive ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/60"
              }`}
            >
              {sectionLabel(s.order_index, s.title)}
              {isDirty && (
                <span
                  className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-primary-foreground/80" : "bg-amber-500"}`}
                  title="Alterações não salvas"
                />
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={addSection}
          className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border border-dashed hover:bg-muted/60"
        >
          <Plus className="h-3.5 w-3.5" /> Nova seção
        </button>
      </div>

      <div className="border rounded-xl bg-card p-4 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 space-y-3">
            <div>
              <label className="text-sm font-medium">Tipo da seção</label>
              <select
                value={activeSection.section_type ?? "questions"}
                onChange={(e) => setSectionType(activeSection.clientKey, e.target.value as FormSectionType)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="questions">Perguntas</option>
                <option value="account_creation" disabled={activeSection.order_index === 0}>
                  Criar conta{activeSection.order_index === 0 ? " (não na 1ª seção)" : ""}
                </option>
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">
                &quot;Criar conta&quot; exibe a tela de cadastro (e-mail e senha) e, opcionalmente, perguntas extras nesta mesma etapa.
              </p>
            </div>
            {activeSection.section_type === "account_creation" && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
                <p className="font-medium">Seção de criação de conta</p>
                <p>
                  O participante verá e-mail (das etapas anteriores), senha e confirmação. Papel solicitado:{" "}
                  <strong>agitador</strong>. Você também pode adicionar perguntas normais nesta seção — elas
                  aparecem logo abaixo dos campos de senha.
                </p>
                <p>Certifique-se de que a primeira seção tem Nome e WhatsApp e que uma etapa anterior inclui E-mail.</p>
              </div>
            )}

            <div>
              <label className="text-sm font-medium">Título da seção</label>
              <input
                value={activeSection.title ?? ""}
                onChange={(e) => updateSection(activeSection.clientKey, { title: e.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Instrução/descrição da seção (opcional)</label>
              <textarea
                value={activeSection.description ?? ""}
                onChange={(e) =>
                  updateSection(activeSection.clientKey, {
                    description: e.target.value || null,
                  })
                }
                rows={2}
                placeholder="Texto exibido abaixo do título desta etapa no formulário público"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => moveSection(activeSection.clientKey, -1)}
              className="p-1 hover:bg-muted rounded"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => moveSection(activeSection.clientKey, 1)}
              className="p-1 hover:bg-muted rounded"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => removeSection(activeSection.clientKey)}
              className="p-1 hover:bg-destructive/10 text-destructive rounded"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <>
        <div className="space-y-3 border-t pt-3">

          {isFirstSection && (
            <p className="text-xs text-muted-foreground rounded-md bg-muted/40 border px-3 py-2">
              <strong>Campos essenciais</strong> — Nome, WhatsApp e Consentimento ficam fixos nesta primeira seção.
              Você pode editar o texto de cada um, mas não removê-los.
            </p>
          )}
          <p className="text-sm font-medium">Perguntas desta seção</p>
          {sectionQuestions.length === 0 && !isFirstSection && (
            <p className="text-xs text-muted-foreground">Nenhuma pergunta ainda — adicione abaixo.</p>
          )}
          {sectionQuestions.map((qu) => {
            const isCore = qu.source === "catalog" && isCoreCatalogFieldKey(qu.catalog_field_key);
            const branchOptions = getBranchableOptions(qu);
            return (
              <div key={qu.clientKey} className={`border rounded-md p-3 space-y-2 ${isCore ? "border-primary/30 bg-primary/5" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {isCore ? (
                      <span className="font-medium text-primary">Campo essencial: {qu.catalog_field_key}</span>
                    ) : qu.source === "catalog" ? (
                      `Campo do catálogo: ${qu.catalog_field_key}`
                    ) : (
                      "Pergunta customizada"
                    )}
                  </span>
                  {!isCore && (
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveQuestion(qu.clientKey, -1)} className="p-1 hover:bg-muted rounded">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => moveQuestion(qu.clientKey, 1)} className="p-1 hover:bg-muted rounded">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => removeQuestion(qu.clientKey)} className="p-1 hover:bg-destructive/10 text-destructive rounded">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  )}
                </div>
                <input
                  value={qu.label}
                  onChange={(e) => updateQuestion(qu.clientKey, { label: e.target.value })}
                  placeholder="Enunciado da pergunta"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <input
                  value={qu.help_text ?? ""}
                  onChange={(e) => updateQuestion(qu.clientKey, { help_text: e.target.value || null })}
                  placeholder="Texto de ajuda (opcional)"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                {qu.source === "custom" && (
                  <CustomQuestionFields
                    value={qu}
                    onChange={(patch) => updateQuestion(qu.clientKey, patch)}
                  />
                )}
                <CatalogOptionsPreview question={qu} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    value={qu.link_text ?? ""}
                    onChange={(e) => updateQuestion(qu.clientKey, { link_text: e.target.value || null })}
                    placeholder="Texto do link (opcional)"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <input
                    value={qu.link_url ?? ""}
                    onChange={(e) => updateQuestion(qu.clientKey, { link_url: e.target.value || null })}
                    placeholder="URL do link (opcional)"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={qu.required}
                    disabled={isCore}
                    onChange={(e) => updateQuestion(qu.clientKey, { required: e.target.checked })}
                  />
                  Obrigatória{isCore ? " (sempre)" : ""}
                </label>

                {isBranchableQuestion(qu) && activeSection.section_type !== "account_creation" && (
                  <div className="rounded-md bg-violet-50/70 border border-violet-200/80 p-3 space-y-2">
                    <p className="text-xs font-medium text-violet-900">Para onde vai cada resposta desta pergunta?</p>
                    {branchOptions.map((opt) => {
                      const rule = getBranchRule(qu.clientKey, opt.value);
                      const value = !rule
                        ? ""
                        : rule.next_order_index == null
                          ? "__terminal__"
                          : String(rule.next_order_index);
                      return (
                        <div key={opt.value} className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="min-w-[5rem] text-muted-foreground">{opt.label}</span>
                          <span>→</span>
                          <select
                            value={value}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "") {
                                setBranchDestination(qu.clientKey, opt.value, "default");
                              } else if (v === "__terminal__") {
                                setBranchDestination(qu.clientKey, opt.value, null);
                              } else {
                                setBranchDestination(qu.clientKey, opt.value, Number(v));
                              }
                            }}
                            className="flex-1 min-w-[12rem] rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                          >
                            <option value="">Usar destino padrão da seção</option>
                            <option value="__terminal__">Finalizar formulário</option>
                            {forwardDestinations(activeSection.order_index).map((s) => (
                              <option key={s.clientKey} value={String(s.order_index)}>
                                {sectionLabel(s.order_index, s.title)}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                    <p className="text-[11px] text-muted-foreground">
                      Destinos só podem ser seções posteriores ou finalizar.
                    </p>
                  </div>
                )}
                {!isBranchableQuestion(qu) && getEffectiveQuestionShape(qu).filter_kind === "multiselect" && (
                  <p className="text-[11px] text-muted-foreground rounded-md bg-muted/40 p-3">
                    Essa pergunta permite marcar mais de uma opção ao mesmo tempo, por isso não pode decidir sozinha o próximo passo.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="pt-2 space-y-2 border-t">
          <p className="text-sm font-medium">Adicionar campo do catálogo</p>
          <CatalogFieldPicker usedCatalogKeys={usedCatalogKeys} onAdd={addCatalogField} />
          <button
            type="button"
            onClick={addCustomQuestion}
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <Plus className="h-4 w-4" /> Pergunta customizada
          </button>
        </div>
        </>



        <div className="space-y-3 border-t pt-4">
          <div>
            <p className="text-sm font-medium">Para onde vai depois desta etapa?</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              As regras por resposta (nas perguntas de escolha única acima) têm prioridade. O destino
              padrão abaixo só vale quando nenhuma regra se aplica.
            </p>
          </div>

          {activeSectionFlowLines.some((l) => l.kind === "branch") && (
            <div className="rounded-md border border-violet-200 bg-violet-50/60 p-3 space-y-1.5 text-sm">
              <p className="text-xs font-medium text-violet-900">Regras por resposta</p>
              {activeSectionFlowLines
                .filter((l) => l.kind === "branch")
                .map((line, i) => (
                  <p key={i} className="text-violet-950">
                    Se &quot;{line.questionLabel}&quot; = <strong>{line.optionLabel}</strong> → {line.destination}
                  </p>
                ))}
            </div>
          )}

          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <label className="text-sm font-medium">Destino padrão (quando nenhuma regra se aplica)</label>
            <select
              value={
                activeSection.default_next_order_index == null
                  ? ""
                  : String(activeSection.default_next_order_index)
              }
              onChange={(e) =>
                updateSection(activeSection.clientKey, {
                  default_next_order_index: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Finalizar formulário</option>
              {forwardDestinations(activeSection.order_index).map((s) => (
                <option key={s.clientKey} value={String(s.order_index)}>
                  {sectionLabel(s.order_index, s.title)}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              Resumo: demais casos →{" "}
              <strong>{destinationLabel(activeSection.default_next_order_index ?? null, sections)}</strong>
            </p>
          </div>
        </div>

        <div className="space-y-3 border-t pt-4">
          <div>
            <p className="text-sm font-medium">Se o participante terminar o formulário nesta etapa</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Isso só aparece quando o fluxo <strong>termina aqui</strong> (não quando segue para outra seção).
              Cada etapa pode seguir o padrão geral do formulário ou definir comportamento próprio.
            </p>
          </div>

          <div className="rounded-md border bg-muted/20 p-3 space-y-1 text-xs">
            <p className="font-medium text-foreground">O que o participante verá ao terminar aqui</p>
            <p>· Confirmação automática: <strong>{onOffLabel(effectiveConfirmation)}</strong></p>
            <p>· Botão de WhatsApp: <strong>{onOffLabel(effectiveWhatsapp)}</strong></p>
            <p className="text-muted-foreground">
              Padrão do formulário: confirmação {onOffLabel(formDefaultConfirmationActive)} · WhatsApp {onOffLabel(formDefaultWhatsappEnabled)}
              {" · "}Push {onOffLabel(formDefaultPushEnabled)}
              {formDefaultWhatsappEnabled && formDefaultWhatsappPhone?.trim() ? <> (nº padrão {formDefaultWhatsappPhone.trim()})</> : null}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Confirmação automática nesta etapa</label>
            <select
              value={triStateFromOverride(activeSection.confirmation_active)}
              onChange={(e) =>
                setSectionOverride(activeSection.clientKey, "confirmation_active", e.target.value as TriStateChoice)
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="default">
                Seguir padrão do formulário ({onOffLabel(formDefaultConfirmationActive)})
              </option>
              <option value="on">Sim — enviar confirmação ao terminar aqui</option>
              <option value="off">Não — não enviar confirmação ao terminar aqui</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Botão &quot;Avisar no WhatsApp&quot; nesta etapa</label>
            <select
              value={triStateFromOverride(activeSection.whatsapp_button_enabled)}
              onChange={(e) =>
                setSectionOverride(activeSection.clientKey, "whatsapp_button_enabled", e.target.value as TriStateChoice)
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="default">
                Seguir padrão do formulário ({onOffLabel(formDefaultWhatsappEnabled)})
              </option>
              <option value="on">Sim — mostrar botão ao terminar aqui</option>
              <option value="off">Não — não mostrar botão ao terminar aqui</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Botão &quot;Ativar notificações&quot; nesta etapa</label>
            <select
              value={triStateFromOverride(activeSection.push_button_enabled)}
              onChange={(e) =>
                setSectionOverride(activeSection.clientKey, "push_button_enabled", e.target.value as TriStateChoice)
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="default">
                Seguir padrão do formulário ({onOffLabel(formDefaultPushEnabled)})
              </option>
              <option value="on">Sim — mostrar ao terminar aqui</option>
              <option value="off">Não — não mostrar ao terminar aqui</option>
            </select>
            {effectivePush && (
              <p className="text-[11px] text-muted-foreground">
                O visitante poderá ativar alertas no celular sem criar conta — a inscrição fica vinculada ao contato salvo.
              </p>
            )}
          </div>

          {effectiveWhatsapp && (
            <div key={`${activeSection.clientKey}-wa`} className="space-y-3 rounded-md border bg-background p-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Número de WhatsApp para esta etapa (opcional)</label>
                <input
                  type="text"
                  value={activeSection.whatsapp_button_phone ?? ""}
                  onChange={(e) =>
                    updateSection(activeSection.clientKey, {
                      whatsapp_button_phone: e.target.value || null,
                    })
                  }
                  placeholder={
                    formDefaultWhatsappPhone?.trim()
                      ? `Vazio = usar padrão: ${formDefaultWhatsappPhone.trim()}`
                      : "Ex.: 5551999999999 (com DDI+DDD)"
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  Deixe em branco para usar o número padrão do formulário. Preencha para redirecionar esta etapa para um contato diferente.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Mensagem do botão nesta etapa (opcional)</label>
                <textarea
                  value={activeSection.whatsapp_button_message ?? ""}
                  onChange={(e) =>
                    updateSection(activeSection.clientKey, {
                      whatsapp_button_message: e.target.value || null,
                    })
                  }
                  rows={2}
                  placeholder={
                    formDefaultWhatsappMessage?.trim()
                      ? `Vazio = usar padrão: ${formDefaultWhatsappMessage.trim()}`
                      : "Mensagem pré-preenchida do WhatsApp (opcional)"
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}

          {effectiveConfirmation && effectiveWhatsapp && (
            <div>
              <label className="text-sm font-medium">Ordem na tela de sucesso desta etapa</label>
              <select
                value={activeSection.success_screen_order ?? ""}
                onChange={(e) =>
                  updateSection(activeSection.clientKey, {
                    success_screen_order: (e.target.value || null) as SectionDraft["success_screen_order"],
                  })
                }
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Seguir padrão do formulário</option>
                <option value="whatsapp_first">WhatsApp primeiro</option>
                <option value="confirmation_first">Confirmação primeiro</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {sections.length > 1 && (
        <div className="text-xs text-muted-foreground border rounded-md p-3 space-y-3">
          <p className="font-medium text-foreground">Resumo do fluxo do formulário</p>
          {sections.map((s) => {
            const lines = buildSectionFlowLines(
              s.default_next_order_index ?? null,
              sections,
              collectExplicitBranchRules(s.clientKey),
            );
            return (
              <div key={s.clientKey} className="space-y-0.5">
                <p className="font-medium text-foreground">{sectionLabel(s.order_index, s.title)}</p>
                {lines.map((line, i) =>
                  line.kind === "branch" ? (
                    <p key={i} className="pl-2">
                      · Se &quot;{line.questionLabel}&quot; = {line.optionLabel} → {line.destination}
                    </p>
                  ) : (
                    <p key={i} className="pl-2 text-muted-foreground">
                      · Demais casos → {line.destination}
                    </p>
                  ),
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={saveSection}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> {saving ? "Salvando…" : "Salvar seção"}
        </button>
        {hasUnsavedChanges && (
          <p className="text-xs text-amber-700">Há alterações não salvas neste formulário.</p>
        )}
      </div>
    </div>
  );
}
