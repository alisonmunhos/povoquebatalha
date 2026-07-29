import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/authz";
import { ALL_ROLES } from "@/lib/roles";

export const SYSTEM_NOTIFICATION_KEYS = ["user_approval", "event"] as const;
export type SystemNotificationKey = (typeof SYSTEM_NOTIFICATION_KEYS)[number];

/** Kinds gerados automaticamente pelo sistema — não aparecem na Central de Notificações manual. */
export const SYSTEM_AUTO_NOTIFICATION_KINDS = [...SYSTEM_NOTIFICATION_KEYS] as const;

export const SYSTEM_NOTIFICATION_LABELS: Record<SystemNotificationKey, string> = {
  user_approval: "Aprovação de cadastro",
  event: "Confirmação de presença (evento)",
};

export const SYSTEM_NOTIFICATION_PLACEHOLDERS: Record<SystemNotificationKey, string[]> = {
  user_approval: ["{{full_name}}", "{{email}}", "{{requested_role}}"],
  event: ["{{contact_name}}", "{{event_title}}"],
};

const settingsRowSchema = z.object({
  key: z.enum(SYSTEM_NOTIFICATION_KEYS),
  recipient_roles: z.array(z.enum(ALL_ROLES)).min(1),
  title_template: z.string().trim().min(1).max(200),
  body_template: z.string().trim().min(1).max(2000),
  updated_at: z.string().optional(),
  updated_by: z.string().uuid().nullable().optional(),
});

export const listSystemNotificationSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("system_notification_settings")
      .select("key, recipient_roles, title_template, body_template, updated_at, updated_by")
      .in("key", [...SYSTEM_NOTIFICATION_KEYS])
      .order("key", { ascending: true });
    if (error) throw new Error(error.message);
    return { settings: data ?? [] };
  });

export const updateSystemNotificationSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    settingsRowSchema
      .pick({
        key: true,
        recipient_roles: true,
        title_template: true,
        body_template: true,
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("system_notification_settings")
      .update({
        recipient_roles: data.recipient_roles,
        title_template: data.title_template,
        body_template: data.body_template,
        updated_by: context.userId,
      })
      .eq("key", data.key)
      .select("key, recipient_roles, title_template, body_template, updated_at, updated_by")
      .single();
    if (error) throw new Error(error.message);
    return { setting: row };
  });
