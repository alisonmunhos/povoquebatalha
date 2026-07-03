import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const actionEnum = z.enum([
  "whatsapp_aberto",
  "contato_realizado",
  "nao_encontrado",
  "pediu_atualizacao",
  "observacao",
]);

export const logTerritoryAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        contactId: z.string().uuid(),
        action: actionEnum,
        note: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("territory_contact_logs").insert({
      user_id: context.userId,
      contact_id: data.contactId,
      action: data.action,
      note: data.note ?? null,
    });
    if (error) throw error;
    return { ok: true as const };
  });

export const listContactTerritoryLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ contactId: z.string().uuid(), limit: z.number().int().min(1).max(100).default(30) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("territory_contact_logs")
      .select("id,action,note,created_at,user_id")
      .eq("contact_id", data.contactId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw error;
    return { rows: rows ?? [] };
  });

export const undoLastTerritoryLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ contactId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Busca o log mais recente do usuário para esse contato (últimos 5 min)
    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: rows, error: selErr } = await context.supabase
      .from("territory_contact_logs")
      .select("id, action, created_at")
      .eq("contact_id", data.contactId)
      .eq("user_id", context.userId)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1);
    if (selErr) throw selErr;
    const last = rows?.[0];
    if (!last) return { ok: false as const, reason: "sem_log_recente" };
    const { error: delErr } = await context.supabase
      .from("territory_contact_logs")
      .delete()
      .eq("id", last.id);
    if (delErr) throw delErr;
    return { ok: true as const, action: last.action };
  });
