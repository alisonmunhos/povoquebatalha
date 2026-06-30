import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone } from "lucide-react";

export const Route = createFileRoute("/aceitar-convite")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Aceitar convite — Central de Mobilização" }],
  }),
  component: AceitarConvite,
});

function AceitarConvite() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // O link de convite cai aqui com tokens no hash; o cliente Supabase processa
    // automaticamente e cria a sessão. Conferimos abaixo.
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setEmail(data.session.user.email ?? null);
        setReady(true);
      } else {
        // aguarda o processamento do hash
        const sub = supabase.auth.onAuthStateChange((_e, s) => {
          if (s) {
            setEmail(s.user.email ?? null);
            setReady(true);
          }
        });
        setTimeout(() => sub.data.subscription.unsubscribe(), 5000);
      }
    };
    check();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não conferem.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      router.navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao definir senha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm bg-card border rounded-xl shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" />
          <span className="font-semibold">Central de Mobilização</span>
        </div>
        <div>
          <h1 className="text-xl font-semibold">Aceitar convite</h1>
          <p className="text-sm text-muted-foreground">
            {ready && email
              ? `Defina uma senha para ${email}.`
              : "Validando seu convite…"}
          </p>
        </div>
        {ready ? (
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label className="text-sm font-medium">Nova senha</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Confirmar senha</label>
              <input
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-primary text-primary-foreground py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Salvando…" : "Entrar no painel"}
            </button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Se a página não avançar em alguns segundos, o link pode ter expirado.
            Peça um novo convite ao administrador.
          </p>
        )}
      </div>
    </div>
  );
}
