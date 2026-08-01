// Conquista da semana: cálculo por usuário + notificação roxa + web push.
// Regra da janela: sábado 00:00 (fuso da campanha) até a sexta seguinte 23:59.
// Roda no sábado de manhã, falando da semana que acabou de fechar.
import { TASK_STATUS } from "@/lib/agitation-task-status";
import {
  buildWeekStat,
  weekWindows,
  dayKeyOf,
  weekDayKeys,
  QUALIFYING_SOURCE_EVENTS,
} from "@/lib/impact-week";
import { weekMilestoneFor } from "@/lib/impact-milestones";
import type { WeekStatShape } from "@/lib/impact-week";

export const WEEKLY_IMPACT_KIND = "weekly_impact";


export type WeeklyImpactPayload = {
  week_start: string;
  week_end: string;
  range_label: string;
  messages: number;
  contacts: number;
  connections: number;
  active_days: number;
  previous_connections: number;
  daily: Array<{ day: string; label: string; messages: number; contacts: number }>;
  url: string;
};

function countByDay(rows: Array<{ key: string | null }>): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (!r.key) continue;
    m.set(r.key, (m.get(r.key) ?? 0) + 1);
  }
  return m;
}

/** Calcula a semana fechada (e a anterior) de cada usuário informado. */
export async function computeWeeklyStatsForUsers(
  userIds: string[],
  now: Date = new Date(),
): Promise<Map<string, { closed: WeekStatShape; previous: WeekStatShape }>> {
  const result = new Map<string, { closed: WeekStatShape; previous: WeekStatShape }>();
  if (!userIds.length) return result;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const win = weekWindows(now);
  const fromKey = win.beforeClosedStart;
  // Buscamos com folga de 1 dia em cada ponta para não perder nada por fuso.
  const fromIso = new Date(`${fromKey}T00:00:00-03:00`).toISOString();
  const toIso = new Date(`${win.currentStart}T00:00:00-03:00`).toISOString();

  const [tasksRes, eventsRes] = await Promise.all([
    supabaseAdmin
      .from("agitation_tasks")
      .select("assigned_user_id, completed_at, updated_at")
      .in("assigned_user_id", userIds)
      .eq("status", TASK_STATUS.ENVIADO)
      .gte("updated_at", fromIso)
      .lt("updated_at", toIso)
      .limit(50000),
    supabaseAdmin
      .from("contact_source_events")
      .select("source_user_id, contact_id, created_at")
      .in("source_user_id", userIds)
      .in("event_type", [...QUALIFYING_SOURCE_EVENTS])
      .neq("source_module", "importacao")
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .limit(50000),
  ]);

  const msgRowsByUser = new Map<string, Array<{ key: string | null }>>();
  for (const t of tasksRes.data ?? []) {
    const uid = t.assigned_user_id as string | null;
    if (!uid) continue;
    const iso = (t.completed_at ?? t.updated_at) as string | null;
    if (!iso) continue;
    const arr = msgRowsByUser.get(uid) ?? [];
    arr.push({ key: dayKeyOf(iso) });
    msgRowsByUser.set(uid, arr);
  }

  const seenContact = new Set<string>();
  const contactRowsByUser = new Map<string, Array<{ key: string | null }>>();
  for (const ev of eventsRes.data ?? []) {
    const uid = ev.source_user_id as string | null;
    const cid = ev.contact_id as string | null;
    if (!uid || !cid) continue;
    const dedupe = `${uid}:${cid}`;
    if (seenContact.has(dedupe)) continue;
    seenContact.add(dedupe);
    const arr = contactRowsByUser.get(uid) ?? [];
    arr.push({ key: dayKeyOf(ev.created_at as string) });
    contactRowsByUser.set(uid, arr);
  }

  for (const uid of userIds) {
    const msgs = countByDay(msgRowsByUser.get(uid) ?? []);
    const contacts = countByDay(contactRowsByUser.get(uid) ?? []);
    result.set(uid, {
      closed: buildWeekStat(win.closedStart, msgs, contacts),
      previous: buildWeekStat(win.beforeClosedStart, msgs, contacts),
    });
  }
  return result;
}

function buildText(stat: WeekStatShape, previous: WeekStatShape) {
  const badge = weekMilestoneFor(stat.connections);
  const diff = stat.connections - previous.connections;
  const compare =
    previous.connections === 0 && stat.connections === 0
      ? "Vamos começar a próxima semana com força."
      : diff > 0
        ? `São ${diff} a mais que na semana anterior.`
        : diff < 0
          ? `Foram ${Math.abs(diff)} a menos que na semana anterior.`
          : "Mesmo ritmo da semana anterior.";
  if (stat.connections === 0) {
    return {
      title: "Sua semana está esperando por você",
      body: `Nenhuma conexão entre ${stat.rangeLabel}. Uma conversa já muda esse número — toque para ver sua jornada.`,
    };
  }
  return {
    title: `Sua semana: ${stat.connections} ${stat.connections === 1 ? "pessoa" : "pessoas"}`,
    body: `${badge.badge} · ${stat.messages} mensagens e ${stat.contacts} cadastros entre ${stat.rangeLabel}. ${compare}`,
  };
}

