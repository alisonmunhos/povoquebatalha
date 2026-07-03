import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { KeyRound, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/redefinir-senha")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Redefinir senha — Campanha do Povo que Batalha" }],
  }),
  component: RedefinirSenha,
});

type State =
  | { kind: "loading" }
  | { kind: "ready"; email: string }
  | { kind: "expired"; reason: string }
  | { kind: "done" };

function RedefinirSenha() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let done = false;

    supabase.auth.getSession().then(({ data }) => {
      if (done) return;
      if (data.session?.user) {
        done = true;
        setState({ kind: "ready", email: data.session.user.email ?? "sua conta" });
      }
    });

    const sub = supabase.auth.onAuthStateChange((event, session) => {
      if (done) return;
      if ((event === "SIGNED_IN" || event === "PASSWORD_RECOVERY" || event === "INITIAL_SESSION") && session?.user) {
        done = true;
        setState({ kind: "ready", email: session.user.email ?? "sua conta" });
      }
    });

    const t = window.setTimeout(() => {
      if (!done) {
        const hash = window.location.hash ?? "";
        const url = new URL(window.location.href);
        const errParam =
          url.searchParams.get("error_description") ??
          new URLSearchParams(hash.replace(/^#/, "")).get("error_description");
        setState({
          kind: "expired",
          reason:
            errParam ??
            "O link de redefinição não foi reconhecido. Ele pode ter expirado, já ter sido usado, ou ter sido aberto em outro navegador.",
        });
      }
    }, 6000);

    return () => {
      sub.data.subscription.unsubscribe();
      window.clearTimeout(t);
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
    if (!/[a-zA-Z]/.test(password) || !/\d/.test(password))
      return setError("Use pelo menos uma letra e um número.");
    if (password !== confirm) return setError("As senhas não conferem.");
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setState({ kind: "done" });
      window.setTimeout(() => router.navigate({ to: "/dashboard" }), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao redefinir senha.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md bg-card border rounded-xl shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          <span className="font-semibold">Redefinir senha</span>
        </div>

        {state.kind === "loading" && (
          <div className="py-8 flex flex-col items-center gap-2 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <div className="font-medium">Validando o link…</div>
            <p className="text-sm text-muted-foreground">Isso leva só alguns segundos.</p>
          </div>
        )}

        {state.kind === "ready" && (
          <>
            <div>
              <h1 className="text-xl font-semibold">Defina uma nova senha</h1>
              <p className="text-sm text-muted-foreground">
                Para <strong className="text-foreground">{state.email}</strong>.
              </p>
            </div>
            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <label className="text-sm font-medium">Nova senha</label>
                <input
                  type="password" required minLength={8}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground mt-1">Mínimo 8 caracteres, com pelo menos uma letra e um número.</p>
              </div>
              <div>
                <label className="text-sm font-medium">Confirmar senha</label>
                <input
                  type="password" required minLength={8}
                  value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <button
                type="submit" disabled={saving}
                className="w-full rounded-md bg-primary text-primary-foreground py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? "Salvando…" : "Salvar nova senha"}
              </button>
            </form>
          </>
        )}

        {state.kind === "expired" && (
          <>
            <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div className="text-sm">
                <div className="font-medium text-amber-900">Link inválido ou expirado</div>
                <p className="text-amber-800 mt-1">{state.reason}</p>
              </div>
            </div>
            <div className="text-sm">
              <p className="text-muted-foreground">Peça ao administrador para gerar um novo link de redefinição.</p>
              <Link
                to="/auth"
                className="inline-flex mt-3 items-center justify-center w-full rounded-md border py-2 text-sm font-medium hover:bg-muted"
              >
                Ir para a página de login
              </Link>
            </div>
          </>
        )}

        {state.kind === "done" && (
          <div className="py-8 flex flex-col items-center gap-2 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            <div className="font-medium">Senha redefinida com sucesso</div>
            <p className="text-sm text-muted-foreground">Redirecionando para o painel…</p>
          </div>
        )}
      </div>
    </div>
  );
}
