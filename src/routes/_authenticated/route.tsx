import { createFileRoute, redirect, useRouter, useRouterState, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useAuth, useRoles } from "@/hooks/use-auth";
import { Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/auth",
        search: { next: location.pathname + (location.searchStr ?? "") },
      });
    }
    return { user: data.user };
  },
  component: AuthenticatedShell,
});

// Agitador-only users must stay under /agitacao — exceção: a ficha de um
// contato específico (/contatos/$id), pra abrir "Ficha completa" a partir da
// própria lista de captados. A lista inteira (/contatos) continua bloqueada.
const CONTACT_DETAIL_RE = /^\/contatos\/[0-9a-f-]{36}$/i;

function AuthenticatedShell() {
  const router = useRouter();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const roles = useRoles(user?.id);

  useEffect(() => {
    if (!roles || roles.length === 0) return;
    if (isAgitadorOnlyRoles(roles)) {
      const allowed = isAgitacaoPath(path) || CONTACT_DETAIL_RE.test(path);
      if (!allowed) router.navigate({ to: "/agitacao", replace: true });
      return;
    }
  }, [roles, path, router]);

  // Usuário autenticado mas sem nenhum papel — cadastro em análise ou acesso revogado.
  if (roles !== null && roles.length === 0) {
    return <PendingApprovalScreen email={user?.email ?? null} />;
  }

  return <AppShell />;
}

function PendingApprovalScreen({ email }: { email: string | null }) {
  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md bg-card border rounded-xl shadow-sm p-6 space-y-4 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
          <Clock className="h-6 w-6 text-amber-700" />
        </div>
        <h1 className="text-xl font-semibold">Seu cadastro está em análise</h1>
        <p className="text-sm text-muted-foreground">
          {email ? <>Conta: <strong className="text-foreground">{email}</strong>. </> : null}
          Você receberá acesso ao painel assim que um administrador aprovar seu cadastro.
        </p>
        <p className="text-xs text-muted-foreground">
          Se você acha que isso é um erro ou já deveria ter acesso, entre em contato com um administrador da campanha.
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={signOut}
            className="w-full rounded-md border py-2 text-sm font-medium hover:bg-muted"
          >
            Sair
          </button>
          <Link to="/" className="text-xs text-muted-foreground hover:underline">Voltar para o início</Link>
        </div>
      </div>
    </div>
  );
}

