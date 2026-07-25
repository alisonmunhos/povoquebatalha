import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  listMyNotifications,
  countMyUnread,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/notifications.functions";
import fistAsset from "@/assets/logo-mark-fist.png.asset.json";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type Notification = {
  id: string;
  title: string;
  body: string | null;
  image_url: string | null;
  kind: string;
  cta_label: string | null;
  cta_kind: string | null;
  cta_payload: Record<string, unknown> | null;
  mission_id: string | null;
  read_at: string | null;
  created_at: string;
};

function buildCalendarIcs(payload: Record<string, unknown> | null | undefined): string {
  const title = String(payload?.title ?? "Evento");
  const start = String(payload?.start ?? new Date().toISOString());
  const end = String(payload?.end ?? new Date(Date.now() + 3600_000).toISOString());
  const description = String(payload?.description ?? "");
  const location = String(payload?.location ?? "");
  const dt = (s: string) => s.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//PovoQueBatalha//PT-BR
BEGIN:VEVENT
UID:${crypto.randomUUID()}
DTSTAMP:${dt(new Date().toISOString())}
DTSTART:${dt(start)}
DTEND:${dt(end)}
SUMMARY:${title}
DESCRIPTION:${description.replace(/\n/g, "\\n")}
LOCATION:${location}
END:VEVENT
END:VCALENDAR`;
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

function runCta(n: Notification) {
  const p = n.cta_payload ?? {};
  switch (n.cta_kind) {
    case "wa_me": {
      const phone = String(p.phone ?? "").replace(/\D/g, "");
      const msg = String(p.message ?? "");
      if (!phone) return;
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
      break;
    }
    case "link": {
      const url = String(p.url ?? "");
      if (!url) return;
      window.open(url, "_blank", "noopener");
      break;
    }
    case "calendar": {
      const href = buildCalendarIcs(p);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${String(p.title ?? "evento")}.ics`;
      a.click();
      break;
    }
    case "mission": {
      if (n.mission_id) window.location.href = `/agitacao?missao=${n.mission_id}`;
      break;
    }
    default:
      break;
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const listFn = useServerFn(listMyNotifications);
  const countFn = useServerFn(countMyUnread);
  const markFn = useServerFn(markNotificationRead);
  const markAllFn = useServerFn(markAllNotificationsRead);

  const countQ = useQuery({
    queryKey: ["notif-unread"],
    queryFn: () => countFn({ data: {} }),
    refetchInterval: 60_000,
  });
  const listQ = useQuery({
    queryKey: ["notif-list"],
    queryFn: () => listFn({ data: { limit: 20 } }),
    enabled: open,
  });

  useEffect(() => {
    let userId: string | null = null;
    supabase.auth.getUser().then(({ data }) => {
      userId = data.user?.id ?? null;
      if (!userId) return;
      const channel = supabase
        .channel(`notif-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            qc.invalidateQueries({ queryKey: ["notif-unread"] });
            qc.invalidateQueries({ queryKey: ["notif-list"] });
          },
        )
        .subscribe();
      // teardown via captured channel
      (window as unknown as { __notifChannel?: unknown }).__notifChannel = channel;
    });
    return () => {
      const ch = (window as unknown as { __notifChannel?: { unsubscribe: () => void } }).__notifChannel;
      if (ch) supabase.removeChannel(ch as never);
    };
  }, [qc]);

  const unread = countQ.data?.unread ?? 0;
  const items = (listQ.data?.notifications ?? []) as Notification[];
  const hasUnread = unread > 0;

  const bellAnim = useMemo(
    () => (hasUnread ? "animate-pulse ring-2 ring-primary ring-offset-1 ring-offset-background" : ""),
    [hasUnread],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Notificações${hasUnread ? ` (${unread} não lidas)` : ""}`}
          className={`relative inline-flex h-9 w-9 items-center justify-center rounded-full transition-all hover:bg-muted ${bellAnim}`}
        >
          <img src={fistAsset.url} alt="" className="h-6 w-6" />
          {hasUnread && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[1rem] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] max-w-[calc(100vw-1rem)] p-0">
        <div className="flex items-center justify-between border-b p-3">
          <div className="font-semibold text-sm">Notificações</div>
          {hasUnread && (
            <button
              onClick={async () => {
                await markAllFn({ data: {} });
                qc.invalidateQueries({ queryKey: ["notif-unread"] });
                qc.invalidateQueries({ queryKey: ["notif-list"] });
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Marcar todas como lidas
            </button>
          )}
        </div>
        <div className="max-h-[24rem] overflow-y-auto">
          {items.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {listQ.isLoading ? "Carregando…" : "Nenhuma notificação por enquanto."}
            </div>
          )}
          {items.map((n) => {
            const isUnread = !n.read_at;
            return (
              <div
                key={n.id}
                className={`px-3 py-3 border-b last:border-b-0 ${isUnread ? "bg-primary/5" : ""}`}
              >
                <div className="flex items-start gap-2">
                  {n.image_url ? (
                    <img
                      src={n.image_url}
                      alt=""
                      className="h-9 w-9 rounded object-cover shrink-0"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded bg-primary/10 flex items-center justify-center shrink-0">
                      <img src={fistAsset.url} alt="" className="h-5 w-5" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-sm truncate">{n.title}</div>
                      {isUnread && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                    </div>
                    {n.body && (
                      <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap break-words">
                        {n.body}
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      {n.cta_label && n.cta_kind && n.cta_kind !== "none" && (
                        <Button
                          size="sm"
                          onClick={async () => {
                            runCta(n);
                            if (isUnread) {
                              await markFn({ data: { id: n.id } });
                              qc.invalidateQueries({ queryKey: ["notif-unread"] });
                              qc.invalidateQueries({ queryKey: ["notif-list"] });
                            }
                          }}
                        >
                          {n.cta_label}
                        </Button>
                      )}
                      {isUnread && (
                        <button
                          onClick={async () => {
                            await markFn({ data: { id: n.id } });
                            qc.invalidateQueries({ queryKey: ["notif-unread"] });
                            qc.invalidateQueries({ queryKey: ["notif-list"] });
                          }}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Marcar como lida
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
