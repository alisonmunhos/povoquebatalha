// Motor genérico de formulário público, compartilhado entre a rota dinâmica
// /f/$slug e as rotas fixas (/recadastro, /atualizacao, /inscrever), que passam
// seu próprio slug fixo + parâmetros de busca (ref/recad_token) como props.
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Megaphone, CheckCircle2, MessageCircle, Loader2, ChevronRight, Eye, EyeOff } from "lucide-react";
import { useCepLookup, formatCep } from "@/hooks/use-cep";
import { useDeployRefresh } from "@/hooks/use-deploy-refresh";
import { resolveNextSectionId, sortSections, findFirstRequiredEmpty } from "@/lib/form-sections-routing";
import { buildSuccessBlocks } from "@/lib/form-success-blocks";
import type { SuccessScreenOrder } from "@/lib/form-sections.types";
import { PublicFormPushButton } from "@/components/PublicFormPushButton";

export type AddressValue = {
  cep?: string; endereco?: string; numero?: string; complemento?: string;
  bairro?: string; referencia?: string; cidade?: string; uf?: string;
};
export type AnswerValue = string | string[] | boolean | AddressValue;

type FormQuestion = {
  id: string;
  label: string;
  help_text: string | null;
  link_text: string | null;
  link_url: string | null;
  required: boolean;
  response_type: "short_text" | "multiple_choice" | "yes_no" | "date" | "number" | "address_block";
  filter_kind: "text" | "multiselect" | "enum" | "boolean";
  options: { value: string; label: string }[] | null;
  depends_on: { key: string; value: boolean } | null;
  catalog_field_key: string | null;
  source: "catalog" | "custom";
};
type FormDefinition = {
  id: string;
  title: string;
  whatsapp_button_enabled: boolean;
  questions: FormQuestion[];
  initial_values: Record<string, AnswerValue> | null;
};
type FormSection = {
  id: string;
  order_index: number;
  title: string | null;
  section_type?: "questions" | "account_creation";
  account_creation_role?: string | null;
  description: string | null;
  default_next_section_id: string | null;
};
type ContactContext = {
  email: string | null;
  nome: string | null;
  phone: string | null;
  email_already_registered: boolean;
};
type BranchRule = {
  question_id: string;
  option_value: string;
  next_section_id: string | null;
};
type SectionedFormDefinition = {
  id: string;
  title: string;
  questions: Array<FormQuestion & { section_id: string | null }>;
  sections: FormSection[];
  branch_rules: BranchRule[];
  initial_values: Record<string, AnswerValue> | null;
  start_section_id: string | null;
  contact_context?: ContactContext | null;
};
type WhatsappButtonInfo = { phone: string | null; message: string | null } | null;

