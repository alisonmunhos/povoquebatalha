import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SYSTEM_AUTO_NOTIFICATION_KINDS } from "@/lib/system-notification-settings.functions";

const listInput = z.object({
  limit: z.number().int().min(1).max(50).optional().default(20),
  onlyUnread: z.boolean().optional().default(false),
});

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => listInput.parse(raw ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("notifications")
      .select("*")
      .eq("user_id", context.userId)
      .is("cancelled_at", null)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.onlyUnread) q = q.is("read_at", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { notifications: rows ?? [] };
  });

export const countMyUnread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count, error } = await context.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .is("read_at", null)
      .is("cancelled_at", null);
    if (error) throw new Error(error.message);
    return { unread: count ?? 0 };
  });

export const cancelNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    // RLS: só staff pode UPDATE arbitrária. Marcamos cancelled_at + cancelled_by.
    const { error } = await context.supabase
      .from("notifications")
      .update({ cancelled_at: new Date().toISOString(), cancelled_by: context.userId } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ctaKindEnum = z.enum(["wa_me", "link", "calendar", "mission", "none"]);
const createInput = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional().nullable(),
  image_url: z.string().url().optional().nullable(),
  kind: z.enum(["info", "mission", "custom"]).default("info"),
  cta_label: z.string().max(80).optional().nullable(),
  cta_kind: ctaKindEnum.optional().nullable(),
  cta_payload: z.record(z.any()).optional().default({}),
  mission_id: z.string().uuid().optional().nullable(),
  expires_at: z.string().datetime().optional().nullable(),
  target: z.object({
    mode: z.enum(["all_staff", "role", "users"]),
    role: z.string().optional(),
    user_ids: z.array(z.string().uuid()).optional(),
  }),
});

export const createNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => createInput.parse(raw))
  .handler(async ({ data, context }) => {
    // staff-only via RLS insert policy; verify first for a nicer error
    const { data: staffRoles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["admin", "operador"] as never);
    if (!staffRoles || staffRoles.length === 0) throw new Error("Sem permissão");



    // Resolve target users
    let targetUserIds: string[] = [];
    if (data.target.mode === "users" && data.target.user_ids?.length) {
      targetUserIds = data.target.user_ids;
    } else if (data.target.mode === "role" && data.target.role) {
      const { data: rows, error } = await context.supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", data.target.role as never);
      if (error) throw new Error(error.message);
      targetUserIds = (rows ?? []).map((r) => r.user_id);
    } else {
      // all_staff => admin + moderator + agitador
      const { data: rows, error } = await context.supabase
        .from("user_roles")
        .select("user_id, role");
      if (error) throw new Error(error.message);
      targetUserIds = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    }

    if (targetUserIds.length === 0) return { ok: true, inserted: 0 };

    const { randomUUID } = await import("node:crypto");
    const batchId = randomUUID();
    const rows = targetUserIds.map((uid) => ({
      user_id: uid,
      title: data.title,
      body: data.body ?? null,
      image_url: data.image_url ?? null,
      kind: data.kind,
      cta_label: data.cta_label ?? null,
      cta_kind: data.cta_kind ?? null,
      cta_payload: data.cta_payload ?? {},
      mission_id: data.mission_id ?? null,
      expires_at: data.expires_at ?? null,
      created_by: context.userId,
      batch_id: batchId,
    }));

    const { data: inserted, error } = await context.supabase
      .from("notifications")
      .insert(rows)
      .select("id, user_id");
    if (error) throw new Error(error.message);

    // Envia web push para todos os inscritos dos usuários alvo (best-effort).
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { sendWebPush } = await import("@/lib/web-push.server");
      const { data: subs } = await supabaseAdmin
        .from("push_subscriptions")
        .select("user_id, endpoint, p256dh, auth")
        .in("user_id", targetUserIds);
      if (subs && subs.length) {
        const firstNotifByUser = new Map<string, string>();
        for (const r of inserted ?? []) if (!firstNotifByUser.has(r.user_id)) firstNotifByUser.set(r.user_id, r.id);
        await Promise.allSettled(
          subs
            .filter((s): s is typeof s & { user_id: string } => s.user_id != null)
            .map(async (s) => {
            const notifId = firstNotifByUser.get(s.user_id);
            const result = await sendWebPush(
              { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
              {
                title: data.title,
                body: data.body ?? "",
                image: data.image_url ?? undefined,
                url: "/dashboard",
                notificationId: notifId ?? null,
                tag: `pqb-${notifId ?? Date.now()}`,
              },
            );
            if (result.gone) {
              await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
            }
          }),
        );
      }
    } catch (e) {
      console.error("[push] falha ao enviar", e);
    }

    return { ok: true, inserted: rows.length };
  });

const batchListInput = z.object({
  kind: z.enum(["all", "mission", "general"]).optional().default("all"),
  status: z.enum(["all", "active", "cancelled"]).optional().default("all"),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
});

export type NotificationBatchSummary = {
  batch_key: string;
  title: string;
  kind: string;
  sent_at: string;
  recipient_count: number;
  read_count: number;
  status: "active" | "cancelled";
  mission_id: string | null;
};

