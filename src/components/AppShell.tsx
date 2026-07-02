import { Link, Outlet, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  LayoutDashboard, Users, Upload, Copy, Tags, Filter,
  MapPin, LogOut, Megaphone, Compass, ShieldCheck, Link as LinkIcon,
  MessageCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useRoles, type AppRole } from "@/hooks/use-auth";
import { getMyCommunicationBadge } from "@/lib/communication.functions";

type NavItem = { to: string; label: string; icon: typeof Users; hint?: string; roles?: AppRole[] };
type NavGroup = { label: string; items: NavItem[] };

const groups: NavGroup[] = [
  {
    label: "",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "operador", "vrm", "leitor"] },
    ],
  },
  {
    label: "Base",
    items: [
      { to: "/contatos", label: "Gestão da Base", icon: Users, hint: "Organize, corrija, filtre e segmente os contatos.", roles: ["admin", "operador", "vrm"] },
      { to: "/importar", label: "Importar", icon: Upload, roles: ["admin", "operador"] },
      { to: "/duplicidades", label: "Duplicidades", icon: Copy, roles: ["admin", "operador"] },
      { to: "/tags", label: "Tags", icon: Tags, roles: ["admin", "operador"] },
      { to: "/segmentos", label: "Segmentos", icon: Filter, roles: ["admin", "operador", "vrm"] },
    ],
  },
  {
    label: "Território",
    items: [
      { to: "/territorio", label: "Território", icon: Compass, hint: "Mini-app mobile-first.", roles: ["admin", "operador", "vrm", "territorio"] },
      { to: "/mapa", label: "Mapa", icon: MapPin, hint: "Visualize contatos geolocalizados.", roles: ["admin", "operador", "vrm"] },
    ],
  },
  {
    label: "Comunicação",
    items: [
      { to: "/comunicacao/inbox", label: "Módulo Comunicação", icon: MessageCircle, hint: "Inbox, campanhas, mensagens, contatos.", roles: ["admin", "operador", "vrm", "comunicacao"] },
    ],
  },
  {
    label: "Sistema",
    items: [
      { to: "/links", label: "Links públicos", icon: LinkIcon, roles: ["admin", "operador"] },
      { to: "/usuarios", label: "Usuários", icon: ShieldCheck, roles: ["admin"] },
    ],
  },
];

export function AppShell() {
  const router = useRouter();
  const { user } = useAuth();
  const rolesRaw = useRoles(user?.id);
  const roles = rolesRaw ?? [];
  const currentPath = router.state.location.pathname;

  const isTerritorioOnly =
    !!rolesRaw &&
    roles.includes("territorio") &&
    !roles.some((r) => r === "admin" || r === "operador" || r === "vrm");

  const hasRoles = roles.length > 0;
  function canSee(item: NavItem) {
    if (!item.roles) return true;
    if (!hasRoles) return roles.includes("admin");
    return item.roles.some((r) => roles.includes(r));
  }

  const badgeFn = useServerFn(getMyCommunicationBadge);
  const badgeQ = useQuery({
    queryKey: ["comm-badge"],
    queryFn: () => badgeFn(),
    enabled: Boolean(user),
    refetchInterval: 30000,
  });

  // Comunicação abrange várias rotas (o app dedicado): destaca no menu quando estiver em qualquer uma delas.
  const COMM_PATHS = ["/comunicacao", "/campanhas", "/mensagens", "/calendario", "/relacionamento", "/whatsapp", "/inbox"];
  function isActive(to: string) {
    if (to === "/dashboard") return currentPath === "/dashboard" || currentPath === "/";
    if (to === "/comunicacao/inbox") {
      return COMM_PATHS.some((p) => currentPath === p || currentPath.startsWith(p + "/"));
    }
    return currentPath === to || currentPath.startsWith(to + "/");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  }

  // Territorio-only: mini-app shell (no sidebar, no top nav)
  if (isTerritorioOnly) {
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <header className="border-b bg-card sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Compass className="h-5 w-5 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wide text-muted-foreground leading-tight">Modo Território</div>
                <div className="text-sm font-semibold truncate">Povo que Batalha</div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              aria-label="Sair"
            >
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </div>
        </header>
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden md:flex w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2 px-4 h-16 border-b border-sidebar-border">
          <Megaphone className="h-5 w-5 text-sidebar-primary" />
          <div className="font-semibold text-sm leading-tight">
            Campanha do Povo
            <br />
            que Batalha
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-4 overflow-y-auto">
          {groups.map((group, gi) => {
            const visibleItems = group.items.filter(canSee);
            if (visibleItems.length === 0) return null;
            return (
              <div key={gi} className="space-y-1">
                {group.label && (
                  <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                    {group.label}
                  </div>
                )}
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.to);
                  const badge = item.to === "/comunicacao/inbox" ? (badgeQ.data?.mine_unread ?? 0) : 0;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      title={item.hint}
                      className={`flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${
                        active
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate flex-1">{item.label}</span>
                      {badge > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[1.25rem] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
                          {badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3 space-y-2">
          <div className="text-xs text-sidebar-foreground/70 truncate">{user?.email}</div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-xs text-sidebar-foreground/80 hover:text-sidebar-foreground"
          >
            <LogOut className="h-3.5 w-3.5" /> Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
