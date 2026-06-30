import { Link, Outlet, useRouter } from "@tanstack/react-router";
import { LayoutDashboard, Users, MessageCircle, Upload, Tags, Filter, Send, Calendar, LogOut, Megaphone, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/contatos", label: "Contatos", icon: Users },
  { to: "/importar", label: "Importar", icon: Upload },
  { to: "/tags", label: "Tags", icon: Tags },
  { to: "/segmentos", label: "Segmentos", icon: Filter },
  { to: "/campanhas", label: "Campanhas", icon: Send },
  { to: "/calendario", label: "Calendário", icon: Calendar },
  { to: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { to: "/usuarios", label: "Usuários", icon: ShieldCheck },
] as const;

export function AppShell() {
  const router = useRouter();
  const { user } = useAuth();
  const currentPath = router.state.location.pathname;

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
            Central de
            <br />
            Mobilização
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = currentPath.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
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
