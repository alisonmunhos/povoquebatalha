import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import whatsappLogo from "@/assets/whatsapp-logo.png.asset.json";

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
      className="relative inline-flex items-center justify-center h-11 w-11 rounded-full hover:bg-success/10 active:bg-success/20 transition-colors shrink-0"
    >
      <img src={whatsappLogo.url} alt="" aria-hidden className="h-7 w-7" />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[1.25rem] h-[1.25rem] px-1 rounded-full bg-card text-foreground border-2 border-card shadow-sm text-[10px] font-bold ring-1 ring-border">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}

