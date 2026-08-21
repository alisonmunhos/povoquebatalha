import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle } from "lucide-react";

import { getMyCommunicationBadge } from "@/lib/communication.functions";
import { useCurrentUserRole } from "@/hooks/use-current-role";
import { useInboxAccessFlag } from "@/hooks/use-inbox-access";
import { playPqbNotificationSound } from "@/lib/notification-sound";

/**
 * Atalho para o Inbox — visível para staff de comunicação (admin/vrm/operador/comunicacao)
 * e para quem tem a flag avulsa "Acesso ao Inbox" no perfil.
 * Reaproveita a mesma contagem (query "comm-badge") usada pelas abas de Comunicação.
 */
export function InboxQuickButton() {
  const role = useCurrentUserRole();
  const inboxFlag = useInboxAccessFlag();
  const navigate = useNavigate();
  const badgeFn = useServerFn(getMyCommunicationBadge);

  const canSee =
    inboxFlag ||
    role === "comunicacao" ||
    role === "admin" ||
    role === "vrm" ||
    role === "operador";

  const badgeQ = useQuery({
    queryKey: ["comm-badge"],
    queryFn: () => badgeFn(),
    enabled: canSee,
    refetchInterval: 30000,
  });

  const unread = badgeQ.data?.mine_unread ?? 0;
  const prev = useRef<number | null>(null);

  useEffect(() => {
    if (!canSee) return;
    if (prev.current !== null && unread > prev.current) {
      void playPqbNotificationSound();
    }
    prev.current = unread;
  }, [unread, canSee]);

  if (!canSee) return null;

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
