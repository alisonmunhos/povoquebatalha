import { Link, Outlet, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Users, Upload, Copy, Tags, Filter,
  LogOut, Megaphone, Compass, ShieldCheck, Link as LinkIcon,
  MessageCircle, Menu, X, Zap, ClipboardList,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth, useRoles, type AppRole } from "@/hooks/use-auth";
import { getMyCommunicationBadge } from "@/lib/communication.functions";
import { AddContactButton } from "@/components/AddContactButton";
import { BrandMark } from "@/components/BrandMark";
import { NotificationBell } from "@/components/NotificationBell";


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
      { to: "/contatos", label: "Gestão da Base", icon: Users, hint: "Organize, corrija, filtre e segmente os contatos.", roles: ["admin"] },
      { to: "/contatos-bi", label: "Contatos (BI)", icon: Users, hint: "Planilha interativa (beta).", roles: ["admin", "operador", "vrm"] },
      { to: "/importar", label: "Importar", icon: Upload, roles: ["admin"] },
      { to: "/duplicidades", label: "Duplicidades", icon: Copy, roles: ["admin"] },
      { to: "/tags", label: "Tags", icon: Tags, roles: ["admin"] },
      { to: "/segmentos", label: "Segmentos", icon: Filter, roles: ["admin", "vrm"] },
      { to: "/entrada-dados", label: "Entrada de Dados", icon: ClipboardList, hint: "Monte formulários públicos personalizados.", roles: ["admin"] },
    ],
  },
  {
    label: "Território",
    items: [
      { to: "/territorio", label: "Território", icon: Compass, hint: "Ação de campo + mapa geral da base.", roles: ["admin", "operador", "vrm"] },
      { to: "/agitacao", label: "Agitação", icon: Zap, hint: "Captação rápida por WhatsApp.", roles: ["admin", "operador", "vrm", "comunicacao", "leitor", "agitador"] },
      { to: "/missoes-agitacao", label: "Missões de Agitação", icon: Megaphone, hint: "Atribua pacotes de contatos a um responsável, com link exclusivo de envio.", roles: ["admin"] },
    ],
  },


  {
    label: "Comunicação",
    items: [
      { to: "/comunicacao/inbox", label: "Módulo Comunicação", icon: MessageCircle, hint: "Inbox, campanhas, mensagens, contatos.", roles: ["admin", "vrm", "comunicacao"] },
    ],
  },
  {
    label: "Sistema",
    items: [
      { to: "/links", label: "Links públicos", icon: LinkIcon, roles: ["admin"] },
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

  // Hooks — mantém a ordem estável entre renders (regras dos hooks).
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { setMobileOpen(false); }, [currentPath]);

  const isAgitadorOnly =
    !!rolesRaw &&
    roles.includes("agitador") &&
    !roles.some((r) => r === "admin" || r === "operador" || r === "vrm" || r === "comunicacao");

  const canAddContact = roles.length > 0;

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

  // Agitador-only: mini-app shell (só Agitação)
  if (isAgitadorOnly) {
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <header className="border-b bg-card sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Zap className="h-5 w-5 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wide text-muted-foreground leading-tight">Modo Agitação</div>
                <div className="text-sm font-semibold truncate">Povo que Batalha</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <AddContactButton compact userName={user?.email ?? null} />
              <button
                onClick={handleLogout}
                className="text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                aria-label="Sair"
              >
                <LogOut className="h-4 w-4" /> Sair
              </button>
            </div>

          </div>
        </header>
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    );
  }

  const SidebarInner = (
    <>
      <div className="flex items-center gap-2 px-4 h-16 border-b border-sidebar-border">
        <BrandMark className="h-7 w-7" />
        <div className="font-display text-base leading-tight tracking-wide">
          Povo que
          <br />
          Batalha
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
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
        {SidebarInner}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="relative z-10 w-72 max-w-[85vw] flex flex-col bg-sidebar text-sidebar-foreground border-r shadow-xl animate-in slide-in-from-left">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-sidebar-accent"
              aria-label="Fechar menu"
            >
              <X className="h-4 w-4" />
            </button>
            {SidebarInner}
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar with hamburger */}
        <header className="md:hidden sticky top-0 z-30 h-12 border-b bg-card flex items-center gap-2 px-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 -ml-2 rounded-md hover:bg-muted"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <Megaphone className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm font-semibold truncate">Povo que Batalha</span>
          </div>
          <NotificationBell />
          {canAddContact && <AddContactButton compact userName={user?.email ?? null} />}
        </header>
        {/* Desktop top bar */}
        <div className="hidden md:flex sticky top-0 z-30 h-12 border-b bg-card items-center justify-end gap-2 px-4">
          <NotificationBell />
          {canAddContact && <AddContactButton compact userName={user?.email ?? null} />}
        </div>

        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
