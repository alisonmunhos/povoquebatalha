import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { Megaphone, CheckCircle2, Loader2 } from "lucide-react";
import { useCepLookup, formatCep } from "@/hooks/use-cep";

export const Route = createFileRoute("/recadastro")({
  validateSearch: z.object({
    origem: z.string().max(80).optional(),
    t: z.string().uuid().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Recadastro de Apoiadores" },
      { name: "description", content: "Atualize seus dados para continuar recebendo notícias e participar das ações da campanha." },
      { property: "og:title", content: "Recadastro de Apoiadores" },
      { property: "og:description", content: "Confirme seu cadastro e receba informações da campanha pelo WhatsApp." },
    ],
  }),
  ssr: false,
  component: Recadastro,
});

function Recadastro() {
  const navigate = useNavigate();
  const { origem, t } = Route.useSearch();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const cepHook = useCepLookup();
  const numeroRef = useRef<HTMLInputElement>(null);

  async function onCepChange(v: string) {
    const formatted = formatCep(v);
    setCep(formatted);
    const digits = formatted.replace(/\D/g, "");
    if (digits.length === 8) {
      const res = await cepHook.lookup(digits);
      if (res) {
        if (res.endereco) setEndereco(res.endereco);
        if (res.bairro) setBairro(res.bairro);
        if (res.cidade) setCidade(res.cidade);
        if (res.uf) setUf(res.uf);
        numeroRef.current?.focus();
      }
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const body = {
      nome: String(fd.get("nome") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      email: String(fd.get("email") ?? ""),
      cep,
      endereco,
      numero: String(fd.get("numero") ?? ""),
      complemento: String(fd.get("complemento") ?? ""),
      referencia: String(fd.get("referencia") ?? ""),
      bairro,
      cidade,
      uf,
      como_conheceu: String(fd.get("como_conheceu") ?? ""),
      quer_voluntariar: fd.get("quer_voluntariar") === "on",
      consentimento_whatsapp: fd.get("consentimento_whatsapp") === "on",
      origem_detalhe: origem ?? "",
      recad_token: t ?? "",
      hp: String(fd.get("hp") ?? ""),
    };
    setSubmitting(true);
    try {
      const r = await fetch("/api/public/forms/recadastro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) throw new Error(json.error ?? "Erro ao enviar");
      navigate({ to: "/obrigado", search: { origem: "recadastro" } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            <span className="font-semibold">Central de Mobilização</span>
          </Link>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Recadastro de Apoiadores</h1>
        <p className="mt-2 text-muted-foreground">
          Atualize seus dados para continuar recebendo notícias e participar das ações da campanha.
          Seus dados são armazenados de forma segura.
        </p>
        {t && (
          <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
            ✓ Identificamos seu cadastro anterior. Confirme seus dados abaixo.
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-8 space-y-5 bg-card border rounded-xl p-6">
          <input type="text" name="hp" tabIndex={-1} autoComplete="off" className="hidden" />
          <Field label="Nome completo *" name="nome" required maxLength={120} />
          <Field label="WhatsApp (com DDD) *" name="phone" required placeholder="(11) 91234-5678" inputMode="tel" maxLength={20} />
          <Field label="E-mail" name="email" type="email" maxLength={255} />

          <div className="grid grid-cols-2 gap-4 items-end">
            <div>
              <label className="text-sm font-medium flex items-center gap-2">
                CEP {cepHook.loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              </label>
              <input
                value={cep}
                onChange={(e) => onCepChange(e.target.value)}
                placeholder="00000-000"
                inputMode="numeric"
                maxLength={9}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              {cepHook.error && <p className="text-xs text-amber-600 mt-1">{cepHook.error} — preencha manualmente</p>}
            </div>
            <Field label="UF" value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())} maxLength={2} placeholder="SP" />
          </div>
          <Field label="Endereço (rua/avenida)" value={endereco} onChange={(e) => setEndereco(e.target.value)} maxLength={240} />
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Número</label>
              <input ref={numeroRef} name="numero" maxLength={20} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <Field label="Complemento" name="complemento" maxLength={120} className="col-span-2" placeholder="Apto, casa, etc." />
          </div>
          <Field label="Bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} maxLength={120} />
          <Field label="Cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={120} />
          <Field label="Ponto de referência" name="referencia" maxLength={240} placeholder="Próximo a..." />
          <Field label="Como conheceu a campanha?" name="como_conheceu" maxLength={240} />

          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="quer_voluntariar" className="mt-1 h-4 w-4" />
            <span>Quero ser voluntário(a) e ajudar nas ações.</span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="consentimento_whatsapp" required className="mt-1 h-4 w-4" />
            <span>Autorizo receber comunicações da campanha por WhatsApp e demais canais. Posso cancelar a qualquer momento respondendo "SAIR".</span>
          </label>

          {error && <p className="text-sm text-destructive border border-destructive/30 bg-destructive/5 rounded-md p-2">{error}</p>}

          <button type="submit" disabled={submitting} className="w-full rounded-md bg-primary text-primary-foreground py-2.5 font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {submitting ? "Enviando…" : "Confirmar recadastro"}
          </button>
        </form>
      </main>
    </div>
  );
}

const Field = function Field({
  label, className, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; className?: string }) {
  return (
    <div className={className}>
      <label className="text-sm font-medium">{label}</label>
      <input {...props} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
    </div>
  );
};
