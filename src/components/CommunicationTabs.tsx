import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth, useRoles } from "@/hooks/use-auth";
import { getMyCommunicationBadge } from "@/lib/communication.functions";
import {
  Inbox, Users, Send, MessageSquareText, Calendar, Heart, MessageCircle, FileCheck2,
} from "lucide-react";

type Tab = { to: string; label: string; icon: typeof Inbox; adminOnly?: boolean };

const TABS: Tab[] = [
  { to: "/comunicacao/inbox", label: "Inbox", icon: Inbox },
  { to: "/comunicacao/contatos", label: "Contatos", icon: Users },
  { to: "/campanhas", label: "Campanhas", icon: Send },
  { to: "/mensagens", label: "Mensagens", icon: MessageSquareText },
  { to: "/calendario", label: "Calendário", icon: Calendar },
  { to: "/relacionamento", label: "Relacionamento", icon: Heart },
  { to: "/comunicacao/templates", label: "Templates", icon: FileCheck2, adminOnly: true },
  { to: "/whatsapp", label: "WhatsApp", icon: MessageCircle, adminOnly: true },
];


/**
 * Barra de navegação do "app" Comunicação.
 * Aparece no topo do módulo /comunicacao/* e nas telas relacionadas (campanhas, mensagens, etc.)
 * para dar sensação de aplicativo dedicado, sem sair da mesma base logada.
 */
export function CommunicationTabs() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const roles = useRoles(user?.id) ?? [];
  const isAdmin = roles.includes("admin");
  const badgeFn = useServerFn(getMyCommunicationBadge);
  const badgeQ = useQuery({
    queryKey: ["comm-badge"],
    queryFn: () => badgeFn(),
    refetchInterval: 20000,
  });

  const visible = TABS.filter((t) => !t.adminOnly || isAdmin);

  function isActive(to: string) {
    if (to === "/comunicacao/inbox") {
      return path === "/" || path.startsWith("/comunicacao/inbox") || path === "/comunicacao";
    }
    return path === to || path.startsWith(to + "/");
  }

  return (
    <div className="border-b bg-card sticky top-0 z-30 backdrop-blur">
      <div className="flex items-center gap-1 px-3 overflow-x-auto scrollbar-thin">
        {visible.map((t) => {
          const active = isActive(t.to);
          const Icon = t.icon;
          const showBadge = t.to === "/comunicacao/inbox" && (badgeQ.data?.mine_unread ?? 0) > 0;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-sm border-b-2 -mb-px whitespace-nowrap transition-colors ${
                active
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{t.label}</span>
              {showBadge && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[1.1rem] px-1 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
                  {badgeQ.data?.mine_unread}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
