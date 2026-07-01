import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Campanha do Povo que Batalha" },
      { name: "description", content: "Acesso ao painel administrativo da campanha." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.navigate({ to: "/dashboard" });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/aceitar-convite`,
        });
        if (error) throw error;
        setInfo("Se este e-mail tiver acesso, você receberá um link para redefinir a senha.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm bg-card border rounded-xl shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-2 text-foreground">
          <Megaphone className="h-5 w-5 text-primary" />
          <span className="font-semibold">Campanha do Povo que Batalha</span>
        </div>
        <div>
          <h1 className="text-xl font-semibold">
            {mode === "login" ? "Entrar" : "Recuperar senha"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Acesso restrito. Novos usuários entram apenas por convite do administrador.
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="text-sm font-medium">E-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          {mode === "login" && (
            <div>
              <label className="text-sm font-medium">Senha</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {info && <p className="text-sm text-emerald-600">{info}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary text-primary-foreground py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Aguarde…" : mode === "login" ? "Entrar" : "Enviar link"}
          </button>
        </form>
        <div className="text-sm text-center text-muted-foreground">
          {mode === "login" ? (
            <button
              onClick={() => {
                setMode("forgot");
                setError(null);
                setInfo(null);
              }}
              className="text-primary hover:underline"
            >
              Esqueci minha senha
            </button>
          ) : (
            <button
              onClick={() => {
                setMode("login");
                setError(null);
                setInfo(null);
              }}
              className="text-primary hover:underline"
            >
              Voltar ao login
            </button>
          )}
        </div>
        <div className="text-xs text-center text-muted-foreground border-t pt-3">
          <Link to="/recadastro" className="hover:underline">
            Ir para o recadastro público
          </Link>
        </div>
      </div>
    </div>
  );
}
