import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  listMyNotifications,
  countMyUnread,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/notifications.functions";
import { playPqbNotificationSound, primeNotificationAudio } from "@/lib/notification-sound";
import { usePushSubscription } from "@/hooks/use-push-subscription";
import fistAsset from "@/assets/fist-alert.png.asset.json";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, Volume2 } from "lucide-react";


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
      window.location.href = "/minhas-missoes";
      break;
    }
    default:
      break;
  }
}

const SESSION_ALERT_KEY = "pqb:notif-alert-shown";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Notification | null>(null);
  const [showEntryAlert, setShowEntryAlert] = useState(false);
  const entryAlertChecked = useRef(false);
  const qc = useQueryClient();
  const listFn = useServerFn(listMyNotifications);
  const countFn = useServerFn(countMyUnread);
  const markFn = useServerFn(markNotificationRead);
  const markAllFn = useServerFn(markAllNotificationsRead);
  const push = usePushSubscription();


  const countQ = useQuery({
    queryKey: ["notif-unread"],
    queryFn: () => countFn(),
    refetchInterval: 60_000,
  });
  const listQ = useQuery({
    queryKey: ["notif-list"],
    queryFn: () => listFn({ data: { limit: 20 } }),
    enabled: open || showEntryAlert,
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
            // Toca o som exclusivo quando o app está aberto.
            playPqbNotificationSound();
          },

        )
        .subscribe();
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

  // Alerta central de entrada: aparece uma vez por sessão quando há não-lidas.
  useEffect(() => {
    if (entryAlertChecked.current) return;
    if (countQ.data === undefined) return;
    entryAlertChecked.current = true;
    try {
      const already = sessionStorage.getItem(SESSION_ALERT_KEY);
      if (!already && hasUnread) {
        setShowEntryAlert(true);
        sessionStorage.setItem(SESSION_ALERT_KEY, "1");
      }
    } catch {
      // ignore
    }
  }, [countQ.data, hasUnread]);

  async function openDetail(n: Notification) {
    setOpen(false);
    setDetail(n);
    if (!n.read_at) {
      await markFn({ data: { id: n.id } });
      qc.invalidateQueries({ queryKey: ["notif-unread"] });
      qc.invalidateQueries({ queryKey: ["notif-list"] });
    }
  }

  function openLatestFromEntryAlert() {
    setShowEntryAlert(false);
    const firstUnread = items.find((n) => !n.read_at) ?? items[0];
    if (firstUnread) {
      openDetail(firstUnread);
    } else {
      setOpen(true);
    }
  }

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (v) primeNotificationAudio();
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Notificações${hasUnread ? ` (${unread} não lidas)` : ""}`}
            className="relative inline-flex h-12 w-12 items-center justify-center rounded-full transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {hasUnread && (
              <>
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-accent/40 animate-ping"
                />
                <span
                  aria-hidden
                  className="absolute -inset-1 rounded-full ring-4 ring-accent/70 animate-pulse"
                />
              </>
            )}
            <img
              src={fistAsset.url}
              alt=""
              className={`relative h-10 w-10 object-contain drop-shadow ${hasUnread ? "animate-pulse" : ""}`}
            />
            {hasUnread && (
              <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-accent text-accent-foreground text-[11px] font-bold flex items-center justify-center ring-2 ring-background">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[22rem] max-w-[calc(100vw-1rem)] p-0">
          <div className="flex items-center justify-between border-b p-3">
            <div className="font-semibold text-sm">Notificações</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { primeNotificationAudio(); playPqbNotificationSound(); }}
                title="Ouvir som"
                className="text-muted-foreground hover:text-foreground"
              >
                <Volume2 className="h-4 w-4" />
              </button>
              {hasUnread && (
                <button
                  onClick={async () => {
                    await markAllFn();
                    qc.invalidateQueries({ queryKey: ["notif-unread"] });
                    qc.invalidateQueries({ queryKey: ["notif-list"] });
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Marcar todas
                </button>
              )}
            </div>
          </div>
          {push.state.status !== "unsupported" && push.state.status !== "subscribed" && (
            <div className="border-b p-3 bg-primary/5">
              <div className="text-xs font-semibold text-foreground">Receber alertas no celular</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {push.state.status === "denied"
                  ? "Você bloqueou. Libere nas configurações do navegador."
                  : "Ative pra receber avisos mesmo com o app fechado."}
              </p>
              {push.state.status !== "denied" && (
                <Button
                  type="button"
                  size="sm"
                  className="mt-2 w-full h-8 text-xs"
                  onClick={async () => {
                    try {
                      primeNotificationAudio();
                      await push.subscribe();
                    } catch (e) {
                      console.error(e);
                    }
                  }}
                >
                  <Bell className="h-3.5 w-3.5 mr-1" /> Ativar notificações
                </Button>
              )}
            </div>
          )}
          {push.state.status === "subscribed" && (
            <div className="border-b px-3 py-2 flex items-center justify-between bg-primary/5 text-[11px]">
              <span className="text-muted-foreground">✓ Alertas no celular ativos</span>
              <button
                type="button"
                onClick={() => push.unsubscribe()}
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <BellOff className="h-3 w-3" /> Desligar
              </button>
            </div>
          )}

          <div className="max-h-[24rem] overflow-y-auto">
            {items.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {listQ.isLoading ? "Carregando…" : "Nenhuma notificação por enquanto."}
              </div>
            )}
            {items.map((n) => {
              const isUnread = !n.read_at;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openDetail(n)}
                  className={`w-full text-left px-3 py-3 border-b last:border-b-0 transition-colors hover:bg-muted/60 ${
                    isUnread ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {n.image_url ? (
                      <img
                        src={n.image_url}
                        alt=""
                        className="h-10 w-10 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center shrink-0">
                        <img src={fistAsset.url} alt="" className="h-6 w-6" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-sm truncate">{n.title}</div>
                        {isUnread && <span className="h-2 w-2 rounded-full bg-accent shrink-0" />}
                      </div>
                      {n.body && (
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2 break-words">
                          {n.body}
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {/* Modal de detalhe em tela cheia */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent
          className="p-0 gap-0 max-w-lg w-[calc(100vw-1rem)] max-h-[90dvh] overflow-hidden flex flex-col"
        >
          {detail && (
            <>
              <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-3 pr-12 border-b bg-card">
                <div className="font-semibold text-sm truncate">{detail.title}</div>
              </div>
              <div className="overflow-y-auto flex-1">
                {detail.image_url && (
                  <img
                    src={detail.image_url}
                    alt=""
                    className="w-full h-auto object-contain bg-black/5"
                  />
                )}
                <div className="p-4 space-y-3">
                  {detail.body && (
                    <p className="text-sm whitespace-pre-wrap break-words">{detail.body}</p>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(detail.created_at), { addSuffix: true, locale: ptBR })}
                  </div>
                  {detail.cta_label && detail.cta_kind && detail.cta_kind !== "none" && (
                    <Button
                      size="lg"
                      className="w-full"
                      onClick={() => runCta(detail)}
                    >
                      {detail.cta_label}
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Alerta central de entrada */}
      <Dialog open={showEntryAlert} onOpenChange={setShowEntryAlert}>
        <DialogContent
          className="p-0 gap-0 max-w-sm w-[calc(100vw-2rem)] text-center overflow-hidden"

        >
          <div className="p-6 flex flex-col items-center gap-4">
            <div className="relative inline-flex items-center justify-center">
              <span aria-hidden className="absolute inset-0 rounded-full bg-accent/30 animate-ping" />
              <span aria-hidden className="absolute -inset-2 rounded-full ring-4 ring-accent/60 animate-pulse" />
              <img src={fistAsset.url} alt="" className="relative h-20 w-20 object-contain animate-pulse" />
            </div>
            <div>
              <div className="font-display text-xl leading-tight">Você tem notificações</div>
              <div className="text-sm text-muted-foreground mt-1">
                {unread} {unread === 1 ? "aviso novo" : "avisos novos"} pra você.
              </div>
            </div>
            <div className="flex flex-col gap-2 w-full">
              <Button size="lg" onClick={openLatestFromEntryAlert} className="w-full">
                Ver agora
              </Button>
              <button
                onClick={() => setShowEntryAlert(false)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Fechar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
