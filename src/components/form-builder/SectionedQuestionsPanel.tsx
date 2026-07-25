import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  type FormCatalogField,
} from "@/lib/form-field-catalog";
import CatalogFieldPicker from "@/components/form-builder/CatalogFieldPicker";
import {
  destinationLabel,
  getBranchableOptions,
  isBranchableQuestion,
  sectionLabel,
} from "@/lib/form-builder-branching";
import { upsertFormSections, upsertBranchRules } from "@/lib/form-sections.functions";
import { upsertFormQuestions, getFormDefinition } from "@/lib/form-definitions.functions";
import type { BranchRuleDraft, FormSectionType, SectionDraft } from "@/lib/form-sections.types";
import { CustomQuestionFields, type CustomQuestionDraft } from "@/components/form-builder/CustomQuestionFields";
import { CatalogOptionsPreview } from "@/components/form-builder/CatalogOptionsPreview";
import { getEffectiveQuestionShape, type CustomOption, type CustomResponseType } from "@/lib/form-question-shape";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Save, Trash2 } from "lucide-react";
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
  formDefaultWhatsappMessage?: string | null;
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
  formDefaultWhatsappMessage,
  onSaved,
}: Props) {
  const upsertSectionsFn = useServerFn(upsertFormSections);
  const upsertQuestionsFn = useServerFn(upsertFormQuestions);
  const upsertBranchRulesFn = useServerFn(upsertBranchRules);
  const getFn = useServerFn(getFormDefinition);

  const [sections, setSections] = useState<LocalSection[]>(() => toLocalSections(initialSections));
  const [questions, setQuestions] = useState<QuestionDraft[]>(() =>
    buildInitialQuestions(toLocalSections(initialSections), initialQuestions),
  );
  const [branchRules, setBranchRules] = useState<LocalBranchRule[]>(() =>
    buildInitialBranchRules(
      buildInitialQuestions(toLocalSections(initialSections), initialQuestions),
      initialBranchRules,
    ),
  );
  const [activeSectionKey, setActiveSectionKey] = useState(() => {
    const initial = toLocalSections(initialSections);
    return initial[0]?.clientKey ?? "";
  });
  const [expandedAdvanced, setExpandedAdvanced] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const activeSection = sections.find((s) => s.clientKey === activeSectionKey) ?? sections[0];
  const sectionQuestions = useMemo(
    () =>
      questions
        .filter((q) => q.sectionClientKey === activeSection?.clientKey)
        .sort((a, b) => a.order_index - b.order_index),
    [questions, activeSection?.clientKey],
  );

  const usedCatalogKeys = new Set(
    questions.filter((q) => q.source === "catalog" && q.catalog_field_key).map((q) => q.catalog_field_key!),
  );

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
  }

  function setSectionType(clientKey: string, sectionType: FormSectionType) {
    if (sectionType === "account_creation") {
      setQuestions((prev) => prev.filter((q) => q.sectionClientKey !== clientKey));
      setBranchRules((prev) => {
        const removedKeys = new Set(questions.filter((q) => q.sectionClientKey === clientKey).map((q) => q.clientKey));
        return prev.filter((r) => !removedKeys.has(r.questionClientKey));
      });
    }
    updateSection(clientKey, {
      section_type: sectionType,
      account_creation_role: sectionType === "account_creation" ? "agitador" : null,
    });
  }

  function removeSection(clientKey: string) {
    if (sections.length <= 1) {
      toast.error("O formulário precisa ter pelo menos uma seção.");
      return;
    }
    setSections((prev) => reindexSections(prev.filter((s) => s.clientKey !== clientKey)));
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
  }

  function moveSection(clientKey: string, dir: -1 | 1) {
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.clientKey === clientKey);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return reindexSections(next);
    });
  }

  function updateSection(clientKey: string, patch: Partial<SectionDraft>) {
    setSections((prev) => prev.map((s) => (s.clientKey === clientKey ? { ...s, ...patch } : s)));
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
  }

  function removeQuestion(clientKey: string) {
    const qu = questions.find((q) => q.clientKey === clientKey);
    if (!qu) return;
    const remaining = sectionQuestions.filter((q) => q.clientKey !== clientKey);
    setQuestions((prev) => reindexSectionQuestions(qu.sectionClientKey, remaining));
    setBranchRules((prev) => prev.filter((r) => r.questionClientKey !== clientKey));
  }

  function moveQuestion(clientKey: string, dir: -1 | 1) {
    const qu = questions.find((q) => q.clientKey === clientKey);
    if (!qu) return;
    const list = [...sectionQuestions];
    const idx = list.findIndex((q) => q.clientKey === clientKey);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    setQuestions((prev) => reindexSectionQuestions(qu.sectionClientKey, list));
  }

  function updateQuestion(clientKey: string, patch: Partial<QuestionDraft>) {
    setQuestions((prev) => prev.map((q) => (q.clientKey === clientKey ? { ...q, ...patch } : q)));
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
  }

  function forwardDestinations(fromOrderIndex: number) {
    return sections.filter((s) => s.order_index > fromOrderIndex);
  }

  async function saveAll() {
    if (sections.some((s) => !s.title?.trim())) {
      toast.error("Toda seção precisa de um título.");
      return;
    }
    if (questions.some((q) => {
      const section = sections.find((s) => s.clientKey === q.sectionClientKey);
      if (section?.section_type === "account_creation") return false;
      return !q.label.trim();
    })) {
      toast.error("Toda pergunta precisa de um enunciado.");
      return;
    }
    const linkErr = validateQuestionLinks(questions);
    if (linkErr) {
      toast.error(linkErr);
      return;
    }
    for (const q of questions) {
      if (q.source === "custom" && q.custom_response_type === "single_choice") {
        const filled = (q.custom_options ?? []).filter((o) => o.label.trim()).length;
        if (filled < 2) {
          toast.error(`"${q.label.trim() || "Pergunta customizada"}": escolha única precisa de pelo menos 2 alternativas preenchidas.`);
          return;
        }
      }
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
            success_screen_order: s.success_screen_order ?? null,
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

      const questionsToSave = questions.filter((q) => {
        const section = sections.find((s) => s.clientKey === q.sectionClientKey);
        return section?.section_type !== "account_creation";
      });

      await upsertQuestionsFn({
        data: {
          form_definition_id: formId,
          questions: questionsToSave.map((q) => ({
            id: q.id,
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

      const fresh2 = await getFn({ data: { id: formId } });
      const savedQuestions = fresh2.questions ?? [];
      const questionIdByClientKey = new Map<string, string>();
      for (const q of questionsToSave) {
        if (q.id) {
          const match = savedQuestions.find((row) => row.id === q.id);
          if (match) questionIdByClientKey.set(q.clientKey, match.id as string);
          continue;
        }
        const sectionId = sectionIdByClientKey.get(q.sectionClientKey);
        const match = savedQuestions.find(
          (row) =>
            row.section_id === sectionId &&
            row.order_index === q.order_index &&
            row.source === q.source &&
            (row.catalog_field_key ?? null) === (q.catalog_field_key ?? null) &&
            row.label === q.label,
        );
        if (match) questionIdByClientKey.set(q.clientKey, match.id as string);
      }

      const rulesPayload = branchRules
        .filter((r) => questionIdByClientKey.has(r.questionClientKey))
        .map((r) => ({
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
        setSections((prev) => mergeLocalSections(prev, serverSections));
      }

      toast.success("Seções e perguntas salvas");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (!activeSection) {
    return <p className="text-sm text-muted-foreground">Nenhuma seção encontrada.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Monte o formulário em etapas. Cada seção é uma tela; você pode ramificar respostas de escolha única
        para pular seções ou finalizar antes.
      </p>

      <div className="flex flex-wrap gap-2">
        {sections.map((s) => (
          <button
            key={s.clientKey}
            type="button"
            onClick={() => setActiveSectionKey(s.clientKey)}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              s.clientKey === activeSection.clientKey
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-muted/60"
            }`}
          >
            {sectionLabel(s.order_index, s.title)}
          </button>
        ))}
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
                <option value="account_creation">Criar conta</option>
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">
                &quot;Criar conta&quot; exibe uma tela fixa de cadastro (e-mail e senha), sem perguntas.
              </p>
            </div>
            {activeSection.section_type === "account_creation" && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
                <p className="font-medium">Seção de criação de conta</p>
                <p>
                  O participante verá e-mail (das etapas anteriores), senha e confirmação. Papel solicitado:{" "}
                  <strong>agitador</strong>.
                </p>
                <p>Certifique-se de que uma etapa anterior coleta nome, WhatsApp e e-mail.</p>
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
            <div>
              <label className="text-sm font-medium">Depois desta seção (padrão)</label>
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
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Finalizar formulário</option>
                {forwardDestinations(activeSection.order_index).map((s) => (
                  <option key={s.clientKey} value={String(s.order_index)}>
                    {sectionLabel(s.order_index, s.title)}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Usado quando nenhuma regra de ramificação abaixo se aplica.
              </p>
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

        <button
          type="button"
          onClick={() =>
            setExpandedAdvanced((prev) => ({
              ...prev,
              [activeSection.clientKey]: !prev[activeSection.clientKey],
            }))
          }
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {expandedAdvanced[activeSection.clientKey] ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Tela de sucesso desta seção (opcional)
        </button>

        {expandedAdvanced[activeSection.clientKey] && (
          <div className="space-y-3 border-t pt-3">
            <p className="text-xs text-muted-foreground">
              Só vale quando o fluxo termina nesta seção. Campos vazios usam a configuração geral do formulário.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={activeSection.confirmation_active === true}
                onChange={(e) =>
                  updateSection(activeSection.clientKey, {
                    confirmation_active: e.target.checked ? true : null,
                  })
                }
              />
              Enviar confirmação automática ao finalizar aqui
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={activeSection.whatsapp_button_enabled === true}
                onChange={(e) =>
                  updateSection(activeSection.clientKey, {
                    whatsapp_button_enabled: e.target.checked ? true : null,
                    ...(e.target.checked ? {} : { whatsapp_button_message: null }),
                  })
                }
              />
              Mostrar botão de WhatsApp ao finalizar aqui
            </label>
            {activeSection.whatsapp_button_enabled === true && (
              <div key={`${activeSection.clientKey}-wa`} className="space-y-1">
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
                      ? `Padrão do formulário: ${formDefaultWhatsappMessage.trim()}`
                      : "Mensagem pré-preenchida do WhatsApp (opcional)"
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  Deixe vazio para usar a mensagem padrão do formulário
                  {formDefaultWhatsappMessage?.trim() ? " (veja acima em Botão de WhatsApp)." : "."}
                </p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Ordem na tela de sucesso</label>
              <select
                value={activeSection.success_screen_order ?? ""}
                onChange={(e) =>
                  updateSection(activeSection.clientKey, {
                    success_screen_order: (e.target.value || null) as SectionDraft["success_screen_order"],
                  })
                }
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Usar configuração geral</option>
                <option value="whatsapp_first">WhatsApp primeiro</option>
                <option value="confirmation_first">Confirmação primeiro</option>
              </select>
            </div>
          </div>
        )}

        {activeSection.section_type !== "account_creation" && (
        <>
        <div className="space-y-3 border-t pt-3">
          <p className="text-sm font-medium">Perguntas desta seção</p>
          {sectionQuestions.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma pergunta ainda — adicione abaixo.</p>
          )}
          {sectionQuestions.map((qu) => {
            const branchOptions = getBranchableOptions(qu);
            return (
              <div key={qu.clientKey} className="border rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {qu.source === "catalog" ? `Campo do catálogo: ${qu.catalog_field_key}` : "Pergunta customizada"}
                  </span>
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
                    onChange={(e) => updateQuestion(qu.clientKey, { required: e.target.checked })}
                  />
                  Obrigatória
                </label>

                {isBranchableQuestion(qu) && (
                  <div className="rounded-md bg-muted/40 p-3 space-y-2">
                    <p className="text-xs font-medium">Ramificação por resposta</p>
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
        )}
      </div>

      {sections.length > 1 && (
        <div className="text-xs text-muted-foreground border rounded-md p-3 space-y-1">
          <p className="font-medium text-foreground">Resumo do fluxo</p>
          {sections.map((s) => (
            <p key={s.clientKey}>
              {sectionLabel(s.order_index, s.title)} →{" "}
              {destinationLabel(s.default_next_order_index ?? null, sections)}
            </p>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={saveAll}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
      >
        <Save className="h-4 w-4" /> {saving ? "Salvando…" : "Salvar seções e perguntas"}
      </button>
    </div>
  );
}
