import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Megaphone, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/inscrever")({
  head: () => ({
    meta: [
      { title: "Quero receber informações da campanha" },
      {
        name: "description",
        content: "Inscreva-se para receber notícias da campanha pelo WhatsApp.",
      },
    ],
  }),
  ssr: false,
  component: Inscrever,
});

function Inscrever() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const body = {
      nome: String(fd.get("nome") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      cidade: String(fd.get("cidade") ?? ""),
      uf: String(fd.get("uf") ?? ""),
      consentimento_whatsapp: fd.get("consentimento_whatsapp") === "on",
      hp: String(fd.get("hp") ?? ""),
    };
    setSubmitting(true);
    try {
      const r = await fetch("/api/public/forms/inscrever", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) throw new Error(json.error ?? "Erro ao enviar");
      navigate({ to: "/obrigado", search: { origem: "inscricao" } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            <span className="font-semibold">Central de Mobilização</span>
          </Link>
        </div>
      </header>
      <main className="max-w-md mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Quero receber informações</h1>
        <p className="mt-2 text-muted-foreground">
          Cadastre-se para receber novidades da campanha pelo WhatsApp.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-5 bg-card border rounded-xl p-6">
          <input type="text" name="hp" tabIndex={-1} autoComplete="off" className="hidden" />
          <div>
            <label className="text-sm font-medium">Nome *</label>
            <input
              name="nome"
              required
              maxLength={120}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium">WhatsApp (com DDD) *</label>
            <input
              name="phone"
              required
              placeholder="(11) 91234-5678"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-sm font-medium">Cidade</label>
              <input
                name="cidade"
                maxLength={120}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">UF</label>
              <input
                name="uf"
                maxLength={2}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="consentimento_whatsapp" required className="mt-1 h-4 w-4" />
            <span>
              Autorizo receber comunicações da campanha por WhatsApp. Posso cancelar a qualquer
              momento respondendo "SAIR".
            </span>
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-primary text-primary-foreground py-2.5 font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="h-4 w-4" />
            {submitting ? "Enviando…" : "Quero receber"}
          </button>
        </form>
      </main>
    </div>
  );
}
