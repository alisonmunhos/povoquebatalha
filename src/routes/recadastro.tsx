import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { Megaphone, CheckCircle2 } from "lucide-react";

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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const body = {
      nome: String(fd.get("nome") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      email: String(fd.get("email") ?? ""),
      cep: String(fd.get("cep") ?? ""),
      endereco: String(fd.get("endereco") ?? ""),
      numero: String(fd.get("numero") ?? ""),
      bairro: String(fd.get("bairro") ?? ""),
      cidade: String(fd.get("cidade") ?? ""),
      uf: String(fd.get("uf") ?? ""),
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
          <Field label="Telefone (com DDD) *" name="phone" required placeholder="(11) 91234-5678" inputMode="tel" maxLength={20} />
          <Field label="E-mail" name="email" type="email" maxLength={255} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="CEP" name="cep" maxLength={10} placeholder="00000-000" />
            <Field label="UF" name="uf" maxLength={2} placeholder="SP" />
          </div>
          <Field label="Endereço" name="endereco" maxLength={240} />
          <div className="grid grid-cols-3 gap-4">
            <Field label="Número" name="numero" maxLength={20} />
            <Field label="Bairro" name="bairro" maxLength={120} className="col-span-2" />
          </div>
          <Field label="Cidade" name="cidade" maxLength={120} />
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

function Field({ label, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; className?: string }) {
  return (
    <div className={className}>
      <label className="text-sm font-medium">{label}</label>
      <input {...props} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
    </div>
  );
}