export const listNotificationBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => batchListInput.parse(raw ?? {}))
  .handler(async ({ data, context }) => {
    const { data: staffRoles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["admin", "operador"] as never);
    if (!staffRoles?.length) throw new Error("Sem permissão");

    let q = context.supabase
      .from("notifications")
      .select("id, batch_id, title, kind, created_at, read_at, cancelled_at, mission_id")
      .not("kind", "in", `(${SYSTEM_AUTO_NOTIFICATION_KINDS.map((k) => `"${k}"`).join(",")})`)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (data.kind === "mission") q = q.eq("kind", "mission");
    if (data.kind === "general") q = q.neq("kind", "mission");
    if (data.date_from) q = q.gte("created_at", data.date_from);
    if (data.date_to) q = q.lte("created_at", data.date_to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const groups = new Map<
      string,
      {
        title: string;
        kind: string;
        sent_at: string;
        recipient_count: number;
        read_count: number;
        cancelled_count: number;
        mission_id: string | null;
      }
    >();

    for (const row of rows ?? []) {
      const key = row.batch_id ?? row.id;
      const cur = groups.get(key) ?? {
        title: row.title,
        kind: row.kind,
        sent_at: row.created_at,
        recipient_count: 0,
        read_count: 0,
        cancelled_count: 0,
        mission_id: row.mission_id,
      };
      cur.recipient_count++;
      if (row.read_at) cur.read_count++;
      if (row.cancelled_at) cur.cancelled_count++;
      if (row.created_at < cur.sent_at) cur.sent_at = row.created_at;
      groups.set(key, cur);
    }

    let batches: NotificationBatchSummary[] = Array.from(groups.entries()).map(([batch_key, g]) => ({
      batch_key,
      title: g.title,
      kind: g.kind,
      sent_at: g.sent_at,
      recipient_count: g.recipient_count,
      read_count: g.read_count,
      status: g.cancelled_count === g.recipient_count ? ("cancelled" as const) : ("active" as const),
      mission_id: g.mission_id,
    }));

    if (data.status === "active") batches = batches.filter((b) => b.status === "active");
    if (data.status === "cancelled") batches = batches.filter((b) => b.status === "cancelled");
    batches.sort((a, b) => b.sent_at.localeCompare(a.sent_at));

    return { batches: batches.slice(0, data.limit) };
  });

const batchKeySchema = z.object({ batch_key: z.string().uuid() });

export const getNotificationBatchDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => batchKeySchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: staffRoles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["admin", "operador"] as never);
    if (!staffRoles?.length) throw new Error("Sem permissão");

    const { data: byBatch, error: batchErr } = await context.supabase
      .from("notifications")
      .select("*")
      .eq("batch_id", data.batch_key)
      .order("created_at", { ascending: true });
    if (batchErr) throw new Error(batchErr.message);

    let rows = byBatch ?? [];
    if (!rows.length) {
      const { data: single, error: singleErr } = await context.supabase
        .from("notifications")
        .select("*")
        .eq("id", data.batch_key)
        .maybeSingle();
      if (singleErr) throw new Error(singleErr.message);
      if (single) rows = [single];
    }
    if (!rows.length) throw new Error("Envio não encontrado.");

    const sample = rows[0]!;
    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    const nameById = new Map((profs ?? []).map((p) => [p.id, p.full_name] as const));

    let mission_activity: Array<{
      user_id: string;
      name: string;
      claimed_at: string;
      task_count: number;
      completed_at: string | null;
    }> = [];

    if (sample.mission_id) {
      const { data: claims } = await context.supabase
        .from("agitation_mission_claims")
        .select("user_id, task_count, completed_at, claimed_at")
        .eq("mission_id", sample.mission_id)
        .in("user_id", userIds)
        .order("claimed_at", { ascending: true });
      mission_activity = (claims ?? []).map((c) => ({
        user_id: c.user_id,
        name: nameById.get(c.user_id) ?? c.user_id.slice(0, 8),
        claimed_at: c.claimed_at,
        task_count: c.task_count,
        completed_at: c.completed_at,
      }));
    }

    const cancelled_count = rows.filter((r) => r.cancelled_at).length;
    return {
      batch_key: data.batch_key,
      preview: {
        title: sample.title,
        body: sample.body,
        image_url: sample.image_url,
        kind: sample.kind,
        cta_label: sample.cta_label,
        cta_kind: sample.cta_kind,
        cta_payload: sample.cta_payload,
        mission_id: sample.mission_id,
        sent_at: rows[0]!.created_at,
      },
      recipient_count: rows.length,
      read_count: rows.filter((r) => r.read_at).length,
      status: cancelled_count === rows.length ? ("cancelled" as const) : ("active" as const),
      recipients: rows.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        name: nameById.get(r.user_id) ?? r.user_id.slice(0, 8),
        read_at: r.read_at,
        cancelled_at: r.cancelled_at,
      })),
      mission_activity,
    };
  });

export const cancelNotificationBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => batchKeySchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: staffRoles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["admin", "operador"] as never);
    if (!staffRoles?.length) throw new Error("Sem permissão");

    const now = new Date().toISOString();
    const { data: byBatch, error: batchErr } = await context.supabase
      .from("notifications")
      .update({ cancelled_at: now, cancelled_by: context.userId } as never)
      .eq("batch_id", data.batch_key)
      .is("cancelled_at", null)
      .select("id");
    if (batchErr) throw new Error(batchErr.message);

    let updated = byBatch?.length ?? 0;
    if (!updated) {
      const { data: single, error: singleErr } = await context.supabase
        .from("notifications")
        .update({ cancelled_at: now, cancelled_by: context.userId } as never)
        .eq("id", data.batch_key)
        .is("cancelled_at", null)
        .select("id");
      if (singleErr) throw new Error(singleErr.message);
      updated = single?.length ?? 0;
    }

    return { ok: true as const, cancelled: updated };
  });

