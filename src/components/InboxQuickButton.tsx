import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle } from "lucide-react";

import { getMyCommunicationBadge } from "@/lib/communication.functions";
import { useCurrentUserRole } from "@/hooks/use-current-role";

/**
 * Atalho para o Inbox — visível apenas para quem tem o papel "comunicacao".
 * Reaproveita a mesma contagem (query "comm-badge") usada pelo menu lateral.
 */
export function InboxQuickButton() {
  const role = useCurrentUserRole();
  const navigate = useNavigate();
  const badgeFn = useServerFn(getMyCommunicationBadge);

  const isComunicacao = role === "comunicacao";

  const badgeQ = useQuery({
    queryKey: ["comm-badge"],
    queryFn: () => badgeFn(),
    enabled: isComunicacao,
    refetchInterval: 30000,
  });

  if (!isComunicacao) return null;

  const unread = badgeQ.data?.total_unread ?? 0;

  return (
    <button
      type="button"
      onClick={() => navigate({ to: "/comunicacao/inbox" })}
      title="Abrir Inbox de mensagens"
      aria-label={unread > 0 ? `Abrir Inbox (${unread} conversas não lidas)` : "Abrir Inbox de mensagens"}
      className="relative p-2 rounded-md hover:bg-muted transition-colors"
      style={{ color: "#25D366" }}
    >
      <MessageCircle className="h-5 w-5" />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
