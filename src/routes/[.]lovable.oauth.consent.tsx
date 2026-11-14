// Tela de consentimento do OAuth: é aqui que a pessoa autoriza um assistente
// externo (Claude, etc.) a usar o app como ela mesma.
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Megaphone, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { oauthReturnPath } from "@/lib/oauth-return-path";

type AuthorizationDetails = {
  authorization_id: string;
  redirect_uri: string;
  client: { id: string; name: string; uri: string; logo_uri: string };
  user: { id: string; email: string };
  scope: string;
};

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // O SSR não tem sessão no localStorage e redirecionaria quem já está logado.
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    authorization_id:
      typeof search["authorization_id"] === "string" ? search["authorization_id"] : "",
  }),
  beforeLoad: async ({ location }) => {
    if (!new URLSearchParams(location.search).get("authorization_id")) {
      throw new Error("Pedido de conexão inválido: falta o identificador da autorização.");
    }
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = oauthReturnPath(location.pathname + (location.search ?? ""));
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id") ?? "";
    const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
    if (error) throw error;
    if (data && !("authorization_id" in data)) {
      // Já autorizado antes: o provedor devolve direto o retorno ao cliente.
      throw redirect({ href: data.redirect_url });
    }
    return (data ?? null) as AuthorizationDetails | null;
  },
  component: ConsentPage,
  errorComponent: ({ error }) => (
    <main className="min-h-dvh bg-muted/30 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-card border rounded-2xl shadow-sm p-6 space-y-3">
        <h1 className="text-lg font-semibold">Não foi possível mostrar esta autorização</h1>
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : String(error)}
        </p>
        <Link to="/" className="text-sm text-primary hover:underline">
          Voltar ao início
        </Link>
      </div>
    </main>
  ),
});

const ROTULO_ESCOPE: Record<string, string> = {
  openid: "Entrar com a sua conta",
  email: "Ver o seu endereço de e-mail",
  profile: "Ver o seu nome básico",
};

const CAPACOES = [
  "Ver o resumo geral da campanha",
  "Consultar contatos e a base de apoiadores",
  "Consultar campanhas de mensagem e seus resultados",
  "Ver as mensagens recebidas no inbox",
  "Ver os modelos de texto das mensagens",
  "Ver o uso anônimo da página /story",
];

function ConsentPage() {
  const details = Route.useLoaderData();
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function decidir(aprovar: boolean) {
    if (!details) return;
    setBusy(true);
    setErro(null);
    const chamada = aprovar
      ? supabase.auth.oauth.approveAuthorization(details.authorization_id, { skipBrowserRedirect: true })
      : supabase.auth.oauth.denyAuthorization(details.authorization_id, { skipBrowserRedirect: true });
    const { data, error } = await chamada;
    if (error) {
      setBusy(false);
      setErro(error.message);
      return;
    }
    const destino = data?.redirect_url;
    if (!destino) {
      setBusy(false);
      setErro("O servidor de autorização não devolveu o endereço de retorno.");
      return;
    }
    window.location.href = destino;
  }

  if (!details) {
    return (
      <main className="min-h-dvh bg-muted/30 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-card border rounded-2xl shadow-sm p-6 space-y-3">
          <h1 className="text-lg font-semibold">Pedido de conexão não encontrado</h1>
          <p className="text-sm text-muted-foreground">
            Este pedido pode ter expirado. Abra a conexão de novo no assistente.
          </p>
        </div>
      </main>
    );
  }

  const cliente = details.client?.name ?? "este app";
  const escopos = (details.scope ?? "").split(/\s+/).filter(Boolean);

  return (
    <div className="min-h-dvh bg-muted/30 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-6">
        <div className="w-full max-w-md bg-card border rounded-2xl shadow-sm p-5 sm:p-6 space-y-5">
          <div className="flex items-center gap-2 text-foreground">
            <Megaphone className="h-5 w-5 text-primary shrink-0" />
            <span className="font-semibold text-sm sm:text-base">
              Campanha do Povo que Batalha
            </span>
          </div>

          <div>
            <h1 className="text-xl font-semibold">Conectar {cliente} à sua conta</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Isso permite que {cliente} use este app como você.
            </p>
          </div>

          <dl className="text-sm space-y-2 border rounded-xl p-4">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Sua conta</dt>
              <dd className="font-medium text-right break-all">{details.user?.email ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Aplicativo</dt>
              <dd className="font-medium text-right break-all">{cliente}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Endereço de retorno</dt>
              <dd className="font-medium text-right break-all">{details.redirect_uri}</dd>
            </div>
          </dl>

          <div>
            <h2 className="text-sm font-medium">O que {cliente} poderá fazer</h2>
            <ul className="mt-2 text-sm text-muted-foreground space-y-1 list-disc pl-5">
              {CAPACOES.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>

          {escopos.length > 0 && (
            <div>
              <h2 className="text-sm font-medium">Dados de identidade</h2>
              <ul className="mt-2 text-sm text-muted-foreground space-y-1 list-disc pl-5">
                {escopos.map((s) => (
                  <li key={s}>{ROTULO_ESCOPE[s] ?? `Permissão adicional solicitada: ${s}`}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Isso não tira as permissões nem as regras de acesso do app: cada pessoa só vê o que
            já pode ver aqui dentro.
          </p>

          {erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}

          <div className="space-y-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => decidir(true)}
              className="w-full rounded-md bg-primary text-primary-foreground h-12 text-base font-medium hover:bg-primary/90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? "Aguarde…" : "Conectar"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => decidir(false)}
              className="w-full rounded-md border border-input bg-background h-12 text-base font-medium hover:bg-muted disabled:opacity-50"
            >
              Cancelar conexão
            </button>
          </div>

          <div className="text-xs text-center text-muted-foreground border-t pt-3">
            Não é esta a sua conta?{" "}
            <Link
              to="/auth"
              search={{
                next: oauthReturnPath(
                  `/.lovable/oauth/consent?authorization_id=${encodeURIComponent(details.authorization_id)}`,
                ),
              }}
              className="text-primary hover:underline"
            >
              Entrar com outra conta
            </Link>
          </div>
        </div>
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </div>
  );
}