/**
 * Envia a notificação semanal roxa. Idempotente por semana: se o usuário já
 * recebeu a conquista daquela semana, não duplica (a não ser com force).
 */
export async function sendWeeklyImpactNotifications(opts: {
  userIds?: string[];
  now?: Date;
  onlyActive?: boolean;
  force?: boolean;
}): Promise<{ sent: number; skipped: number; users: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = opts.now ?? new Date();
  // Todos os usuários recebem a jornada, mesmo quem não enviou missões:
  // cadastros também contam. `onlyActive` só é usado se pedido explicitamente.
  const onlyActive = opts.onlyActive ?? false;

  let userIds = opts.userIds ?? [];
  if (!userIds.length) {
    const { data: ps } = await supabaseAdmin
      .from("profiles")
      .select("id,status")
      .neq("status", "revogado");
    userIds = Array.from(new Set((ps ?? []).map((r) => r.id as string)));
  }
  if (!userIds.length) return { sent: 0, skipped: 0, users: 0 };

  const stats = await computeWeeklyStatsForUsers(userIds, now);
  const win = weekWindows(now);

  const { data: existing } = await supabaseAdmin
    .from("notifications")
    .select("user_id")
    .eq("kind", WEEKLY_IMPACT_KIND)
    .in("user_id", userIds)
    .filter("cta_payload->>week_start", "eq", win.closedStart);
  const alreadySent = new Set((existing ?? []).map((r) => r.user_id as string));

  const { randomUUID } = await import("node:crypto");
  const batchId = randomUUID();

  const rows: Array<Record<string, unknown>> = [];
  const textByUser = new Map<string, { title: string; body: string }>();
  let skipped = 0;

  for (const uid of userIds) {
    const s = stats.get(uid);
    if (!s) continue;
    if (!opts.force && alreadySent.has(uid)) {
      skipped++;
      continue;
    }
    if (onlyActive && s.closed.connections === 0) {
      skipped++;
      continue;
    }
    const text = buildText(s.closed, s.previous);
    textByUser.set(uid, text);
    const payload: WeeklyImpactPayload = {
      week_start: s.closed.startKey,
      week_end: s.closed.endKey,
      range_label: s.closed.rangeLabel,
      messages: s.closed.messages,
      contacts: s.closed.contacts,
      connections: s.closed.connections,
      active_days: s.closed.activeDays,
      previous_connections: s.previous.connections,
      daily: s.closed.daily,
      url: "/minha-semana",
    };
    rows.push({
      user_id: uid,
      title: text.title,
      body: text.body,
      kind: WEEKLY_IMPACT_KIND,
      cta_kind: "link",
      cta_label: "Ver e compartilhar minha semana",
      cta_payload: payload,
      batch_id: batchId,
      created_by: null,
    });
  }

  if (!rows.length) return { sent: 0, skipped, users: userIds.length };

  const { data: inserted, error } = await supabaseAdmin
    .from("notifications")
    .insert(rows as never)
    .select("id, user_id");
  if (error) throw new Error(error.message);

  // Web push best-effort
  try {
    const { sendWebPush } = await import("@/lib/web-push.server");
    const targetIds = (inserted ?? []).map((r) => r.user_id as string);
    const notifByUser = new Map<string, string>();
    for (const r of inserted ?? []) {
      if (!notifByUser.has(r.user_id as string)) notifByUser.set(r.user_id as string, r.id as string);
    }
    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("user_id, endpoint, p256dh, auth")
      .in("user_id", targetIds);
    await Promise.allSettled(
      (subs ?? [])
        .filter((s) => s.user_id != null)
        .map(async (s) => {
          const uid = s.user_id as string;
          const text = textByUser.get(uid);
          const notifId = notifByUser.get(uid) ?? null;
          const r = await sendWebPush(
            { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
            {
              title: text?.title ?? "Sua semana chegou",
              body: text?.body ?? "",
              url: "/minha-semana",
              notificationId: notifId,
              tag: `pqb-week-${notifId ?? Date.now()}`,
            },
          );
          if (r.gone) await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        }),
    );
  } catch (e) {
    console.error("[weekly-impact] push falhou", e);
  }

  return { sent: rows.length, skipped, users: userIds.length };
}

export { weekDayKeys };
