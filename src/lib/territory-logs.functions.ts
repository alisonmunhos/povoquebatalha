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
      // Observação e "pediu atualização" já nascem pendentes (follow-up)
      follow_up_status:
        data.action === "observacao" || data.action === "pediu_atualizacao" ? "pendente" : null,
    });
    if (error) throw error;
    return { ok: true as const };
  });

export type ContactTerritoryLogRow = {
  id: string;
  action: string;
  note: string | null;
  created_at: string;
  user_id: string;
  author_name: string | null;
  follow_up_status: "pendente" | "concluido" | null;
  follow_up_at: string | null;
  follow_up_by: string | null;
  hidden_at: string | null;
  hidden_by: string | null;
};

export const listContactTerritoryLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        contactId: z.string().uuid(),
        limit: z.number().int().min(1).max(200).default(100),
        includeHidden: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("territory_contact_logs")
      .select(
        "id,action,note,created_at,user_id,follow_up_status,follow_up_at,follow_up_by,hidden_at,hidden_by",
      )
      .eq("contact_id", data.contactId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (!data.includeHidden) q = q.is("hidden_at", null);
    const { data: rows, error } = await q;
    if (error) throw error;

    const logs =
      (rows ?? []) as Array<{
        id: string;
        action: string;
        note: string | null;
        created_at: string;
        user_id: string;
        follow_up_status: "pendente" | "concluido" | null;
        follow_up_at: string | null;
        follow_up_by: string | null;
        hidden_at: string | null;
        hidden_by: string | null;
      }>;

    // Buscar nomes dos autores em uma consulta
    const userIds = Array.from(new Set(logs.map((l) => l.user_id).filter(Boolean)));
    const nameById = new Map<string, string | null>();
    if (userIds.length > 0) {
      const { data: profiles } = await context.supabase
        .from("profiles")
        .select("id,full_name")
        .in("id", userIds);
      for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null }>) {
        nameById.set(p.id, p.full_name);
      }
    }

    const enriched: ContactTerritoryLogRow[] = logs.map((l) => ({
      ...l,
      author_name: nameById.get(l.user_id) ?? null,
    }));

    const pendingCount = enriched.filter(
      (l) => l.follow_up_status === "pendente" && !l.hidden_at,
    ).length;

    return { rows: enriched, pendingCount };
  });

export const setTerritoryLogFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        logId: z.string().uuid(),
        status: z.enum(["pendente", "concluido"]).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error, count } = await context.supabase
      .from("territory_contact_logs")
      .update(
        {
          follow_up_status: data.status,
          follow_up_at: data.status ? new Date().toISOString() : null,
          follow_up_by: data.status ? context.userId : null,
        },
        { count: "exact" },
      )
      .eq("id", data.logId);
    if (error) throw error;
    return { ok: (count ?? 0) > 0, updated: count ?? 0 };
  });

export const setTerritoryLogHidden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ logId: z.string().uuid(), hidden: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error, count } = await context.supabase
      .from("territory_contact_logs")
      .update(
        {
          hidden_at: data.hidden ? new Date().toISOString() : null,
          hidden_by: data.hidden ? context.userId : null,
        },
        { count: "exact" },
      )
      .eq("id", data.logId);
    if (error) throw error;
    return { ok: (count ?? 0) > 0, updated: count ?? 0 };
  });

export const undoLastTerritoryLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ contactId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
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

export const resetTerritoryContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ contactId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error, count } = await context.supabase
      .from("territory_contact_logs")
      .delete({ count: "exact" })
      .eq("contact_id", data.contactId);
    if (error) throw error;
    return { ok: true as const, deleted: count ?? 0 };
  });
