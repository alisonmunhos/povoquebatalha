import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import {
  getFormDefinition, updateFormDefinition, upsertFormQuestions,
  saveFormConfirmationMessage, mintFormTrackedLink,
} from "@/lib/form-definitions.functions";
import { FORM_FIELD_CATALOG, CORE_CATALOG_FIELDS, FIXED_FORM_PUBLIC_PATHS, type FormCatalogField } from "@/lib/form-field-catalog";

import { ArrowLeft, Save, Plus, Trash2, ArrowUp, ArrowDown, Link as LinkIcon, MessageCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/entrada-dados/$id")({
  head: () => ({ meta: [{ title: "Construtor de formulário" }] }),
  component: FormBuilder,
});

type QuestionDraft = {
  id?: string;
  order_index: number;
  source: "catalog" | "custom";
  catalog_field_key: string | null;
  label: string;
  help_text: string | null;
  required: boolean;
};

function FormBuilder() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getFormDefinition);
  const updateFn = useServerFn(updateFormDefinition);
  const upsertQuestionsFn = useServerFn(upsertFormQuestions);
  const saveConfirmationFn = useServerFn(saveFormConfirmationMessage);
  const mintLinkFn = useServerFn(mintFormTrackedLink);

  const q = useQuery({ queryKey: ["form-definition", id], queryFn: () => getFn({ data: { id } }) });

  const [title, setTitle] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [confTitle, setConfTitle] = useState("");
  const [confBody, setConfBody] = useState("");
  const [confActive, setConfActive] = useState(true);
  const [waEnabled, setWaEnabled] = useState(true);
  const [waMessage, setWaMessage] = useState("");
  const [waPhone, setWaPhone] = useState("");
  const [successOrder, setSuccessOrder] = useState<"whatsapp_first" | "confirmation_first">("whatsapp_first");
  const [savingQuestions, setSavingQuestions] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingConfirmation, setSavingConfirmation] = useState(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [mintingLink, setMintingLink] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [coreQuestions, setCoreQuestions] = useState<QuestionDraft[]>([]);

  useEffect(() => {
    if (!q.data) return;
    setTitle(q.data.form.title as string);
    setIsActive(Boolean(q.data.form.is_active));
    const coreKeys = new Set(CORE_CATALOG_FIELDS.map((f) => f.key));
    const toDraft = (row: Record<string, unknown>): QuestionDraft => ({
      id: row.id as string,
      order_index: row.order_index as number,
      source: row.source as "catalog" | "custom",
      catalog_field_key: row.catalog_field_key as string | null,
      label: row.label as string,
      help_text: row.help_text as string | null,
      required: Boolean(row.required),
    });
    setCoreQuestions((q.data.questions ?? []).filter((row) => coreKeys.has(row.catalog_field_key as string)).map(toDraft));
    setQuestions((q.data.questions ?? []).filter((row) => !coreKeys.has(row.catalog_field_key as string)).map(toDraft));
    const tpl = q.data.template as { title?: string; body?: string } | null;
    const auto = q.data.automation as { active?: boolean } | null;
    setConfTitle(tpl?.title ?? "Confirmação");
    setConfBody(tpl?.body ?? "Olá, {{primeiro_nome}}! Recebemos suas informações. Obrigado!");
    setConfActive(auto ? Boolean(auto.active) : true);
    setWaEnabled(Boolean(q.data.form.whatsapp_button_enabled));
    setWaMessage((q.data.form.whatsapp_button_message as string | null) ?? "");
    setWaPhone((q.data.form.whatsapp_button_phone as string | null) ?? "+5551981951545");
    setSuccessOrder((q.data.form.success_screen_order as "whatsapp_first" | "confirmation_first" | undefined) ?? "whatsapp_first");
    const link = q.data.trackedLink as { token?: string } | null;
    setLinkToken(link?.token ?? null);
  }, [q.data]);

  if (q.isLoading || !q.data) return <div className="p-10 text-muted-foreground">Carregando…</div>;

  const usedCatalogKeys = new Set(questions.filter((qu) => qu.source === "catalog" && qu.catalog_field_key).map((qu) => qu.catalog_field_key));
  const availableCatalog = FORM_FIELD_CATALOG.filter((f) => !f.core && !usedCatalogKeys.has(f.key));

  function addCatalogField(field: FormCatalogField) {
    setQuestions((prev) => [
      ...prev,
      {
        order_index: prev.length,
        source: "catalog",
        catalog_field_key: field.key,
        label: field.defaultLabel,
        help_text: field.defaultHelpText ?? null,
        required: Boolean(field.alwaysRequired),
      },
    ]);
  }
  function addCustomQuestion() {
    setQuestions((prev) => [...prev, { order_index: prev.length, source: "custom", catalog_field_key: null, label: "", help_text: null, required: false }]);
  }
  function removeQuestion(idx: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== idx).map((qu, i) => ({ ...qu, order_index: i })));
  }
  function moveQuestion(idx: number, dir: -1 | 1) {
    setQuestions((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((qu, i) => ({ ...qu, order_index: i }));
    });
  }
  function updateQuestion(idx: number, patch: Partial<QuestionDraft>) {
    setQuestions((prev) => prev.map((qu, i) => (i === idx ? { ...qu, ...patch } : qu)));
  }

  async function saveSettings() {
    setSavingSettings(true);
    try {
      await updateFn({
        data: {
          id, title, is_active: isActive,
          whatsapp_button_enabled: waEnabled, whatsapp_button_message: waMessage || null,
          whatsapp_button_phone: waPhone,
          success_screen_order: successOrder,
        },
      });
      toast.success("Configurações salvas");
      q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveQuestions() {
    if (questions.some((qu) => !qu.label.trim())) { toast.error("Toda pergunta precisa de um enunciado."); return; }
    setSavingQuestions(true);
    try {
      const core: QuestionDraft[] = CORE_CATALOG_FIELDS.map((f, i) => {
        const existing = coreQuestions.find((qu) => qu.catalog_field_key === f.key);
        return {
          id: existing?.id, order_index: i, source: "catalog", catalog_field_key: f.key,
          label: existing?.label ?? f.defaultLabel, help_text: existing?.help_text ?? f.defaultHelpText ?? null, required: true,
        };
      });
      const all = [...core, ...questions].map((qu, i) => ({ ...qu, order_index: i }));
      await upsertQuestionsFn({ data: { form_definition_id: id, questions: all } });
      toast.success("Perguntas salvas");
      q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar perguntas");
    } finally {
      setSavingQuestions(false);
    }
  }

  async function saveConfirmation() {
    setSavingConfirmation(true);
    try {
      await saveConfirmationFn({ data: { form_definition_id: id, title: confTitle, body: confBody, active: confActive, require_consent: true } });
      toast.success("Mensagem de confirmação salva");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar mensagem");
    } finally {
      setSavingConfirmation(false);
    }
  }

  async function generateLink() {
    setMintingLink(true);
    try {
      const res = await mintLinkFn({ data: { form_definition_id: id } });
      setLinkToken((res.link as { token: string }).token);
      setQrDataUrl(null);
      toast.success("Link gerado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar link");
    } finally {
      setMintingLink(false);
    }
  }

  const isFixed = Boolean(q.data.form.is_fixed);
  const basePath = isFixed
    ? (FIXED_FORM_PUBLIC_PATHS[q.data.form.slug as string] ?? `/${q.data.form.slug}`)
    : `/f/${q.data.form.slug}`;
  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}${basePath}${linkToken ? `?ref=${linkToken}` : ""}` : "";

  async function loadQrCode() {
    if (!publicUrl) return;
    setLoadingQr(true);
    try {
      const { generateQrDataUrl } = await import("@/lib/qr-code-browser");
      const dataUrl = await generateQrDataUrl(publicUrl);
      setQrDataUrl(dataUrl);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar QR code");
    } finally {
      setLoadingQr(false);
    }
  }

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
      <Link to="/entrada-dados" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-4 w-4" />Voltar</Link>

      <Section title="Configurações">
        {isFixed && (
          <p className="text-xs bg-blue-50 text-blue-800 border border-blue-200 rounded-md px-3 py-2">
            Este é um formulário fixo do sistema (URL pública: <code>{basePath}</code>) — não pode ser excluído, mas todo o resto (perguntas, mensagem de confirmação, botão de WhatsApp) pode ser editado livremente, igual a um formulário novo.
          </p>
        )}
        <div>
          <label className="text-sm font-medium">Título</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Formulário ativo (aceita respostas)
        </label>
        <button onClick={saveSettings} disabled={savingSettings} className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
          <Save className="h-4 w-4" /> Salvar configurações
        </button>
      </Section>

      <Section title="Link e QR code">
        {publicUrl && <p className="text-sm break-all bg-muted/40 rounded-md p-2">{publicUrl}</p>}
        <div className="flex flex-wrap gap-2">
          <button onClick={generateLink} disabled={mintingLink} className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50">
            <LinkIcon className="h-4 w-4" /> {linkToken ? "Gerar novo link rastreável" : "Gerar link rastreável"}
          </button>
          {linkToken && (
            <button onClick={loadQrCode} disabled={loadingQr} className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50">
              {loadingQr ? "Gerando QR…" : "Gerar QR code"}
            </button>
          )}
        </div>
        {qrDataUrl && (
          <div className="space-y-2">
            <img src={qrDataUrl} alt="QR code do formulário" className="w-40 h-40 border rounded-md" />
            <a href={qrDataUrl} download={`qrcode-${q.data.form.slug}.png`} className="text-sm text-primary hover:underline">Baixar PNG</a>
          </div>
        )}
      </Section>

      <Section title="Perguntas">
        <p className="text-xs text-muted-foreground">Nome, WhatsApp e Consentimento sempre aparecem primeiro e não podem ser removidos.</p>
        {questions.map((qu, idx) => (
          <div key={idx} className="border rounded-md p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{qu.source === "catalog" ? `Campo do catálogo: ${qu.catalog_field_key}` : "Pergunta customizada"}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => moveQuestion(idx, -1)} className="p-1 hover:bg-muted rounded"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button onClick={() => moveQuestion(idx, 1)} className="p-1 hover:bg-muted rounded"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button onClick={() => removeQuestion(idx)} className="p-1 hover:bg-destructive/10 text-destructive rounded"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <input value={qu.label} onChange={(e) => updateQuestion(idx, { label: e.target.value })} placeholder="Enunciado da pergunta" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <input value={qu.help_text ?? ""} onChange={(e) => updateQuestion(idx, { help_text: e.target.value || null })} placeholder="Texto de ajuda (opcional)" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={qu.required} onChange={(e) => updateQuestion(idx, { required: e.target.checked })} /> Obrigatória
            </label>
          </div>
        ))}

        <div className="pt-2 space-y-2">
          <p className="text-sm font-medium">Adicionar campo do catálogo</p>
          <div className="flex flex-wrap gap-2">
            {availableCatalog.map((f) => (
              <button key={f.key} onClick={() => addCatalogField(f)} className="text-xs px-3 py-1.5 border rounded-full hover:bg-muted/60">
                {f.defaultLabel}
              </button>
            ))}
          </div>
          <button onClick={addCustomQuestion} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <Plus className="h-4 w-4" /> Pergunta customizada (texto livre)
          </button>
        </div>

        <button onClick={saveQuestions} disabled={savingQuestions} className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
          <Save className="h-4 w-4" /> Salvar perguntas
        </button>
      </Section>

      <Section title="Mensagem de confirmação (automática, via WhatsApp)">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={confActive} onChange={(e) => setConfActive(e.target.checked)} /> Enviar confirmação automática
        </label>
        {confActive && (
          <>
            <input value={confTitle} onChange={(e) => setConfTitle(e.target.value)} placeholder="Título interno" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <textarea value={confBody} onChange={(e) => setConfBody(e.target.value)} rows={4} placeholder="Use {{primeiro_nome}}, {{nome}}, {{cidade}}, {{bairro}}…" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </>
        )}
        <button onClick={saveConfirmation} disabled={savingConfirmation} className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
          <Save className="h-4 w-4" /> Salvar mensagem
        </button>
      </Section>

      <Section title="Botão de WhatsApp na tela de sucesso">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={waEnabled} onChange={(e) => setWaEnabled(e.target.checked)} /> Mostrar botão "Avisar no WhatsApp"
        </label>
        {waEnabled && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> Número de destino</label>
              <input value={waPhone} onChange={(e) => setWaPhone(e.target.value)} placeholder="+5551981951545" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> Mensagem pré-preenchida</label>
              <textarea value={waMessage} onChange={(e) => setWaMessage(e.target.value)} rows={2} placeholder="Ex.: Olá! Acabei de preencher o formulário..." className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Essa configuração é salva junto com "Salvar configurações" acima.</p>
      </Section>

      {waEnabled && confActive && (
        <Section title="Ordem na tela de sucesso">
          <p className="text-xs text-muted-foreground">
            As duas coisas continuam independentes — isso só decide qual bloco aparece primeiro.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="success_order" checked={successOrder === "whatsapp_first"} onChange={() => setSuccessOrder("whatsapp_first")} className="mt-1" />
            <span>Botão de WhatsApp primeiro — a confirmação que a pessoa recebe depois soa como resposta à mensagem que ela acabou de mandar.</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="success_order" checked={successOrder === "confirmation_first"} onChange={() => setSuccessOrder("confirmation_first")} className="mt-1" />
            <span>Confirmação primeiro — avisa que a pessoa já recebe a confirmação automaticamente, e o botão de WhatsApp aparece depois como ação extra opcional.</span>
          </label>
          <p className="text-xs text-muted-foreground">Essa configuração é salva junto com "Salvar configurações" acima.</p>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border rounded-xl bg-card p-4 space-y-3">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </div>
  );
}
