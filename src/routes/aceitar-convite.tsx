import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { linkCurrentUserContact } from "@/lib/users.functions";
import { Megaphone, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/aceitar-convite")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Criar sua conta — Campanha do Povo que Batalha" }],
  }),
  component: AceitarConvite,
});

type State =
  | { kind: "loading" }
  | { kind: "ready"; email: string }
  | { kind: "expired"; reason: string }
  | { kind: "done" };

function AceitarConvite() {
  const router = useRouter();
  const linkContact = useServerFn(linkCurrentUserContact);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let done = false;

    // 1) Sessão já pronta?
    supabase.auth.getSession().then(({ data }) => {
      if (done) return;
      if (data.session?.user) {
        done = true;
        setState({ kind: "ready", email: data.session.user.email ?? "sua conta" });
      }
    });

    // 2) Escutar processamento do hash / recovery
    const sub = supabase.auth.onAuthStateChange((event, session) => {
      if (done) return;
      if ((event === "SIGNED_IN" || event === "PASSWORD_RECOVERY" || event === "INITIAL_SESSION") && session?.user) {
        done = true;
        setState({ kind: "ready", email: session.user.email ?? "sua conta" });
      }
    });

    // 3) Timeout: se nada acontecer, avisar que o link expirou.
    const t = window.setTimeout(() => {
      if (!done) {
        // Erro específico se veio na URL
        const hash = window.location.hash ?? "";
        const url = new URL(window.location.href);
        const errParam = url.searchParams.get("error_description") ?? new URLSearchParams(hash.replace(/^#/, "")).get("error_description");
        setState({
          kind: "expired",
          reason: errParam ?? "O link do convite não foi reconhecido. Ele pode ter expirado, já ter sido usado, ou ter sido aberto em outro navegador.",
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
      // Bloco D — vincular/criar contato do usuário do sistema
      try { await linkContact({ data: {} }); } catch { /* non-blocking */ }
      setState({ kind: "done" });
      // Redireciona por papel: /auth já cuida disso, mas como estamos logados,
      // o gate irá redirecionar para /dashboard automaticamente. Damos um respiro.
      window.setTimeout(() => router.navigate({ to: "/dashboard" }), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao definir senha.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md bg-card border rounded-xl shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" />
          <span className="font-semibold">Campanha do Povo que Batalha</span>
        </div>

        {state.kind === "loading" && (
          <div className="py-8 flex flex-col items-center gap-2 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <div className="font-medium">Confirmando seu convite…</div>
            <p className="text-sm text-muted-foreground">Isso leva só alguns segundos.</p>
          </div>
        )}

        {state.kind === "ready" && (
          <>
            <div>
              <h1 className="text-xl font-semibold">Criar sua conta</h1>
              <p className="text-sm text-muted-foreground">
                Defina uma senha para <strong className="text-foreground">{state.email}</strong>.
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
                {saving ? "Salvando…" : "Criar conta e entrar"}
              </button>
            </form>
          </>
        )}

        {state.kind === "expired" && (
          <>
            <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div className="text-sm">
                <div className="font-medium text-amber-900">Convite não pôde ser confirmado</div>
                <p className="text-amber-800 mt-1">{state.reason}</p>
              </div>
            </div>
            <div className="text-sm space-y-2">
              <p className="font-medium">O que fazer:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Verifique se você abriu o link mais recente que recebeu por e-mail.</li>
                <li>Tente abrir num navegador anônimo/privado, sem outra conta logada.</li>
                <li>Se não funcionar, peça ao administrador da campanha para reenviar o convite.</li>
              </ol>
              <Link
                to="/auth"
                className="inline-flex mt-2 items-center justify-center w-full rounded-md border py-2 text-sm font-medium hover:bg-muted"
              >
                Ir para a página de login
              </Link>
            </div>
          </>
        )}

        {state.kind === "done" && (
          <div className="py-8 flex flex-col items-center gap-2 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            <div className="font-medium">Conta criada com sucesso</div>
            <p className="text-sm text-muted-foreground">Redirecionando para o painel…</p>
          </div>
        )}
      </div>
    </div>
  );
}
