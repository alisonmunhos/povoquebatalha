import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { unread: count ?? 0 };
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
    }));

    const { error } = await context.supabase.from("notifications").insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true, inserted: rows.length };
  });
