// Navegação do "app da Agitação": voltar, Início e (quando a pessoa tem acesso
// ao resto do sistema) atalho para o painel geral. Usado no topo das telas de
// Agitação e como barra de abas fixa no celular.
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, BarChart3, CalendarDays, Home, LayoutDashboard, Megaphone } from "lucide-react";
import { useAgitadorMode, isAgitacaoPath } from "@/hooks/use-agitador-mode";

type Props = {
  /** Título da tela atual. */
  title: string;
  /** Some com a seta de voltar (usado na própria tela inicial). */
  hideBack?: boolean;
  className?: string;
};

/** Barra de navegação no topo da tela. */
export function AgitacaoNav({ title, hideBack, className }: Props) {
  const router = useRouter();
  const { hasSystemAccess } = useAgitadorMode();

  function goBack() {
    if (router.history.canGoBack()) router.history.back();
    else void router.navigate({ to: "/agitacao" });
  }

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      {!hideBack && (
        <button
          type="button"
          onClick={goBack}
          aria-label="Voltar"
          title="Voltar"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      )}
      <Link
        to="/agitacao"
        aria-label="Ir para o início da Agitação"
        title="Início da Agitação"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border hover:bg-muted"
      >
        <Home className="h-4 w-4" />
      </Link>
      <h1 className="font-display min-w-0 flex-1 truncate text-xl md:text-2xl">{title}</h1>
      {hasSystemAccess && (
        <Link
          to="/dashboard"
          title="Ir para o painel geral do sistema"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium hover:bg-muted"
        >
          <LayoutDashboard className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Sistema</span>
        </Link>
      )}
    </div>
  );
}

const TABS = [
  { to: "/agitacao", label: "Início", icon: Home },
  { to: "/minhas-missoes", label: "Missões", icon: Megaphone },
  { to: "/meu-impacto", label: "Impacto", icon: BarChart3 },
  { to: "/minha-semana", label: "Semana", icon: CalendarDays },
] as const;

/**
 * Abas fixas no rodapé (celular), visíveis enquanto a pessoa navega nas telas
 * da Agitação. Renderizada uma única vez pelo AppShell.
 */
export function AgitacaoTabBar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (!isAgitacaoPath(path)) return null;

  return (
    <nav
      aria-label="Navegação da Agitação"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-3xl">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = path === tab.to || path.startsWith(tab.to + "/");
          return (
            <li key={tab.to} className="flex-1">
              <Link
                to={tab.to}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Espaço para o conteúdo não ficar embaixo da barra de abas. */
export function AgitacaoTabBarSpacer() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (!isAgitacaoPath(path)) return null;
  return <div className="h-16 md:hidden" aria-hidden />;
}
