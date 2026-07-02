import { Link, Outlet, useRouter } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Upload, Copy, Tags, Filter,
  MapPin, MessageSquareText, Send, Calendar, Inbox as InboxIcon, Heart,
  Link as LinkIcon, MessageCircle, ShieldCheck, LogOut, Megaphone,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

type NavItem = { to: string; label: string; icon: typeof Users; hint?: string };
type NavGroup = { label: string; items: NavItem[] };

const groups: NavGroup[] = [
  {
    label: "",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Base",
    items: [
      { to: "/contatos", label: "Gestão da Base", icon: Users, hint: "Organize, corrija, filtre e segmente os contatos." },
      { to: "/importar", label: "Importar", icon: Upload },
      { to: "/duplicidades", label: "Duplicidades", icon: Copy },
      { to: "/tags", label: "Tags", icon: Tags },
      { to: "/segmentos", label: "Segmentos", icon: Filter },
    ],
  },
  {
    label: "Território",
    items: [
      { to: "/mapa", label: "Mapa", icon: MapPin, hint: "Visualize contatos e públicos filtrados por território." },
    ],
  },
  {
    label: "Comunicação",
    items: [
      { to: "/mensagens", label: "Mensagens", icon: MessageSquareText },
      { to: "/campanhas", label: "Campanhas", icon: Send },
      { to: "/calendario", label: "Calendário", icon: Calendar },
      { to: "/relacionamento", label: "Relacionamento", icon: Heart, hint: "Acompanhe comportamento, mensagens, respostas, erros e reenvios." },
      { to: "/inbox", label: "Inbox", icon: InboxIcon },
    ],
  },
  {
    label: "Sistema",
    items: [
      { to: "/links", label: "Links públicos", icon: LinkIcon },
      { to: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
      { to: "/usuarios", label: "Usuários", icon: ShieldCheck },
    ],
  },
];

export function AppShell() {
  const router = useRouter();
  const { user } = useAuth();
  const currentPath = router.state.location.pathname;

  function isActive(to: string) {
    if (to === "/dashboard") return currentPath === "/dashboard" || currentPath === "/";
    return currentPath === to || currentPath.startsWith(to + "/");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
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
          {groups.map((group, gi) => (
            <div key={gi} className="space-y-1">
              {group.label && (
                <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                  {group.label}
                </div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.to);
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
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
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
