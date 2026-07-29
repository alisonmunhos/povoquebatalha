// Notificações automáticas do sistema (service-role) — Fase 1+.
import type { AppRole } from "@/lib/roles";
import { ROLE_LABEL } from "@/lib/roles";

type SupabaseAdmin = { from: (t: string) => any };

export const SYSTEM_AUTO_KINDS = ["user_approval", "event"] as const;

export type UserApprovalPayload = {
  pending_user_id: string;
  full_name: string;
  email: string;
  requested_role: AppRole | null;
  phone?: string | null;
};

export function renderNotificationTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

async function resolveUsersByRoles(
  supabaseAdmin: SupabaseAdmin,
  roles: string[],
): Promise<string[]> {
  if (!roles.length) return [];
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .in("role", roles);
  if (error) throw new Error(error.message);
  return Array.from(new Set((data ?? []).map((r: { user_id: string }) => r.user_id)));
}

async function sendPushToUsers(
  supabaseAdmin: SupabaseAdmin,
  userIds: string[],
  title: string,
  body: string,
  notifIdByUser: Map<string, string>,
): Promise<void> {
  if (!userIds.length) return;
  try {
    const { sendWebPush } = await import("@/lib/web-push.server");
    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("user_id, endpoint, p256dh, auth")
      .in("user_id", userIds);
    if (!subs?.length) return;
    await Promise.allSettled(
      subs
        .filter((s: { user_id: string | null }) => s.user_id != null)
        .map(async (s: { user_id: string; endpoint: string; p256dh: string; auth: string }) => {
          const notifId = notifIdByUser.get(s.user_id);
          const result = await sendWebPush(
            { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
            {
              title,
              body,
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
  } catch (e) {
    console.error("[push] falha ao enviar notificação de sistema", e);
  }
}

export async function notifyUserApprovalPending(input: {
  pendingUserId: string;
  fullName: string;
  email: string;
  requestedRole: AppRole | null;
  phone?: string | null;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: settings, error: settingsErr } = await supabaseAdmin
    .from("system_notification_settings")
    .select("recipient_roles, title_template, body_template")
    .eq("key", "user_approval")
    .maybeSingle();
  if (settingsErr) {
    console.error("[notify] settings user_approval:", settingsErr.message);
    return;
  }
  if (!settings) return;

  const recipientRoles = (settings.recipient_roles ?? ["admin"]) as string[];
  const targetUserIds = await resolveUsersByRoles(supabaseAdmin, recipientRoles);
  if (!targetUserIds.length) return;

  const roleLabel = input.requestedRole ? ROLE_LABEL[input.requestedRole] : "—";
  const vars = {
    full_name: input.fullName,
    email: input.email,
    requested_role: roleLabel,
  };
  const title = renderNotificationTemplate(settings.title_template, vars);
  const body = renderNotificationTemplate(settings.body_template, vars);

  const { randomUUID } = await import("node:crypto");
  const batchId = randomUUID();
  const ctaPayload: UserApprovalPayload = {
    pending_user_id: input.pendingUserId,
    full_name: input.fullName,
    email: input.email,
    requested_role: input.requestedRole,
    phone: input.phone ?? null,
  };

  const rows = targetUserIds.map((uid) => ({
    user_id: uid,
    title,
    body,
    kind: "user_approval",
    cta_kind: "none",
    cta_payload: ctaPayload,
    batch_id: batchId,
    created_by: null,
  }));

  const { data: inserted, error } = await supabaseAdmin
    .from("notifications")
    .insert(rows)
    .select("id, user_id");
  if (error) {
    console.error("[notify] insert user_approval:", error.message);
    return;
  }

  const notifIdByUser = new Map<string, string>();
  for (const r of inserted ?? []) {
    if (!notifIdByUser.has(r.user_id)) notifIdByUser.set(r.user_id, r.id);
  }
  await sendPushToUsers(supabaseAdmin, targetUserIds, title, body, notifIdByUser);
}

export async function notifyEventRsvpConfirmed(input: {
  eventId: string;
  eventTitle: string;
  contactId: string;
  contactName: string;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: settings, error: settingsErr } = await supabaseAdmin
    .from("system_notification_settings")
    .select("recipient_roles, title_template, body_template")
    .eq("key", "event")
    .maybeSingle();
  if (settingsErr) {
    console.error("[notify] settings event:", settingsErr.message);
    return;
  }
  if (!settings) return;

  const recipientRoles = (settings.recipient_roles ?? ["admin"]) as string[];
  const targetUserIds = await resolveUsersByRoles(supabaseAdmin, recipientRoles);
  if (!targetUserIds.length) return;

  const vars = {
    contact_name: input.contactName,
    event_title: input.eventTitle,
  };
  const title = renderNotificationTemplate(settings.title_template, vars);
  const body = renderNotificationTemplate(settings.body_template, vars);

  const { randomUUID } = await import("node:crypto");
  const batchId = randomUUID();
  const ctaPayload = {
    event_id: input.eventId,
    event_title: input.eventTitle,
    contact_id: input.contactId,
    contact_name: input.contactName,
  };

  const rows = targetUserIds.map((uid) => ({
    user_id: uid,
    title,
    body,
    kind: "event",
    cta_kind: "link",
    cta_label: "Ver eventos",
    cta_payload: { ...ctaPayload, url: "/eventos" },
    batch_id: batchId,
    created_by: null,
  }));

  const { data: notifRows, error: insertErr } = await supabaseAdmin
    .from("notifications")
    .insert(rows)
    .select("id, user_id");
  if (insertErr) {
    console.error("[notify] insert event:", insertErr.message);
    return;
  }

  const notifIdByUser = new Map<string, string>();
  for (const r of notifRows ?? []) {
    if (!notifIdByUser.has(r.user_id)) notifIdByUser.set(r.user_id, r.id);
  }
  await sendPushToUsers(supabaseAdmin, targetUserIds, title, body, notifIdByUser);
}

/** Avisa a equipe quando um evento novo é criado. */
export async function notifyEventCreated(input: {
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  isPublished: boolean;
  createdBy: string | null;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: settings, error: settingsErr } = await supabaseAdmin
    .from("system_notification_settings")
    .select("recipient_roles, title_template, body_template")
    .eq("key", "event_created")
    .maybeSingle();
  if (settingsErr) {
    console.error("[notify] settings event_created:", settingsErr.message);
    return;
  }
  if (!settings) return;

  const recipientRoles = (settings.recipient_roles ?? ["admin"]) as string[];
  const targetUserIds = await resolveUsersByRoles(supabaseAdmin, recipientRoles);
  if (!targetUserIds.length) return;

  const vars = {
    event_title: input.eventTitle,
    event_status: input.isPublished ? "publicado" : "em rascunho",
  };
  const title = renderNotificationTemplate(settings.title_template, vars);
  const body = renderNotificationTemplate(settings.body_template, vars);

  const { randomUUID } = await import("node:crypto");
  const batchId = randomUUID();

  const rows = targetUserIds.map((uid) => ({
    user_id: uid,
    title,
    body,
    kind: "event",
    cta_kind: "link",
    cta_label: "Ver eventos",
    cta_payload: {
      event_id: input.eventId,
      event_title: input.eventTitle,
      url: input.isPublished ? `/evento/${input.eventSlug}` : "/eventos",
    },
    batch_id: batchId,
    created_by: input.createdBy,
  }));

  const { data: notifRows, error: insertErr } = await supabaseAdmin
    .from("notifications")
    .insert(rows)
    .select("id, user_id");
  if (insertErr) {
    console.error("[notify] insert event_created:", insertErr.message);
    return;
  }

  const notifIdByUser = new Map<string, string>();
  for (const r of notifRows ?? []) {
    if (!notifIdByUser.has(r.user_id)) notifIdByUser.set(r.user_id, r.id);
  }
  await sendPushToUsers(supabaseAdmin, targetUserIds, title, body, notifIdByUser);
}


export async function cancelNotificationsForPendingUser(
  pendingUserId: string,
  cancelledBy: string | null,
): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();

  const { data: rows, error: findErr } = await supabaseAdmin
    .from("notifications")
    .select("id")
    .eq("kind", "user_approval")
    .is("cancelled_at", null)
    .filter("cta_payload->>pending_user_id", "eq", pendingUserId);
  if (findErr) {
    console.error("[notify] cancel find:", findErr.message);
    return 0;
  }
  const ids = (rows ?? []).map((r: { id: string }) => r.id);
  if (!ids.length) return 0;

  const { data: updated, error: upErr } = await supabaseAdmin
    .from("notifications")
    .update({ cancelled_at: now, cancelled_by: cancelledBy })
    .in("id", ids)
    .is("cancelled_at", null)
    .select("id");
  if (upErr) {
    console.error("[notify] cancel update:", upErr.message);
    return 0;
  }
  return updated?.length ?? 0;
}
