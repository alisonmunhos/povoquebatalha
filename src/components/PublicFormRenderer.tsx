// Motor genérico de formulário público, compartilhado entre a rota dinâmica
// /f/$slug e as rotas fixas (/recadastro, /atualizacao, /inscrever), que passam
// seu próprio slug fixo + parâmetros de busca (ref/recad_token) como props.
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Megaphone, CheckCircle2, MessageCircle, Loader2 } from "lucide-react";
import { useCepLookup, formatCep } from "@/hooks/use-cep";
import { useDeployRefresh } from "@/hooks/use-deploy-refresh";

export type AddressValue = {
  cep?: string; endereco?: string; numero?: string; complemento?: string;
  bairro?: string; referencia?: string; cidade?: string; uf?: string;
};
export type AnswerValue = string | string[] | boolean | AddressValue;

type FormQuestion = {
  id: string;
  label: string;
  help_text: string | null;
  required: boolean;
  response_type: "short_text" | "multiple_choice" | "yes_no" | "date" | "number" | "address_block";
  filter_kind: "text" | "multiselect" | "enum" | "boolean";
  options: { value: string; label: string }[] | null;
  depends_on: { key: string; value: boolean } | null;
  catalog_field_key: string | null;
};
type FormDefinition = {
  id: string;
  title: string;
  whatsapp_button_enabled: boolean;
  questions: FormQuestion[];
  initial_values: Record<string, AnswerValue> | null;
};
type WhatsappButtonInfo = { phone: string | null; message: string | null } | null;
type SuccessScreenOrder = "whatsapp_first" | "confirmation_first";

export function PublicFormRenderer({
  slug, refToken, recadToken,
}: {
  slug: string;
  refToken?: string;
  recadToken?: string;
}) {
  useDeployRefresh();
  const [form, setForm] = useState<FormDefinition | null | undefined>(undefined);
  const [values, setValues] = useState<Record<string, AnswerValue>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    nome: string;
    whatsapp_button: WhatsappButtonInfo;
    confirmation_enabled: boolean;
    success_screen_order: SuccessScreenOrder;
  } | null>(null);

  useEffect(() => {
    const url = recadToken ? `/api/public/forms/${slug}?t=${recadToken}` : `/api/public/forms/${slug}`;
    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        setForm(json.ok ? json.form : null);
        if (json.ok && json.form.initial_values) setValues(json.form.initial_values);
      })
      .catch(() => setForm(null));
  }, [slug, recadToken]);

  const set = (questionId: string, v: AnswerValue) => setValues((p) => ({ ...p, [questionId]: v }));
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
          ref_token: refToken ?? "",
          recad_token: recadToken ?? "",
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
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar");
    } finally {
      setSubmitting(false);
    }
  }

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
        {form === undefined ? (
          <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
        ) : form === null ? (
          <p className="text-muted-foreground">Formulário não encontrado ou indisponível.</p>
        ) : success ? (
          <SuccessScreen
            nome={success.nome}
            whatsappButton={success.whatsapp_button}
            confirmationEnabled={success.confirmation_enabled}
            order={success.success_screen_order}
          />
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
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
  onToggleMulti: (option: string) => void;
}) {
  const label = `${q.label}${q.required ? " *" : ""}`;

  if (q.response_type === "address_block") {
    return (
      <AddressBlockField
        label={label}
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
        <p className="text-sm font-medium mb-2">{label}</p>
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

/**
 * CEP dispara o autopreenchimento de rua/bairro/cidade/UF (mesmo mecanismo de
 * /recadastro via useCepLookup); número e complemento são sempre manuais; CEP
 * é opcional — sem ele, o resto continua editável à mão.
 */
function AddressBlockField({
  label, help_text, value, onChange,
}: {
  label: string;
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

function SuccessScreen({
  nome, whatsappButton, confirmationEnabled, order,
}: {
  nome: string;
  whatsappButton: WhatsappButtonInfo;
  confirmationEnabled: boolean;
  order: SuccessScreenOrder;
}) {
  const numeroDigits = (whatsappButton?.phone ?? "").replace(/\D+/g, "");
  const waMsg = encodeURIComponent(whatsappButton?.message || "Olá! Acabei de preencher o formulário da Campanha do Povo que Batalha.");
  const waUrl = numeroDigits ? `https://wa.me/${numeroDigits}?text=${waMsg}` : null;
  const showWhatsapp = Boolean(waUrl);
  const showConfirmation = confirmationEnabled;
  const both = showWhatsapp && showConfirmation;

  // A "ordem" só importa/aparece quando os dois blocos estão ativos ao mesmo tempo —
  // ela é puramente sobre a narrativa da tela, não cria dependência técnica real
  // entre a automação de confirmação e o botão de WhatsApp.
  const whatsappBlock = showWhatsapp && (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 space-y-2">
      {both && order === "confirmation_first" && (
        <p className="text-xs text-emerald-800">Ação extra opcional:</p>
      )}
      <a
        href={waUrl as string}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700"
      >
        <MessageCircle className="h-4 w-4" /> Avisar no WhatsApp
      </a>
      {both && order === "whatsapp_first" && (
        <p className="text-xs text-emerald-800">Em seguida você recebe uma confirmação automática pelo WhatsApp.</p>
      )}
    </div>
  );

  const confirmationBlock = showConfirmation && (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
      <p className="text-sm text-emerald-800">Você já vai receber uma confirmação automática pelo WhatsApp.</p>
    </div>
  );

  const orderedBlocks = order === "confirmation_first"
    ? [confirmationBlock, whatsappBlock]
    : [whatsappBlock, confirmationBlock];

  return (
    <div className="bg-card border rounded-xl p-6 space-y-5">
      <div className="flex items-center gap-2 text-emerald-700">
        <CheckCircle2 className="h-6 w-6" />
        <h1 className="text-xl font-semibold">Recebido!</h1>
      </div>
      <p className="text-sm">Obrigado, <strong>{nome}</strong>. Suas informações foram registradas.</p>
      {orderedBlocks[0]}
      {orderedBlocks[1]}
    </div>
  );
}
