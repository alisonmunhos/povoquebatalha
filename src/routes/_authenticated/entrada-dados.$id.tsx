import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import {
  getFormDefinition, updateFormDefinition, upsertFormQuestions,
  saveFormConfirmationMessage, mintFormTrackedLink,
} from "@/lib/form-definitions.functions";
import { CORE_CATALOG_FIELDS, FIXED_FORM_PUBLIC_PATHS, type FormCatalogField } from "@/lib/form-field-catalog";
import { SectionedQuestionsPanel } from "@/components/form-builder/SectionedQuestionsPanel";
import { CustomQuestionFields, type CustomQuestionDraft } from "@/components/form-builder/CustomQuestionFields";
import { CatalogOptionsPreview } from "@/components/form-builder/CatalogOptionsPreview";
import CatalogFieldPicker from "@/components/form-builder/CatalogFieldPicker";
import type { CustomOption, CustomResponseType } from "@/lib/form-question-shape";

import { ArrowLeft, Save, Plus, Trash2, ArrowUp, ArrowDown, Link as LinkIcon, MessageCircle, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/entrada-dados/$id")({
  head: () => ({ meta: [{ title: "Construtor de formulário" }] }),
  component: FormBuilder,
});

type QuestionDraft = CustomQuestionDraft & {
  id?: string;
  order_index: number;
  source: "catalog" | "custom";
  catalog_field_key: string | null;
  label: string;
  help_text: string | null;
  link_text: string | null;
  link_url: string | null;
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
  const [trackingName, setTrackingName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [confTitle, setConfTitle] = useState("");
  const [confBody, setConfBody] = useState("");
  const [confActive, setConfActive] = useState(true);
  const [waEnabled, setWaEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [waMessage, setWaMessage] = useState("");
  const [waPhone, setWaPhone] = useState("");
  const [successOrder, setSuccessOrder] = useState<"whatsapp_first" | "confirmation_first">("whatsapp_first");
  const [savingSection, setSavingSection] = useState(false);
  const [savingForm, setSavingForm] = useState(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [linkLabel, setLinkLabel] = useState("");
  const [trackedLinks, setTrackedLinks] = useState<Array<{ id: string; token: string; label: string | null; use_count: number }>>([]);
  const [mintingLink, setMintingLink] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [linkQr, setLinkQr] = useState<{ token: string; dataUrl: string } | null>(null);
  const [loadingLinkQr, setLoadingLinkQr] = useState<string | null>(null);
  const [coreQuestions, setCoreQuestions] = useState<QuestionDraft[]>([]);

  useEffect(() => {
    if (!q.data) return;
    setTitle(q.data.form.title as string);
    setTrackingName(((q.data.form as { tracking_name?: string | null }).tracking_name as string | null) ?? (q.data.form.title as string));
    setIsActive(Boolean(q.data.form.is_active));
    const coreKeys = new Set(CORE_CATALOG_FIELDS.map((f) => f.key));
    const toDraft = (row: Record<string, unknown>): QuestionDraft => ({
      id: row.id as string,
      order_index: row.order_index as number,
      source: row.source as "catalog" | "custom",
      catalog_field_key: row.catalog_field_key as string | null,
      label: row.label as string,
      help_text: row.help_text as string | null,
      link_text: (row.link_text as string | null) ?? null,
      link_url: (row.link_url as string | null) ?? null,
      required: Boolean(row.required),
      custom_response_type: (row.custom_response_type as CustomResponseType | null) ?? "short_text",
      custom_options: (row.custom_options as CustomOption[] | null) ?? null,
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
    setPushEnabled(Boolean((q.data.form as { push_button_enabled?: boolean }).push_button_enabled));
    setSuccessOrder((q.data.form.success_screen_order as "whatsapp_first" | "confirmation_first" | undefined) ?? "whatsapp_first");
    const link = q.data.trackedLink as { token?: string } | null;
    setLinkToken(link?.token ?? null);
    setTrackedLinks((q.data.trackedLinks as Array<{ id: string; token: string; label: string | null; use_count: number }>) ?? []);
  }, [q.data]);

  if (q.isLoading || !q.data) return <div className="p-10 text-muted-foreground">Carregando…</div>;

  const usedCatalogKeys = new Set([
    ...coreQuestions.map((qu) => qu.catalog_field_key).filter(Boolean) as string[],
    ...questions.filter((qu) => qu.source === "catalog" && qu.catalog_field_key).map((qu) => qu.catalog_field_key!),
  ]);

  function addCatalogField(field: FormCatalogField) {
    setQuestions((prev) => [
      ...prev,
      {
        order_index: prev.length,
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
    setQuestions((prev) => [...prev, {
      order_index: prev.length, source: "custom", catalog_field_key: null, label: "", help_text: null,
      link_text: null, link_url: null, required: false, custom_response_type: "short_text", custom_options: null,
    }]);
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

  async function saveFormulario() {
    setSavingForm(true);
    try {
      await updateFn({
        data: {
          id, title, tracking_name: trackingName.trim() || title, is_active: isActive,
          whatsapp_button_enabled: waEnabled, whatsapp_button_message: waMessage || null,
          whatsapp_button_phone: waPhone,
          push_button_enabled: pushEnabled,
          success_screen_order: successOrder,
        },
      });
      await saveConfirmationFn({
        data: { form_definition_id: id, title: confTitle, body: confBody, active: confActive, require_consent: true },
      });
      toast.success("Formulário salvo");
      q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar formulário");
    } finally {
      setSavingForm(false);
    }
  }

  function validateQuestionLinks(items: QuestionDraft[]): string | null {
    for (const qu of items) {
      const hasText = Boolean(qu.link_text?.trim());
      const hasUrl = Boolean(qu.link_url?.trim());
      if (hasText !== hasUrl) return "Em cada pergunta, preencha texto e URL do link juntos — ou deixe ambos vazios.";
    }
    return null;
  }

  async function saveSection() {
    if (questions.some((qu) => !qu.label.trim())) { toast.error("Toda pergunta precisa de um enunciado."); return; }
    const allDrafts = [
      ...CORE_CATALOG_FIELDS.map((f) => coreQuestions.find((qu) => qu.catalog_field_key === f.key)).filter(Boolean) as QuestionDraft[],
      ...questions,
    ];
    const linkErr = validateQuestionLinks(allDrafts);
    if (linkErr) { toast.error(linkErr); return; }
    for (const q of [...coreQuestions, ...questions]) {
      if (q.source === "custom" && q.custom_response_type === "single_choice") {
        const filled = (q.custom_options ?? []).filter((o) => o.label.trim()).length;
        if (filled < 2) {
          toast.error(`"${q.label.trim() || "Pergunta customizada"}": escolha única precisa de pelo menos 2 alternativas preenchidas.`);
          return;
        }
      }
    }
    setSavingSection(true);
    try {
      const core: QuestionDraft[] = CORE_CATALOG_FIELDS.map((f, i) => {
        const existing = coreQuestions.find((qu) => qu.catalog_field_key === f.key);
        return {
          id: existing?.id, order_index: i, source: "catalog", catalog_field_key: f.key,
          label: existing?.label ?? f.defaultLabel, help_text: existing?.help_text ?? f.defaultHelpText ?? null,
          link_text: existing?.link_text ?? null, link_url: existing?.link_url ?? null,
          required: true,
        };
      });
      const all = [...core, ...questions].map((qu, i) => ({
        ...qu,
        order_index: i,
        custom_response_type: qu.source === "custom" ? (qu.custom_response_type ?? "short_text") : null,
        custom_options:
          qu.source === "custom" && qu.custom_response_type === "single_choice"
            ? (qu.custom_options ?? [])
            : null,
      }));
      await upsertQuestionsFn({ data: { form_definition_id: id, questions: all } });
      toast.success("Seção salva");
      q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar seção");
    } finally {
      setSavingSection(false);
    }
  }

  async function generateLink() {
    const label = linkLabel.trim();
    if (label.length < 2) {
      toast.error("Informe um nome para o link.");
      return;
    }
    setMintingLink(true);
    try {
      const res = await mintLinkFn({ data: { form_definition_id: id, label } });
      const token = (res.link as { token: string }).token;
      setLinkToken(token);
      setLinkLabel("");
      setQrDataUrl(null);
      toast.success("Link gerado");
      q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar link");
    } finally {
      setMintingLink(false);
    }
  }

  const isFixed = Boolean(q.data.form.is_fixed);
  const layoutMode = ((q.data.form as { layout_mode?: string }).layout_mode ?? "flat") as "flat" | "sectioned";
  const isSectioned = layoutMode === "sectioned";
  const basePath = isFixed
    ? (FIXED_FORM_PUBLIC_PATHS[q.data.form.slug as string] ?? `/${q.data.form.slug}`)
    : `/f/${q.data.form.slug}`;

  function buildPublicUrl(token: string | null) {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}${basePath}${token ? `?ref=${token}` : ""}`;
  }

  const publicUrl = buildPublicUrl(linkToken);

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar o link");
    }
  }

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

  // QR de um link específico da lista: gera na hora e mostra dentro do cartão.
  async function loadQrForToken(token: string) {
    const url = buildPublicUrl(token);
    if (!url) return;
    setLoadingLinkQr(token);
    try {
      const { generateQrDataUrl } = await import("@/lib/qr-code-browser");
      const dataUrl = await generateQrDataUrl(url);
      setLinkQr({ token, dataUrl });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar QR code");
    } finally {
      setLoadingLinkQr(null);
    }
  }


  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
      <Link to="/entrada-dados" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-4 w-4" />Voltar</Link>

      <Section title="Configurações do formulário">
        {isSectioned && (
          <p className="text-xs bg-violet-50 text-violet-800 border border-violet-200 rounded-md px-3 py-2">
            Este formulário usa o modelo <strong>por seções</strong>. Configure os padrões gerais abaixo,
            depois monte cada etapa. Use <strong>Salvar seção</strong> para proteger o trabalho de cada etapa
            e <strong>Salvar formulário</strong> (no final) para título, links e padrões gerais.
          </p>
        )}
        {isFixed && (
          <p className="text-xs bg-blue-50 text-blue-800 border border-blue-200 rounded-md px-3 py-2">
            Este é um formulário fixo do sistema (URL pública: <code>{basePath}</code>) — não pode ser excluído, mas todo o resto (perguntas, mensagem de confirmação, botão de WhatsApp) pode ser editado livremente, igual a um formulário novo.
          </p>
        )}
        <div>
          <label className="text-sm font-medium">Título (público)</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-sm font-medium">Nome de rastreio (interno)</label>
          <p className="text-xs text-muted-foreground mb-1">Aparece nos filtros da Gestão da Base. Pode ser igual ao título ou mais específico.</p>
          <input value={trackingName} onChange={(e) => setTrackingName(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Formulário ativo (aceita respostas)
        </label>
        <p className="text-xs text-muted-foreground">Salve estas opções com <strong>Salvar formulário</strong> no final da página.</p>
      </Section>

      <Section title="Link e QR code">
        <div>
          <label className="text-sm font-medium">Nome do novo link</label>
          <input
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            placeholder="Ex.: QR na panfletagem do bairro"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            maxLength={120}
          />
        </div>
        {publicUrl && (
          <div className="space-y-2">
            <p className="text-sm break-all bg-muted/40 rounded-md p-2 font-mono">{publicUrl}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => copyToClipboard(publicUrl)}
                className="inline-flex items-center gap-1 text-xs rounded-md border px-2.5 py-1.5 hover:bg-muted/60"
              >
                <Copy className="h-3.5 w-3.5" /> Copiar
              </button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs rounded-md border px-2.5 py-1.5 hover:bg-muted/60"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Abrir
              </a>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button onClick={generateLink} disabled={mintingLink} className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50">
            <LinkIcon className="h-4 w-4" /> Gerar link rastreável
          </button>
          {linkToken && (
            <button onClick={loadQrCode} disabled={loadingQr} className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50">
              {loadingQr ? "Gerando QR…" : "Gerar QR code"}
            </button>
          )}
        </div>
        {qrDataUrl && (
          <div className="space-y-2">
            <img src={qrDataUrl} alt="QR code para abrir o formulário público de cadastro" className="w-40 h-40 border rounded-md" />
            <a href={qrDataUrl} download={`qrcode-${q.data.form.slug}.png`} className="text-sm text-primary hover:underline">Baixar PNG</a>
          </div>
        )}
        {trackedLinks.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Links deste formulário</p>
            <ul className="text-sm space-y-2">
              {trackedLinks.map((l) => {
                const linkUrl = buildPublicUrl(l.token);
                return (
                  <li key={l.id} className="border rounded-md p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{l.label || "Sem nome"}</span>
                      <span className="text-xs text-muted-foreground">{l.use_count} uso(s)</span>
                    </div>
                    <p className="text-xs break-all bg-muted/40 rounded-md p-2 font-mono">{linkUrl}</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs rounded-md border px-2.5 py-1.5 hover:bg-muted/60"
                        onClick={() => copyToClipboard(linkUrl)}
                      >
                        <Copy className="h-3.5 w-3.5" /> Copiar
                      </button>
                      <a
                        href={linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs rounded-md border px-2.5 py-1.5 hover:bg-muted/60"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Abrir
                      </a>
                      <button
                        type="button"
                        disabled={loadingLinkQr === l.token}
                        className="inline-flex items-center gap-1 text-xs rounded-md border px-2.5 py-1.5 hover:bg-muted/60 disabled:opacity-50"
                        onClick={() => loadQrForToken(l.token)}
                      >
                        <LinkIcon className="h-3.5 w-3.5" />
                        {loadingLinkQr === l.token ? "Gerando QR…" : "Gerar QR deste link"}
                      </button>
                    </div>
                    {linkQr?.token === l.token && (
                      <div className="space-y-1">
                        <img src={linkQr.dataUrl} alt={`QR code para abrir o link de cadastro ${l.label || "sem nome"}`} className="w-40 h-40 border rounded-md" />
                        <a
                          href={linkQr.dataUrl}
                          download={`qrcode-${(l.label || q.data.form.slug || "link").toString().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.png`}
                          className="text-sm text-primary hover:underline block"
                        >
                          Baixar PNG
                        </a>
                      </div>
                    )}
                  </li>

                );
              })}
            </ul>
          </div>
        )}
      </Section>

      <Section title="Padrões do formulário — tela de sucesso">
        <p className="text-xs text-muted-foreground">
          Configuração <strong>geral</strong>, usada quando o formulário termina em qualquer etapa que não
          defina regra própria. Em formulários por seções, cada etapa pode escolher: seguir este padrão,
          ligar ou desligar confirmação/WhatsApp só naquela etapa.
        </p>
        <p className="text-sm font-medium pt-1">Confirmação automática (mensagem via WhatsApp)</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={confActive} onChange={(e) => setConfActive(e.target.checked)} /> Enviar confirmação automática por padrão
        </label>
        {confActive && (
          <>
            <input value={confTitle} onChange={(e) => setConfTitle(e.target.value)} placeholder="Título interno" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <textarea value={confBody} onChange={(e) => setConfBody(e.target.value)} rows={4} placeholder="Use {{primeiro_nome}}, {{nome}}, {{cidade}}, {{bairro}}…" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </>
        )}
        <p className="text-sm font-medium pt-2">Botão &quot;Avisar no WhatsApp&quot; (padrão)</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={waEnabled} onChange={(e) => setWaEnabled(e.target.checked)} /> Mostrar botão por padrão ao finalizar
        </label>
        {waEnabled && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> Número de destino (único para todo o formulário)</label>
              <input value={waPhone} onChange={(e) => setWaPhone(e.target.value)} placeholder="+5551981951545" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> Mensagem pré-preenchida (padrão)</label>
              <textarea value={waMessage} onChange={(e) => setWaMessage(e.target.value)} rows={2} placeholder="Ex.: Olá! Acabei de preencher o formulário..." className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
          </div>
        )}
        <p className="text-sm font-medium pt-2">Botão &quot;Ativar notificações&quot; (padrão)</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={pushEnabled} onChange={(e) => setPushEnabled(e.target.checked)} /> Mostrar opção de alertas no celular ao finalizar
        </label>
        {pushEnabled && (
          <p className="text-xs text-muted-foreground">
            O visitante ativa push sem criar conta — a inscrição fica vinculada ao contato do formulário.
          </p>
        )}
        {waEnabled && confActive && (
          <>
            <p className="text-sm font-medium pt-2">Ordem na tela de sucesso (padrão geral)</p>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="success_order" checked={successOrder === "whatsapp_first"} onChange={() => setSuccessOrder("whatsapp_first")} className="mt-1" />
              <span>Botão de WhatsApp primeiro</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="success_order" checked={successOrder === "confirmation_first"} onChange={() => setSuccessOrder("confirmation_first")} className="mt-1" />
              <span>Confirmação primeiro</span>
            </label>
          </>
        )}
        <p className="text-xs text-muted-foreground">Salve com <strong>Salvar formulário</strong> no final da página.</p>
      </Section>

      <Section title={isSectioned ? "Seções e perguntas" : "Perguntas"}>
        {isSectioned ? (
          <SectionedQuestionsPanel
            formId={id}
            initialSections={q.data.sections?.sections ?? []}
            initialQuestions={(q.data.questions ?? []) as Array<{
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
            }>}
            initialBranchRules={q.data.sections?.branchRules ?? []}
            formDefaultConfirmationActive={confActive}
            formDefaultWhatsappEnabled={waEnabled}
            formDefaultWhatsappPhone={waPhone}
            formDefaultWhatsappMessage={waMessage || null}
            formDefaultPushEnabled={pushEnabled}
            onSaved={() => q.refetch()}
          />
        ) : (
          <>
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
            {qu.source === "custom" && (
              <CustomQuestionFields value={qu} onChange={(patch) => updateQuestion(idx, patch)} />
            )}
            <CatalogOptionsPreview question={qu} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={qu.link_text ?? ""} onChange={(e) => updateQuestion(idx, { link_text: e.target.value || null })} placeholder="Texto do link (opcional)" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              <input value={qu.link_url ?? ""} onChange={(e) => updateQuestion(idx, { link_url: e.target.value || null })} placeholder="URL do link (opcional)" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <p className="text-[11px] text-muted-foreground -mt-1">Link aparece ao lado do enunciado no formulário público — ex.: &quot;Veja os termos&quot; → https://… ou /privacidade</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={qu.required} onChange={(e) => updateQuestion(idx, { required: e.target.checked })} /> Obrigatória
            </label>
          </div>
        ))}

        <div className="pt-2 space-y-2">
          <p className="text-sm font-medium">Adicionar campo do catálogo</p>
          <CatalogFieldPicker
            usedCatalogKeys={usedCatalogKeys}
            hideCoreInConsentGroup
            onAdd={addCatalogField}
          />
          <button onClick={addCustomQuestion} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <Plus className="h-4 w-4" /> Pergunta customizada
          </button>
        </div>

        <button onClick={saveSection} disabled={savingSection} className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
          <Save className="h-4 w-4" /> {savingSection ? "Salvando…" : "Salvar seção"}
        </button>
          </>
        )}
      </Section>

      <div className="border rounded-xl bg-card p-4">
        <button
          onClick={saveFormulario}
          disabled={savingForm}
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> {savingForm ? "Salvando…" : "Salvar formulário"}
        </button>
        <p className="text-xs text-muted-foreground mt-2">
          Salva título, nome de rastreio, status ativo, confirmação automática e botão de WhatsApp padrão.
          {isSectioned ? " As seções são salvas separadamente com Salvar seção." : " As perguntas são salvas com Salvar seção acima."}
        </p>
      </div>
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
