import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { ShieldCheck, Mail, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/primeiro-acesso")({
  head: () => ({
    meta: [
      { title: "Primeiro acesso — Campanha do Povo que Batalha" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: PrimeiroAcessoPage,
});

const emailSchema = z.string().trim().toLowerCase().email().max(255);

type State =
  | { status: "checking" }
  | { status: "ready" }
  | { status: "submitting" }
  | { status: "sent"; email: string }
  | { status: "locked" }
  | { status: "error"; message: string };

function PrimeiroAcessoPage() {
  const [state, setState] = useState<State>({ status: "checking" });
  const [email, setEmail] = useState("");
  const [setupSecret, setSetupSecret] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/bootstrap-admin")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setState(j?.exists ? { status: "locked" } : { status: "ready" });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", message: "Não foi possível verificar o status. Tente novamente." });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setState({ status: "error", message: "Digite um e-mail válido." });
      return;
    }
    setState({ status: "submitting" });
    try {
      const res = await fetch("/api/public/bootstrap-admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: parsed.data,
          redirectOrigin: window.location.origin,
        }),
      });
      if (res.status === 403) {
        setState({ status: "locked" });
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({
          status: "error",
          message: typeof json?.error === "string" ? json.error : "Erro ao enviar convite.",
        });
        return;
      }
      setState({ status: "sent", email: parsed.data });
    } catch {
      setState({ status: "error", message: "Erro de rede. Tente novamente." });
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md bg-card border rounded-xl shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="font-semibold">Campanha do Povo que Batalha</span>
        </div>

        {state.status === "checking" && (
          <p className="text-sm text-muted-foreground">Verificando…</p>
        )}

        {state.status === "locked" && (
          <div className="space-y-4">
            <h1 className="text-xl font-semibold">Cadastro encerrado</h1>
            <p className="text-sm text-muted-foreground">
              O primeiro administrador já foi criado. Faça login normalmente.
            </p>
            <Link
              to="/auth"
              className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
            >
              Ir para o login
            </Link>
          </div>
        )}

        {(state.status === "ready" ||
          state.status === "submitting" ||
          state.status === "error") && (
            <>

              <div>
                <h1 className="text-xl font-semibold">Criar primeiro administrador</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Esta página só funciona uma vez. Depois que o primeiro admin for criado,
                  ela é bloqueada automaticamente e novos acessos passam a ser apenas por
                  convite.
                </p>
              </div>
              <form onSubmit={onSubmit} className="space-y-3">
                <label className="block">
                  <span className="text-sm font-medium">E-mail do administrador</span>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    maxLength={255}
                    value={email}
                    onChange={(ev) => setEmail(ev.target.value)}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="voce@exemplo.com"
                  />
                </label>
                {state.status === "error" && (
                  <p className="text-sm text-destructive">{state.message}</p>
                )}
                <button
                  type="submit"
                  disabled={state.status === "submitting"}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  <Mail className="h-4 w-4" />
                  {state.status === "submitting" ? "Enviando…" : "Criar primeiro administrador"}
                </button>
              </form>
            </>
          )}

        {state.status === "sent" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
              <h1 className="text-xl font-semibold">Convite enviado</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Enviamos um convite para <strong className="text-foreground">{state.email}</strong>.
              Verifique sua caixa de entrada (e a pasta de spam) e clique no link para definir
              sua senha.
            </p>
            <Link
              to="/auth"
              className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Ir para o login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
