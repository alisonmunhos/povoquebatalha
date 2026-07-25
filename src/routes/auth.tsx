import { createFileRoute, useRouter, useSearch, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone, Loader2 } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";

const searchSchema = z.object({
  next: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Campanha do Povo que Batalha" },
      { name: "description", content: "Acesso ao painel administrativo da campanha." },
    ],
  }),
  validateSearch: searchSchema,
  component: AuthPage,
});

const ROLE_HOME: Record<string, string> = {
  admin: "/dashboard",
  operador: "/dashboard",
  vrm: "/relacionamento",
  territorio: "/territorio",
  agitador: "/agitacao",
  leitor: "/dashboard",
};

function pickHome(roles: string[]): string {
  if (roles.includes("territorio") && !roles.some((r) => r === "admin" || r === "operador" || r === "vrm" || r === "agitador"))
    return "/territorio";
  if (roles.includes("agitador") && !roles.some((r) => r === "admin" || r === "operador" || r === "vrm" || r === "territorio" || r === "comunicacao"))
    return "/agitacao";
  for (const r of ["admin", "operador", "vrm", "leitor"]) {
    if (roles.includes(r)) return ROLE_HOME[r];
  }
  return "/dashboard";
}

function safeNext(next: string | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

function AuthPage() {
  const router = useRouter();
  const search = useSearch({ from: "/auth" });
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
        const { data: signIn, error: signErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signErr) throw signErr;
        const uid = signIn.user?.id;
        if (!uid) throw new Error("Sessão inválida.");
        const { data: roleRows } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", uid);
        const roles = (roleRows ?? []).map((r) => r.role as string);
        if (roles.length === 0) {
          await supabase.auth.signOut();
          throw new Error("Acesso não autorizado. Solicite convite ao administrador.");
        }
        const { data: prof } = await supabase
          .from("profiles")
          .select("status")
          .eq("id", uid)
          .maybeSingle();
        if (prof?.status && prof.status !== "ativo") {
          await supabase.auth.signOut();
          throw new Error("Acesso não autorizado. Solicite convite ao administrador.");
        }
        const dest = safeNext(search.next) ?? pickHome(roles);
        router.navigate({ to: dest });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
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
    <div className="min-h-dvh bg-muted/30 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-6">
        <div className="w-full max-w-sm bg-card border rounded-2xl shadow-sm p-5 sm:p-6 space-y-5">
          <div className="flex items-center gap-2 text-foreground">
            <Megaphone className="h-5 w-5 text-primary shrink-0" />
            <span className="font-semibold text-sm sm:text-base">
              Campanha do Povo que Batalha
            </span>
          </div>
          <div>
            <h1 className="text-xl font-semibold">
              {mode === "login" ? "Entrar" : "Recuperar senha"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Acesso restrito. Novos usuários entram apenas por convite do administrador.
            </p>
          </div>
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label htmlFor="email" className="text-sm font-medium">E-mail</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 h-12 text-base"
              />
            </div>
            {mode === "login" && (
              <div>
                <label htmlFor="password" className="text-sm font-medium">Senha</label>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 h-12 text-base"
                />
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {info && <p className="text-sm text-emerald-600">{info}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-primary text-primary-foreground h-12 text-base font-medium hover:bg-primary/90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Aguarde…" : mode === "login" ? "Entrar" : "Enviar link"}
            </button>
          </form>
          <div className="text-sm text-center text-muted-foreground">
            {mode === "login" ? (
              <button
                type="button"
                onClick={() => { setMode("forgot"); setError(null); setInfo(null); }}
                className="text-primary hover:underline"
              >
                Esqueci minha senha
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setMode("login"); setError(null); setInfo(null); }}
                className="text-primary hover:underline"
              >
                Voltar ao login
              </button>
            )}
          </div>
          <div className="text-xs text-center text-muted-foreground border-t pt-3">
            <Link
              to="/f/$slug"
              params={{ slug: "seja-um-apoiador-a-da-campanha-do-povo-que-batalha" }}
              className="hover:underline"
            >
              Ir para a atualização pública de apoiadores
            </Link>
          </div>
        </div>
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </div>
  );
}