export function PublicFormRenderer({
  slug, refToken, recadToken, startSectionId,
}: {
  slug: string;
  refToken?: string;
  recadToken?: string;
  startSectionId?: string;
}) {
  useDeployRefresh();
  const [form, setForm] = useState<FormDefinition | null | undefined>(undefined);
  const [sectionedForm, setSectionedForm] = useState<SectionedFormDefinition | null>(null);
  const [layoutMode, setLayoutMode] = useState<"flat" | "sectioned" | null>(null);
  const [currentSectionId, setCurrentSectionId] = useState<string | null>(null);
  const [journeyStartSectionId, setJourneyStartSectionId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, AnswerValue>>({});
  const [activeRecadToken, setActiveRecadToken] = useState(recadToken ?? "");
  const [contactContext, setContactContext] = useState<ContactContext | null>(null);
  const [accountPassword, setAccountPassword] = useState("");
  const [accountPasswordConfirm, setAccountPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailAlreadyRegistered, setEmailAlreadyRegistered] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    nome: string;
    whatsapp_button: WhatsappButtonInfo;
    confirmation_enabled: boolean;
    success_screen_order: SuccessScreenOrder;
    push_button_enabled: boolean;
    contact_id: string | null;
  } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (recadToken) params.set("t", recadToken);
    if (startSectionId) params.set("s", startSectionId);
    const qs = params.toString();
    const url = `/api/public/forms/${slug}${qs ? `?${qs}` : ""}`;
    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) {
          setForm(null);
          setSectionedForm(null);
          setLayoutMode("flat");
          return;
        }
        const mode = (json.form.layout_mode as "flat" | "sectioned" | undefined) ?? "flat";
        setLayoutMode(mode);
        if (mode === "sectioned") {
          const loaded = json.form as SectionedFormDefinition;
          setSectionedForm(loaded);
          setForm(null);
          if (loaded.initial_values) setValues(loaded.initial_values);
          const sections = sortSections(loaded.sections ?? []);
          const startId = loaded.start_section_id && sections.some((s) => s.id === loaded.start_section_id)
            ? loaded.start_section_id
            : sections[0]?.id ?? null;
          setJourneyStartSectionId(startId);
          setCurrentSectionId(startId);
          if (json.form.contact_context) {
            setContactContext(json.form.contact_context);
            setEmailAlreadyRegistered(Boolean(json.form.contact_context.email_already_registered));
          }
          return;
        }
        setSectionedForm(null);
        setForm(json.form);
        if (json.form.initial_values) setValues(json.form.initial_values);
      })
      .catch(() => {
        setForm(null);
        setSectionedForm(null);
        setLayoutMode("flat");
      });
  }, [slug, recadToken, startSectionId]);

  const sections = useMemo(() => sortSections(sectionedForm?.sections ?? []), [sectionedForm]);
  const currentSection = sections.find((s) => s.id === currentSectionId) ?? sections[0];
  const isAccountSection = currentSection?.section_type === "account_creation";
  const sectionQuestions = useMemo(
    () => (sectionedForm?.questions ?? []).filter((q) => q.section_id === currentSection?.id),
    [sectionedForm, currentSection?.id],
  );

  const set = (questionId: string, v: AnswerValue) => setValues((p) => ({ ...p, [questionId]: v }));
  const toggleMulti = (questionId: string, option: string) => {
    const cur = (values[questionId] as string[]) ?? [];
    set(questionId, cur.includes(option) ? cur.filter((x) => x !== option) : [...cur, option]);
  };

  const parentAnswers = useMemo(() => {
    const map: Record<string, boolean> = {};
    const allQuestions = layoutMode === "sectioned"
      ? (sectionedForm?.questions ?? [])
      : (form?.questions ?? []);
    for (const q of allQuestions) {
      if (q.catalog_field_key && typeof values[q.id] === "boolean") map[q.catalog_field_key] = values[q.id] as boolean;
    }
    return map;
  }, [form, sectionedForm, layoutMode, values]);

  function validateCurrentSection(): string | null {
    const visible = sectionQuestions.filter(
      (q) => !q.depends_on || parentAnswers[q.depends_on.key] === q.depends_on.value,
    );
    return findFirstRequiredEmpty(visible, values, parentAnswers);
  }


  function validateAccountSection(): string | null {
    if (!isAccountSection || emailAlreadyRegistered) return null;
    if (!accountPassword || accountPassword.length < 8) {
      return "A senha precisa ter pelo menos 8 caracteres.";
    }
    if (!/[a-zA-Z]/.test(accountPassword) || !/\d/.test(accountPassword)) {
      return "Use pelo menos uma letra e um número na senha.";
    }
    if (accountPassword !== accountPasswordConfirm) {
      return "As senhas não coincidem.";
    }
    return null;
  }

  async function saveSectionProgress(): Promise<boolean> {
    if (!sectionedForm || !currentSection || isAccountSection) return true;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`/api/public/forms/${slug}/section-progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ref_token: refToken ?? "",
          recad_token: activeRecadToken || "",
          current_section_id: currentSection.id,
          answers: values,
          hp: "",
        }),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) throw new Error(json.error ?? "Erro ao salvar progresso");
      if (json.recad_token) setActiveRecadToken(json.recad_token);
      if (json.email != null || json.nome != null || json.phone != null) {
        setContactContext((prev) => ({
          email: json.email ?? prev?.email ?? null,
          nome: json.nome ?? prev?.nome ?? null,
          phone: json.phone ?? prev?.phone ?? null,
          email_already_registered: prev?.email_already_registered ?? false,
        }));
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar progresso");
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function submitAccountSection(): Promise<boolean> {
    if (!sectionedForm || !currentSection) return false;
    if (emailAlreadyRegistered) return true;
    if (!activeRecadToken) {
      setError("Salve as etapas anteriores antes de criar a conta.");
      return false;
    }
    if (accountPassword !== accountPasswordConfirm) {
      setError("As senhas não coincidem.");
      return false;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`/api/public/forms/${slug}/account-section`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recad_token: activeRecadToken,
          section_id: currentSection.id,
          password: accountPassword,
          password_confirm: accountPasswordConfirm,
          answers: values,
          ref_token: refToken ?? "",
          hp: "",
        }),
      });

      const json = await r.json();
      if (r.status === 409 && json.code === "email_already_registered") {
        setEmailAlreadyRegistered(true);
        setError(json.error ?? "E-mail já cadastrado.");
        return true;
      }
      if (!r.ok || !json.ok) throw new Error(json.error ?? "Erro ao criar conta");
      setAccountPassword("");
      setAccountPasswordConfirm("");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar conta");
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function submitFinal(terminalSectionId: string) {
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`/api/public/forms/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ref_token: refToken ?? "",
          recad_token: activeRecadToken || recadToken || "",
          terminal_section_id: terminalSectionId,
          start_section_id: journeyStartSectionId ?? terminalSectionId,
          answers: values,
          hp: "",
        }),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) throw new Error(json.error ?? "Erro ao enviar");
      setSuccess({
        nome: json.nome,
        whatsapp_button: json.whatsapp_button ?? null,
        confirmation_enabled: Boolean(json.confirmation_enabled),
        success_screen_order: json.success_screen_order === "confirmation_first" ? "confirmation_first" : "whatsapp_first",
        push_button_enabled: Boolean(json.push_button_enabled),
        contact_id: typeof json.contact_id === "string" ? json.contact_id : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar");
    } finally {
      setSubmitting(false);
    }
  }

  async function onContinueSectioned(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!sectionedForm || !currentSection) return;
    setError(null);
    const validationError = validateCurrentSection() ?? validateAccountSection();
    if (validationError) {
      setError(validationError);
      return;
    }

    const nextId = resolveNextSectionId(
      currentSection.id,
      sections,
      sectionedForm.questions,
      sectionedForm.branch_rules ?? [],
      values,
    );

    if (isAccountSection) {
      const ok = await submitAccountSection();
      if (!ok) return;
      if (nextId) {
        setCurrentSectionId(nextId);
        return;
      }
      void submitFinal(currentSection.id);
      return;
    }

    if (nextId) {
      const saved = await saveSectionProgress();
      if (!saved) return;
      setCurrentSectionId(nextId);
      return;
    }
    void submitFinal(currentSection.id);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    const fd = new FormData(e.currentTarget);
    setSubmitting(true);
    try {
      const r = await fetch(`/api/public/forms/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ref_token: refToken ?? "",
          recad_token: activeRecadToken || recadToken || "",
          answers: values,
          hp: String(fd.get("hp") ?? ""),
        }),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) throw new Error(json.error ?? "Erro ao enviar");
      setSuccess({
        nome: json.nome,
        whatsapp_button: json.whatsapp_button ?? null,
        confirmation_enabled: Boolean(json.confirmation_enabled),
        success_screen_order: json.success_screen_order === "confirmation_first" ? "confirmation_first" : "whatsapp_first",
        push_button_enabled: Boolean(json.push_button_enabled),
        contact_id: typeof json.contact_id === "string" ? json.contact_id : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar");
    } finally {
      setSubmitting(false);
    }
  }

  const isLoading = layoutMode === null && form === undefined && !sectionedForm;
  const isMissing = layoutMode === "flat" && form === null;
  const isSectionedMissing = layoutMode === "sectioned" && (!sectionedForm || !currentSection);
  const sectionTitle = currentSection?.title?.trim() || `Etapa ${(currentSection?.order_index ?? 0) + 1}`;
  const sectionIndex = sections.findIndex((s) => s.id === currentSection?.id);
  const progressLabel = sections.length > 1 ? `Etapa ${sectionIndex + 1} de ${sections.length}` : null;
  const hasNextSection = sectionedForm && currentSection
    ? Boolean(resolveNextSectionId(
      currentSection.id,
      sections,
      sectionedForm.questions,
      sectionedForm.branch_rules ?? [],
      values,
    ))
    : false;

  return (
    <div className="min-h-screen bg-muted/20" translate="no">
      <header className="border-b bg-background">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center">
          <Link to="/" className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            <span className="font-semibold">Campanha do Povo que Batalha</span>
          </Link>
        </div>
      </header>
      <main className="max-w-md mx-auto px-6 py-10">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
        ) : isMissing || isSectionedMissing ? (
          <p className="text-muted-foreground">Formulário não encontrado ou indisponível.</p>
        ) : success ? (
          <SuccessScreen
            nome={success.nome}
            whatsappButton={success.whatsapp_button}
            confirmationEnabled={success.confirmation_enabled}
            order={success.success_screen_order}
            pushEnabled={success.push_button_enabled}
            contactId={success.contact_id}
          />
        ) : layoutMode === "sectioned" && sectionedForm && currentSection ? (
          <>
            <h1 className="text-3xl font-bold tracking-tight">{sectionedForm.title}</h1>
            {progressLabel && <p className="text-sm text-muted-foreground mt-1">{progressLabel}</p>}
            <form onSubmit={onContinueSectioned} className="mt-6 space-y-5 bg-card border rounded-xl p-6">
              <h2 className="text-lg font-semibold">{sectionTitle}</h2>
              {currentSection.description?.trim() && (
                <p className="text-xs text-muted-foreground -mt-2">{currentSection.description.trim()}</p>
              )}
              <input type="text" name="hp" tabIndex={-1} autoComplete="off" className="hidden" />
              {isAccountSection ? (
                <>
                  <AccountCreationFields
                    email={contactContext?.email ?? ""}
                    nome={contactContext?.nome ?? ""}
                    phone={contactContext?.phone ?? ""}
                    emailAlreadyRegistered={emailAlreadyRegistered}
                    password={accountPassword}
                    passwordConfirm={accountPasswordConfirm}
                    showPassword={showPassword}
                    onPasswordChange={setAccountPassword}
                    onPasswordConfirmChange={setAccountPasswordConfirm}
                    onToggleShowPassword={() => setShowPassword((p) => !p)}
                  />
                  {sectionQuestions
                    .filter((q) => !q.depends_on || parentAnswers[q.depends_on.key] === q.depends_on.value)
                    .map((q) => (
                      <QuestionField key={q.id} q={q} value={values[q.id]} onChange={(v) => set(q.id, v)} onToggleMulti={(opt) => toggleMulti(q.id, opt)} />
                    ))}
                </>
              ) : (
                sectionQuestions
                  .filter((q) => !q.depends_on || parentAnswers[q.depends_on.key] === q.depends_on.value)
                  .map((q) => (
                    <QuestionField key={q.id} q={q} value={values[q.id]} onChange={(v) => set(q.id, v)} onToggleMulti={(opt) => toggleMulti(q.id, opt)} />
                  ))
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
              <button type="submit" disabled={submitting} className="w-full rounded-md bg-primary text-primary-foreground py-2.5 font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
                <ChevronRight className="h-4 w-4" />
                {submitting ? "Enviando…" : hasNextSection ? "Continuar" : "Enviar"}
              </button>
            </form>
          </>
        ) : form ? (
          <>
            <h1 className="text-3xl font-bold tracking-tight">{form.title}</h1>
            <form onSubmit={onSubmit} className="mt-6 space-y-5 bg-card border rounded-xl p-6">
              <input type="text" name="hp" tabIndex={-1} autoComplete="off" className="hidden" />
              {form.questions
                .filter((q) => !q.depends_on || parentAnswers[q.depends_on.key] === q.depends_on.value)
                .map((q) => (
                  <QuestionField key={q.id} q={q} value={values[q.id]} onChange={(v) => set(q.id, v)} onToggleMulti={(opt) => toggleMulti(q.id, opt)} />
                ))}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <button type="submit" disabled={submitting} className="w-full rounded-md bg-primary text-primary-foreground py-2.5 font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                {submitting ? "Enviando…" : "Enviar"}
              </button>
            </form>
          </>
        ) : null}
      </main>
    </div>
  );
}

function QuestionLabel({ label, linkText, linkUrl }: { label: string; linkText?: string | null; linkUrl?: string | null }) {
  const showLink = Boolean(linkText?.trim() && linkUrl?.trim());
  return (
    <span className="inline">
      {label}
      {showLink && (
        <>
          {" "}
          <a
            href={linkUrl!.trim()}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80"
            onClick={(e) => e.stopPropagation()}
          >
            {linkText!.trim()}
          </a>
        </>
      )}
    </span>
  );
}

export function QuestionField({
  q, value, onChange, onToggleMulti,
}: {
  q: FormQuestion;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
  onToggleMulti: (option: string) => void;
}) {
  const labelNode = <QuestionLabel label={`${q.label}${q.required ? " *" : ""}`} linkText={q.link_text} linkUrl={q.link_url} />;

  if (q.response_type === "address_block") {
    return (
      <AddressBlockField
        label={labelNode}
        help_text={q.help_text}
        value={value as AddressValue | undefined}
        onChange={onChange}
      />
    );
  }

  // "Coletivo Alicerce" pediu aparência diferenciada (Sim/Não em destaque de cor)
  // — caso especial só desse campo; os demais yes_no continuam checkbox simples.
  // Obrigatoriedade/posição/presença continuam decididas por formulário, sem mudança
  // aqui: usa radio (não botão solto) só pra manter a validação nativa de "required".
  if (q.response_type === "yes_no" && q.catalog_field_key === "coletivo_alicerce") {
    const name = `q-${q.id}`;
    return (
      <div>
        <p className="text-sm font-medium mb-2">{labelNode}</p>
        <div className="flex gap-2">
          <label
            className={`flex-1 text-center rounded-md border px-4 py-2 text-sm font-medium cursor-pointer transition ${
              value === true ? "bg-emerald-600 text-white border-emerald-600" : "bg-background border-input hover:bg-muted"
            }`}
          >
            <input type="radio" name={name} required={q.required} checked={value === true} onChange={() => onChange(true)} className="sr-only" />
            Sim
          </label>
          <label
            className={`flex-1 text-center rounded-md border px-4 py-2 text-sm font-medium cursor-pointer transition ${
              value === false ? "bg-rose-600 text-white border-rose-600" : "bg-background border-input hover:bg-muted"
            }`}
          >
            <input type="radio" name={name} required={q.required} checked={value === false} onChange={() => onChange(false)} className="sr-only" />
            Não
          </label>
        </div>
        {q.help_text && <p className="text-xs text-muted-foreground mt-1">{q.help_text}</p>}
      </div>
    );
  }

  if (q.response_type === "yes_no") {
    return (
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" required={q.required} checked={value === true} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4" />
        <span>{labelNode}</span>
      </label>
    );
  }

  if (q.response_type === "multiple_choice" && q.filter_kind === "multiselect") {
    const cur = (value as string[]) ?? [];
    return (
      <div>
        <p className="text-sm font-medium mb-2">{labelNode}</p>
        <div className="grid grid-cols-1 gap-1.5">
          {(q.options ?? []).map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cur.includes(o.value)} onChange={() => onToggleMulti(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
        {q.help_text && <p className="text-xs text-muted-foreground mt-1">{q.help_text}</p>}
      </div>
    );
  }

  if (q.response_type === "multiple_choice") {
    const name = `q-${q.id}`;
    const current = (value as string) ?? "";
    return (
      <div>
        <p className="text-sm font-medium mb-2">{labelNode}</p>
        <div className="flex flex-col gap-2">
          {(q.options ?? []).map((o) => {
            const isSelected = current === o.value;
            return (
              <label
                key={o.value}
                className={`rounded-md border px-4 py-2.5 text-sm font-medium cursor-pointer transition ${
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-input hover:bg-muted"
                }`}
              >
                <input
                  type="radio"
                  name={name}
                  required={q.required}
                  checked={isSelected}
                  onChange={() => onChange(o.value)}
                  className="sr-only"
                />
                {o.label}
              </label>
            );
          })}
        </div>
        {q.help_text && <p className="text-xs text-muted-foreground mt-1">{q.help_text}</p>}
      </div>
    );
  }


  const inputType = q.response_type === "date" ? "date" : q.response_type === "number" ? "number" : "text";
  return (
    <div>
      <label className="text-sm font-medium">{labelNode}</label>
      <input
        type={inputType}
        required={q.required}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      {q.help_text && <p className="text-xs text-muted-foreground mt-1">{q.help_text}</p>}
    </div>
  );
}

/**
 * CEP dispara o autopreenchimento de rua/bairro/cidade/UF (mesmo mecanismo de
 * /recadastro via useCepLookup); número e complemento são sempre manuais; CEP
 * é opcional — sem ele, o resto continua editável à mão.
 */
function AddressBlockField({
  label, help_text, value, onChange,
}: {
  label: ReactNode;
  help_text: string | null;
  value: AddressValue | undefined;
  onChange: (v: AddressValue) => void;
}) {
  const v = value ?? {};
  const cepHook = useCepLookup();

  async function onCepChange(raw: string) {
    const formatted = formatCep(raw);
    onChange({ ...v, cep: formatted });
    const digits = formatted.replace(/\D/g, "");
    if (digits.length === 8) {
      const res = await cepHook.lookup(digits);
      if (res) {
        onChange({
          ...v,
          cep: formatted,
          endereco: res.endereco ?? v.endereco,
          bairro: res.bairro ?? v.bairro,
          cidade: res.cidade ?? v.cidade,
          uf: res.uf ?? v.uf,
        });
      }
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{label}</p>
      {help_text && <p className="text-xs text-muted-foreground -mt-2">{help_text}</p>}
      <div>
        <label className="text-xs text-muted-foreground">CEP {cepHook.loading ? "(buscando…)" : ""}</label>
        <input
          value={v.cep ?? ""}
          onChange={(e) => onCepChange(e.target.value)}
          placeholder="00000-000"
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        {cepHook.error && <p className="text-xs text-amber-600 mt-1">{cepHook.error}</p>}
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Endereço (rua/avenida)</label>
        <input
          value={v.endereco ?? ""}
          onChange={(e) => onChange({ ...v, endereco: e.target.value })}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <input
          value={v.numero ?? ""}
          onChange={(e) => onChange({ ...v, numero: e.target.value })}
          placeholder="Número"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <input
          value={v.complemento ?? ""}
          onChange={(e) => onChange({ ...v, complemento: e.target.value })}
          placeholder="Complemento"
          className="col-span-2 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Bairro</label>
        <input
          value={v.bairro ?? ""}
          onChange={(e) => onChange({ ...v, bairro: e.target.value })}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Ponto de referência</label>
        <input
          value={v.referencia ?? ""}
          onChange={(e) => onChange({ ...v, referencia: e.target.value })}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <input
          value={v.cidade ?? ""}
          onChange={(e) => onChange({ ...v, cidade: e.target.value })}
          placeholder="Cidade"
          className="col-span-2 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <input
          value={v.uf ?? ""}
          onChange={(e) => onChange({ ...v, uf: e.target.value.toUpperCase().slice(0, 2) })}
          placeholder="UF"
          maxLength={2}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}

function AccountCreationFields({
  email,
  nome,
  phone,
  emailAlreadyRegistered,
  password,
  passwordConfirm,
  showPassword,
  onPasswordChange,
  onPasswordConfirmChange,
  onToggleShowPassword,
}: {
  email: string;
  nome: string;
  phone: string;
  emailAlreadyRegistered: boolean;
  password: string;
  passwordConfirm: string;
  showPassword: boolean;
  onPasswordChange: (v: string) => void;
  onPasswordConfirmChange: (v: string) => void;
  onToggleShowPassword: () => void;
}) {
  const inputType = showPassword ? "text" : "password";
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Crie sua conta para acessar o painel da campanha. Um administrador precisará aprovar seu acesso.
      </p>
      {nome && (
        <div>
          <label className="text-sm font-medium">Nome completo</label>
          <input
            readOnly
            value={nome}
            className="mt-1 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm"
          />
        </div>
      )}
      {phone && (
        <div>
          <label className="text-sm font-medium">WhatsApp</label>
          <input
            readOnly
            value={phone}
            className="mt-1 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm"
          />
        </div>
      )}
      <div>
        <label className="text-sm font-medium">E-mail</label>
        <input
          type="email"
          readOnly
          value={email}
          className="mt-1 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm"
        />
        {!email && (
          <p className="text-xs text-amber-600 mt-1">Volte às etapas anteriores e informe seu e-mail.</p>
        )}
      </div>

      {emailAlreadyRegistered ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-sm text-amber-900">
            Este e-mail já está cadastrado. Você pode fazer login com sua conta existente e continuar o formulário.
          </p>
          <Link
            to="/auth"
            className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
          >
            Fazer login
          </Link>
        </div>
      ) : (
        <>
          <div>
            <label className="text-sm font-medium">Senha</label>
            <div className="relative mt-1">
              <input
                type={inputType}
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                autoComplete="new-password"
                className="w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm"
              />
              <button
                type="button"
                onClick={onToggleShowPassword}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Mínimo 8 caracteres, com letras e números.</p>
          </div>
          <div>
            <label className="text-sm font-medium">Confirmar senha</label>
            <input
              type={inputType}
              value={passwordConfirm}
              onChange={(e) => onPasswordConfirmChange(e.target.value)}
              autoComplete="new-password"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </>
      )}
    </div>
  );
}

export function SuccessScreen({
  nome, whatsappButton, confirmationEnabled, order, pushEnabled, contactId,
}: {
  nome: string;
  whatsappButton: WhatsappButtonInfo;
  confirmationEnabled: boolean;
  order: SuccessScreenOrder;
  pushEnabled: boolean;
  contactId: string | null;
}) {
  const numeroDigits = (whatsappButton?.phone ?? "").replace(/\D+/g, "");
  const waMsg = encodeURIComponent(whatsappButton?.message || "Olá! Acabei de preencher o formulário da Campanha do Povo que Batalha.");
  const waUrl = numeroDigits ? `https://wa.me/${numeroDigits}?text=${waMsg}` : null;

  const blocks = buildSuccessBlocks({
    whatsappUrl: waUrl,
    confirmationEnabled,
    pushEnabled,
    contactId,
    order,
  });

  const showWhatsapp = Boolean(waUrl);
  const showConfirmation = confirmationEnabled;
  const both = showWhatsapp && showConfirmation;

  function renderBlock(block: ReturnType<typeof buildSuccessBlocks>[number], index: number) {
    if (block.type === "whatsapp") {
      const isFirstWhatsapp = blocks.findIndex((b) => b.type === "whatsapp") === index;
      const isLastWhatsapp = blocks.map((b) => b.type).lastIndexOf("whatsapp") === index;
      return (
        <div key={`wa-${index}`} className="rounded-md border border-emerald-200 bg-emerald-50 p-4 space-y-2">
          {both && order === "confirmation_first" && isFirstWhatsapp && (
            <p className="text-xs text-emerald-800">Ação extra opcional:</p>
          )}
          <a
            href={block.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700"
          >
            <MessageCircle className="h-4 w-4" /> Avisar no WhatsApp
          </a>
          {both && order === "whatsapp_first" && isLastWhatsapp && (
            <p className="text-xs text-emerald-800">Em seguida você recebe uma confirmação automática pelo WhatsApp.</p>
          )}
        </div>
      );
    }
    if (block.type === "confirmation") {
      return (
        <div key={`conf-${index}`} className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-800">Você já vai receber uma confirmação automática pelo WhatsApp.</p>
        </div>
      );
    }
    return <PublicFormPushButton key={`push-${block.contactId}`} contactId={block.contactId} />;
  }

  return (
    <div className="bg-card border rounded-xl p-6 space-y-5">
      <div className="flex items-center gap-2 text-emerald-700">
        <CheckCircle2 className="h-6 w-6" />
        <h1 className="text-xl font-semibold">Recebido!</h1>
      </div>
      <p className="text-sm">Obrigado, <strong>{nome}</strong>. Suas informações foram registradas.</p>
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}
