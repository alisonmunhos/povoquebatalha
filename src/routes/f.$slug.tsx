import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { z } from "zod";
import { Megaphone, CheckCircle2, MessageCircle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/f/$slug")({
  validateSearch: z.object({ ref: z.string().min(8).max(48).optional() }),
  ssr: false,
  component: PublicFormPage,
});

type FormQuestion = {
  id: string;
  label: string;
  help_text: string | null;
  required: boolean;
  response_type: "short_text" | "multiple_choice" | "yes_no" | "date" | "number";
  filter_kind: "text" | "multiselect" | "enum" | "boolean";
  options: { value: string; label: string }[] | null;
  depends_on: { key: string; value: boolean } | null;
  catalog_field_key: string | null;
};
type FormDefinition = { id: string; title: string; whatsapp_button_enabled: boolean; questions: FormQuestion[] };
type WhatsappButtonInfo = { numero_conectado: string | null; message: string | null } | null;

function PublicFormPage() {
  const { slug } = Route.useParams();
  const { ref } = Route.useSearch();
  const [form, setForm] = useState<FormDefinition | null | undefined>(undefined);
  const [values, setValues] = useState<Record<string, string | string[] | boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ nome: string; whatsapp_button: WhatsappButtonInfo } | null>(null);

  useEffect(() => {
    fetch(`/api/public/forms/${slug}`)
      .then((r) => r.json())
      .then((json) => setForm(json.ok ? json.form : null))
      .catch(() => setForm(null));
  }, [slug]);

  const set = (questionId: string, v: string | string[] | boolean) => setValues((p) => ({ ...p, [questionId]: v }));
  const toggleMulti = (questionId: string, option: string) => {
    const cur = (values[questionId] as string[]) ?? [];
    set(questionId, cur.includes(option) ? cur.filter((x) => x !== option) : [...cur, option]);
  };

  const parentAnswers = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const q of form?.questions ?? []) {
      if (q.catalog_field_key && typeof values[q.id] === "boolean") map[q.catalog_field_key] = values[q.id] as boolean;
    }
    return map;
  }, [form, values]);

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
          ref_token: ref ?? "",
          answers: values,
          hp: String(fd.get("hp") ?? ""),
        }),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) throw new Error(json.error ?? "Erro ao enviar");
      setSuccess({ nome: json.nome, whatsapp_button: json.whatsapp_button ?? null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center">
          <Link to="/" className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            <span className="font-semibold">Campanha do Povo que Batalha</span>
          </Link>
        </div>
      </header>
      <main className="max-w-md mx-auto px-6 py-10">
        {form === undefined ? (
          <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
        ) : form === null ? (
          <p className="text-muted-foreground">Formulário não encontrado ou indisponível.</p>
        ) : success ? (
          <SuccessScreen nome={success.nome} whatsappButton={success.whatsapp_button} />
        ) : (
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
        )}
      </main>
    </div>
  );
}

function QuestionField({
  q, value, onChange, onToggleMulti,
}: {
  q: FormQuestion;
  value: string | string[] | boolean | undefined;
  onChange: (v: string | string[] | boolean) => void;
  onToggleMulti: (option: string) => void;
}) {
  const label = `${q.label}${q.required ? " *" : ""}`;

  if (q.response_type === "yes_no") {
    return (
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" required={q.required} checked={value === true} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4" />
        <span>{label}</span>
      </label>
    );
  }

  if (q.response_type === "multiple_choice" && q.filter_kind === "multiselect") {
    const cur = (value as string[]) ?? [];
    return (
      <div>
        <p className="text-sm font-medium mb-2">{label}</p>
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
    return (
      <div>
        <label className="text-sm font-medium">{label}</label>
        <select
          required={q.required}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Selecione…</option>
          {(q.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {q.help_text && <p className="text-xs text-muted-foreground mt-1">{q.help_text}</p>}
      </div>
    );
  }

  const inputType = q.response_type === "date" ? "date" : q.response_type === "number" ? "number" : "text";
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
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

function SuccessScreen({ nome, whatsappButton }: { nome: string; whatsappButton: WhatsappButtonInfo }) {
  const numeroDigits = (whatsappButton?.numero_conectado ?? "").replace(/\D+/g, "");
  const waMsg = encodeURIComponent(whatsappButton?.message || "Olá! Acabei de preencher o formulário da Campanha do Povo que Batalha.");
  const waUrl = numeroDigits ? `https://wa.me/${numeroDigits}?text=${waMsg}` : null;

  return (
    <div className="bg-card border rounded-xl p-6 space-y-5">
      <div className="flex items-center gap-2 text-emerald-700">
        <CheckCircle2 className="h-6 w-6" />
        <h1 className="text-xl font-semibold">Recebido!</h1>
      </div>
      <p className="text-sm">Obrigado, <strong>{nome}</strong>. Suas informações foram registradas.</p>
      {waUrl && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 space-y-2">
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700"
          >
            <MessageCircle className="h-4 w-4" /> Avisar no WhatsApp
          </a>
        </div>
      )}
    </div>
  );
}
