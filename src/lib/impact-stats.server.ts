// Cálculo dos números de "Meu Impacto" — server-only (usa service role).
// Regra: só conta o que virou ação real — mensagem enviada (status "enviado") e
// contato adicionado por ele. Pendente, erro e opt-out nunca entram na conta.
import { TASK_STATUS } from "@/lib/agitation-task-status";
import { buildWeekStat, weekWindows, QUALIFYING_SOURCE_EVENTS } from "@/lib/impact-week";
import type { ImpactStats } from "@/lib/impact-stats-types";

const TZ = "America/Sao_Paulo";

/** Chave de dia (YYYY-MM-DD) no fuso da campanha, para agrupar sem erro de UTC. */
function dayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function lastNDayKeys(n: number): string[] {
  const keys: string[] = [];
  const now = Date.now();
  for (let i = n - 1; i >= 0; i--) {
    keys.push(dayKey(new Date(now - i * 86_400_000).toISOString()) as string);
  }
  return keys;
}

/** Números agregados de um usuário específico. Chamador deve autorizar antes. */
export async function computeImpactStats(userId: string): Promise<ImpactStats> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const todayKey = dayKey(new Date().toISOString());
  const window7 = lastNDayKeys(7);

  // Perfil primeiro: o contato ligado ao login é o que permite contar também as
  // tarefas que foram atribuídas por link (assigned_contact_id).
  const profileRes = await supabaseAdmin
    .from("profiles")
    .select("full_name, contact_id")
    .eq("id", userId)
    .maybeSingle();
  const linkedContactId = profileRes.data?.contact_id ?? null;

  const [tasksRes, linkTasksRes, eventsRes, claimsRes] = await Promise.all([
    supabaseAdmin
      .from("agitation_tasks")
      .select("id, status, completed_at, updated_at, claim_id")
      .eq("assigned_user_id", userId),
    linkedContactId
      ? supabaseAdmin
          .from("agitation_tasks")
          .select("id, status, completed_at, updated_at, claim_id")
          .eq("assigned_contact_id", linkedContactId)
      : Promise.resolve({ data: [] as unknown[] }),
    supabaseAdmin
      .from("contact_source_events")
      .select("contact_id, created_at")
      .eq("source_user_id", userId)
      .in("event_type", [...QUALIFYING_SOURCE_EVENTS])
      .neq("source_module", "importacao")
      .order("created_at", { ascending: true })
      .limit(20000),
    supabaseAdmin
      .from("agitation_mission_claims")
      .select("id, completed_at, cancelled_at, claimed_at")
      .eq("user_id", userId),
  ]);

  type TaskRow = {
    id: string;
    status: string | null;
    completed_at: string | null;
    updated_at: string | null;
    claim_id: string | null;
  };
  // REGRA ÚNICA DE "CONEXÕES" (usada no cartão, na faixa da Agitação e na
  // notificação de sábado): conexões = mensagens enviadas em missão
  // (autodeclaradas pela pessoa) + contatos adicionados por ela, sem repetir o
  // mesmo contato. As tarefas contam tanto quando foram atribuídas ao login
  // (assigned_user_id) quanto quando vieram por link para o contato dela
  // (assigned_contact_id) — cada tarefa entra uma única vez.
  const byId = new Map<string, TaskRow>();
  for (const t of [
    ...((tasksRes.data ?? []) as TaskRow[]),
    ...((linkTasksRes.data ?? []) as TaskRow[]),
  ]) {
    byId.set(t.id, t);
  }
  const tasks = [...byId.values()];
  const sentTasks = tasks.filter((t) => t.status === TASK_STATUS.ENVIADO);

  // Contatos adicionados: um por contato, na primeira vez que ele apareceu por este usuário.
  // Só conta captação real — importação em massa e atualizações de ficha não entram.
  type EventRow = { contact_id: string | null; created_at: string };
  const firstSeen = new Map<string, string>();
  for (const ev of (eventsRes.data ?? []) as EventRow[]) {
    if (!ev.contact_id) continue;
    if (!firstSeen.has(ev.contact_id)) firstSeen.set(ev.contact_id, ev.created_at);
  }

  const messagesByDay = new Map<string, number>();
  for (const t of sentTasks) {
    const k = dayKey(t.completed_at ?? t.updated_at);
    if (k) messagesByDay.set(k, (messagesByDay.get(k) ?? 0) + 1);
  }
  const contactsByDay = new Map<string, number>();
  for (const iso of firstSeen.values()) {
    const k = dayKey(iso);
    if (k) contactsByDay.set(k, (contactsByDay.get(k) ?? 0) + 1);
  }

  const messagesTotal = sentTasks.length;
  const messagesToday = todayKey ? (messagesByDay.get(todayKey) ?? 0) : 0;
  const contactsTotal = firstSeen.size;
  const contactsToday = todayKey ? (contactsByDay.get(todayKey) ?? 0) : 0;

  type ClaimRow = { id: string; completed_at: string | null; cancelled_at: string | null; claimed_at: string };
  const claims = (claimsRes.data ?? []) as ClaimRow[];
  const validClaims = claims.filter((c) => !c.cancelled_at);
  const openClaim = validClaims.find((c) => !c.completed_at) ?? null;
  const openClaimTasks = openClaim ? tasks.filter((t) => t.claim_id === openClaim.id) : [];

  // Ofensiva: dias consecutivos (até hoje ou ontem) com pelo menos uma ação.
  const activeDays = new Set<string>([...messagesByDay.keys(), ...contactsByDay.keys()]);
  let streakDays = 0;
  for (let i = 0; i < 365; i++) {
    const k = dayKey(new Date(Date.now() - i * 86_400_000).toISOString());
    if (!k) break;
    if (activeDays.has(k)) streakDays++;
    else if (i > 0 || activeDays.size === 0) break;
  }

  const dayFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "short" });
  const daily = window7.map((day) => ({
    day,
    label: dayFormatter
      .format(new Date(`${day}T12:00:00Z`))
      .replace(".", "")
      .slice(0, 3),
    messages: messagesByDay.get(day) ?? 0,
    contacts: contactsByDay.get(day) ?? 0,
  }));

  const firstIso = [...firstSeen.values()][0] ?? null;
  const win = weekWindows(new Date());

  return {
    displayName: (profileRes.data?.full_name ?? "").trim(),
    connections: { total: messagesTotal + contactsTotal, today: messagesToday + contactsToday },
    messages: { total: messagesTotal, today: messagesToday },
    contacts: { total: contactsTotal, today: contactsToday },
    missions: {
      total: validClaims.length,
      concluded: validClaims.filter((c) => c.completed_at).length,
      openTasks: openClaimTasks.filter((t) => t.status !== TASK_STATUS.ENVIADO).length,
      sentInOpenClaim: openClaimTasks.filter((t) => t.status === TASK_STATUS.ENVIADO).length,
      openClaimTotal: openClaimTasks.length,
    },
    daily,
    streakDays,
    since: firstIso,
    weeks: {
      current: buildWeekStat(win.currentStart, messagesByDay, contactsByDay),
      closed: buildWeekStat(win.closedStart, messagesByDay, contactsByDay),
      beforeClosed: buildWeekStat(win.beforeClosedStart, messagesByDay, contactsByDay),
    },
  };
}
