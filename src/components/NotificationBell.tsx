import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  listMyNotifications,
  countMyUnread,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/notifications.functions";
import { claimMissionBatch, getMissionNotificationBriefing } from "@/lib/agitation-missions.functions";
import { approvePendingUser, rejectPendingUser } from "@/lib/users.functions";
import type { UserApprovalPayload } from "@/lib/system-notifications.server";
import { ALL_ROLES, ROLE_LABEL, type AppRole } from "@/lib/roles";
import { useCurrentUserRole } from "@/hooks/use-current-role";
import { playPqbNotificationSound, primeNotificationAudio } from "@/lib/notification-sound";
import { usePushSubscription } from "@/hooks/use-push-subscription";
import fistAsset from "@/assets/fist-alert.png.asset.json";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, Volume2 } from "lucide-react";
import { toast } from "sonner";


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
      const missionId = n.mission_id ?? String(p.mission_id ?? "");
      window.location.href = missionId
        ? `/minhas-missoes?mission=${encodeURIComponent(missionId)}`
        : "/minhas-missoes";
      break;
    }
    default:
      break;
  }
}

const SESSION_ALERT_KEY = "pqb:notif-alert-shown";

function parseUserApprovalPayload(
  payload: Record<string, unknown> | null | undefined,
): UserApprovalPayload | null {
  if (!payload?.pending_user_id || typeof payload.pending_user_id !== "string") return null;
  const role = payload.requested_role;
  return {
    pending_user_id: payload.pending_user_id,
    full_name: String(payload.full_name ?? ""),
    email: String(payload.email ?? ""),
    requested_role:
      typeof role === "string" && ALL_ROLES.includes(role as AppRole) ? (role as AppRole) : null,
    phone: payload.phone ? String(payload.phone) : null,
  };
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Notification | null>(null);
  const [acceptingMission, setAcceptingMission] = useState(false);
  const [approvalRole, setApprovalRole] = useState<AppRole>("agitador");
  const [approvingUser, setApprovingUser] = useState(false);
  const [rejectingUser, setRejectingUser] = useState(false);
  const [showEntryAlert, setShowEntryAlert] = useState(false);
  const entryAlertChecked = useRef(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const role = useCurrentUserRole();
  const listFn = useServerFn(listMyNotifications);
  const countFn = useServerFn(countMyUnread);
  const markFn = useServerFn(markNotificationRead);
  const markAllFn = useServerFn(markAllNotificationsRead);
  const claimFn = useServerFn(claimMissionBatch);
  const briefingFn = useServerFn(getMissionNotificationBriefing);
  const approveFn = useServerFn(approvePendingUser);
  const rejectFn = useServerFn(rejectPendingUser);
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
  const missionBriefingQ = useQuery({
    queryKey: ["mission-briefing", detail?.mission_id],
    queryFn: () => briefingFn({ data: { mission_id: detail!.mission_id! } }),
    enabled: !!detail && detail.kind === "mission" && !!detail.mission_id,
  });

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id ?? null;
      if (!userId || cancelled) return;
      const existing = (window as unknown as { __notifChannel?: unknown }).__notifChannel;
      if (existing) supabase.removeChannel(existing as never);
      channel = supabase
        .channel(`notif-${userId}-${Math.random().toString(36).slice(2)}`)
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
      cancelled = true;
      if (channel) {
        supabase.removeChannel(channel);
        (window as unknown as { __notifChannel?: unknown }).__notifChannel = undefined;
      }
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
    if (n.kind === "user_approval") {
      const payload = parseUserApprovalPayload(n.cta_payload);
      setApprovalRole(payload?.requested_role ?? "agitador");
    }
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

  async function goToMission(missionId: string) {
    await navigate({ to: "/minhas-missoes", search: { mission: missionId } });
    setDetail(null);
  }

  async function acceptMission() {
    if (!detail?.mission_id) return;
    const missionId = detail.mission_id;
    setAcceptingMission(true);
    try {
      const r = await claimFn({ data: { mission_id: missionId } });
      if (!r.task_ids.length) {
        toast.info("Não há contatos disponíveis nesta missão agora.");
      } else {
        toast.success(`${r.task_ids.length} contato(s) atribuído(s) a você.`);
      }
      qc.invalidateQueries({ queryKey: ["my-missions"] });
      await goToMission(missionId);
    } catch (e) {
      // Não redirecionar fingindo sucesso: mostrar o motivo real do bloqueio.
      toast.error(e instanceof Error ? e.message : "Não foi possível aceitar a missão agora.");
      missionBriefingQ.refetch();
    } finally {
      setAcceptingMission(false);
    }
  }

  const userApprovalPayload =
    detail?.kind === "user_approval" ? parseUserApprovalPayload(detail.cta_payload) : null;
  const isAdmin = role === "admin";

  async function approveFromBell() {
    if (!userApprovalPayload) return;
    setApprovingUser(true);
    try {
      await approveFn({ data: { userId: userApprovalPayload.pending_user_id, role: approvalRole } });
      setDetail(null);
      qc.invalidateQueries({ queryKey: ["notif-unread"] });
      qc.invalidateQueries({ queryKey: ["notif-list"] });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao aprovar.");
    } finally {
      setApprovingUser(false);
    }
  }

  async function rejectFromBell() {
    if (!userApprovalPayload) return;
    const label = userApprovalPayload.full_name || userApprovalPayload.email;
    const first = prompt(
      `REJEITAR o cadastro de ${label}?\n\nA conta será apagada permanentemente. Esta ação não pode ser desfeita.\n\nDigite REJEITAR para confirmar.`,
    );
    if (first !== "REJEITAR") return;
    setRejectingUser(true);
    try {
      await rejectFn({ data: { userId: userApprovalPayload.pending_user_id } });
      setDetail(null);
      qc.invalidateQueries({ queryKey: ["notif-unread"] });
      qc.invalidateQueries({ queryKey: ["notif-list"] });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao rejeitar.");
    } finally {
      setRejectingUser(false);
    }
  }

  const isMissionDetail = detail?.kind === "mission";
  const isUserApprovalDetail = detail?.kind === "user_approval";
  const isWeeklyDetail = detail?.kind === "weekly_impact";
  const briefing = missionBriefingQ.data;

  async function goToMyWeek() {
    setDetail(null);
    await navigate({ to: "/minha-semana" });
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
                        <div className="font-semibold text-sm truncate flex items-center gap-1.5">
                          {n.kind === "user_approval" && (
                            <span className="text-[10px] font-bold tracking-wide rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.5 shrink-0">
                              APROVAÇÃO
                            </span>
                          )}
                          {n.kind === "weekly_impact" && (
                            <span className="text-[10px] font-bold tracking-wide rounded-full bg-[#7B4B94] text-white px-1.5 py-0.5 shrink-0">
                              SEMANA
                            </span>
                          )}
                          {n.title}
                        </div>
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
                {isMissionDetail && (
                  <span className="text-[10px] font-bold tracking-wide rounded-full bg-primary/10 text-primary px-2 py-0.5 shrink-0">
                    MISSÃO
                  </span>
                )}
                {isUserApprovalDetail && (
                  <span className="text-[10px] font-bold tracking-wide rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 shrink-0">
                    APROVAÇÃO
                  </span>
                )}
                {isWeeklyDetail && (
                  <span className="text-[10px] font-bold tracking-wide rounded-full bg-[#7B4B94] text-white px-2 py-0.5 shrink-0">
                    SEMANA
                  </span>
                )}
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
                  {isMissionDetail ? (
                    <>
                      {missionBriefingQ.isLoading && (
                        <p className="text-sm text-muted-foreground">Carregando briefing…</p>
                      )}
                      {missionBriefingQ.isError && (
                        <div className="space-y-2">
                          <p className="text-sm text-destructive">
                            Não conseguimos carregar o briefing desta missão agora.
                          </p>
                          <Button size="sm" variant="outline" onClick={() => missionBriefingQ.refetch()}>
                            Tentar de novo
                          </Button>
                        </div>
                      )}

                      {briefing && (
                        <div className="space-y-3">
                          <div>
                            <div className="text-xs font-medium text-muted-foreground">Missão</div>
                            <div className="text-sm font-semibold">{briefing.title}</div>
                          </div>
                          {briefing.instructions && (
                            <div>
                              <div className="text-xs font-medium text-muted-foreground">Instruções</div>
                              <p className="text-sm whitespace-pre-wrap break-words">{briefing.instructions}</p>
                            </div>
                          )}
                          <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                            {briefing.has_my_tasks ? (
                              <>
                                <div>
                                  Sua leva:{" "}
                                  <span className="font-semibold text-foreground">
                                    {briefing.mine_total}
                                  </span>{" "}
                                  contato(s)
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {briefing.mine_pending} pendente(s) · {briefing.mine_sent} enviado(s) ·{" "}
                                  {briefing.mine_not_sent} não enviado(s)
                                </div>
                              </>
                            ) : briefing.self_assign ? (
                              <>
                                <div>
                                  Você vai receber uma leva de{" "}
                                  <span className="font-semibold text-foreground">
                                    {briefing.batch_size}
                                  </span>{" "}
                                  contato(s)
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {briefing.available_now} disponível(is) no total desta missão
                                </div>
                              </>
                            ) : (
                              <div className="text-xs text-muted-foreground">
                                Esta missão é distribuída pela coordenação. Aguarde os contatos serem
                                atribuídos a você.
                              </div>
                            )}
                            {briefing.in_cooldown && briefing.releases_at && (
                              <div className="text-xs text-amber-600 dark:text-amber-400">
                                Você poderá pegar uma nova leva{" "}
                                {formatDistanceToNow(new Date(briefing.releases_at), {
                                  addSuffix: true,
                                  locale: ptBR,
                                })}
                                .
                              </div>
                            )}
                          </div>

                        </div>
                      )}
                      {!briefing && !missionBriefingQ.isLoading && detail.body && (
                        <p className="text-sm whitespace-pre-wrap break-words">{detail.body}</p>
                      )}
                    </>
                  ) : isUserApprovalDetail && userApprovalPayload ? (
                    <div className="space-y-3">
                      <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
                        <div>
                          <div className="text-xs font-medium text-muted-foreground">Nome</div>
                          <div className="font-medium">{userApprovalPayload.full_name || "—"}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-muted-foreground">E-mail</div>
                          <div className="break-all">{userApprovalPayload.email}</div>
                        </div>
                        {userApprovalPayload.phone && (
                          <div>
                            <div className="text-xs font-medium text-muted-foreground">WhatsApp</div>
                            <div>{userApprovalPayload.phone}</div>
                          </div>
                        )}
                      </div>
                      {detail.body && (
                        <p className="text-sm whitespace-pre-wrap break-words text-muted-foreground">{detail.body}</p>
                      )}
                      {isAdmin ? (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Papel ao aprovar</label>
                          <select
                            value={approvalRole}
                            onChange={(e) => setApprovalRole(e.target.value as AppRole)}
                            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          >
                            {ALL_ROLES.map((r) => (
                              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Apenas administradores podem aprovar ou rejeitar cadastros.
                        </p>
                      )}
                    </div>
                  ) : (
                    detail.body && (
                      <p className="text-sm whitespace-pre-wrap break-words">{detail.body}</p>
                    )
                  )}
                  <div className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(detail.created_at), { addSuffix: true, locale: ptBR })}
                  </div>
                  {isMissionDetail ? (
                    <div className="flex flex-col gap-2">
                      {briefing?.has_my_tasks && (
                        <Button
                          size="lg"
                          className="w-full"
                          onClick={() => detail.mission_id && void goToMission(detail.mission_id)}
                        >
                          Abrir minha missão ({briefing.mine_pending} pendente
                          {briefing.mine_pending === 1 ? "" : "s"})
                        </Button>
                      )}
                      {briefing?.can_claim && (
                        <Button
                          size="lg"
                          variant={briefing.has_my_tasks ? "outline" : "default"}
                          className="w-full"
                          onClick={acceptMission}
                          disabled={acceptingMission}
                        >
                          {acceptingMission
                            ? "Aceitando…"
                            : `Aceitar missão (leva de ${Math.min(briefing.batch_size, briefing.available_now)})`}
                        </Button>
                      )}
                      {briefing && !briefing.can_claim && !briefing.has_my_tasks && (
                        <Button
                          size="lg"
                          className="w-full"
                          onClick={() => detail.mission_id && void goToMission(detail.mission_id)}
                        >
                          Ver missão
                        </Button>
                      )}
                      {!briefing && (
                        <Button size="lg" className="w-full" onClick={acceptMission} disabled={acceptingMission}>
                          {acceptingMission ? "Aceitando…" : "Aceitar missão"}
                        </Button>
                      )}
                      {briefing && !briefing.can_claim && briefing.block_reason && (
                        <p className="text-xs text-center text-muted-foreground">
                          {briefing.block_reason === "leva_aberta"
                            ? "Você já tem uma leva em aberto. Conclua-a para pegar mais contatos."
                            : briefing.block_reason === "cooldown"
                              ? "Aguarde o tempo de espera para pegar uma nova leva."
                              : briefing.block_reason === "sem_contatos"
                                ? "Não há contatos disponíveis nesta missão agora."
                                : briefing.block_reason === "atribuicao_direta"
                                  ? "Os contatos desta missão são distribuídos pela coordenação."
                                  : "Missão indisponível para novas levas no momento."}
                        </p>
                      )}
                      <Button size="lg" variant="ghost" className="w-full" onClick={() => setDetail(null)}>
                        Agora não
                      </Button>
                    </div>
                  ) : isUserApprovalDetail && userApprovalPayload && isAdmin ? (
                    <div className="flex flex-col gap-2">
                      <Button
                        size="lg"
                        className="w-full"
                        onClick={approveFromBell}
                        disabled={approvingUser || rejectingUser}
                      >
                        {approvingUser ? "Aprovando…" : `Aprovar como ${ROLE_LABEL[approvalRole]}`}
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        className="w-full text-destructive border-destructive/30 hover:bg-destructive/5"
                        onClick={rejectFromBell}
                        disabled={approvingUser || rejectingUser}
                      >
                        {rejectingUser ? "Rejeitando…" : "Rejeitar cadastro"}
                      </Button>
                      <Button size="lg" variant="ghost" className="w-full" onClick={() => setDetail(null)}>
                        Agora não
                      </Button>
                    </div>
                  ) : isWeeklyDetail ? (
                    <div className="flex flex-col gap-2">
                      <Button
                        size="lg"
                        className="w-full text-white hover:opacity-90"
                        style={{ backgroundColor: "#7B4B94" }}
                        onClick={() => void goToMyWeek()}
                      >
                        Ver e compartilhar minha semana
                      </Button>
                      <Button size="lg" variant="ghost" className="w-full" onClick={() => setDetail(null)}>
                        Fechar
                      </Button>
                    </div>
                  ) : isUserApprovalDetail ? (
                    <Button size="lg" variant="outline" className="w-full" onClick={() => setDetail(null)}>
                      Fechar
                    </Button>

                  ) : (
                    detail.cta_label &&
                    detail.cta_kind &&
                    detail.cta_kind !== "none" && (
                      <Button size="lg" className="w-full" onClick={() => runCta(detail)}>
                        {detail.cta_label}
                      </Button>
                    )
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
