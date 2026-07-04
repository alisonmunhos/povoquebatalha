// Timeline unificada de ações/observações do contato.
// Junta territory_contact_logs + agitacao_contact_logs numa linha do tempo só,
// preservando as tabelas de origem (RLS de cada uma continua valendo).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LogSource = "territorio" | "agitacao";

export type ContactLogRow = {
  id: string;
  source: LogSource;
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

export const listContactLogsUnified = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      contactId: z.string().uuid(),
      limit: z.number().int().min(1).max(400).default(200),
      includeHidden: z.boolean().default(false),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const cols = "id,action,note,created_at,user_id,follow_up_status,follow_up_at,follow_up_by,hidden_at,hidden_by";
    let tq = context.supabase
      .from("territory_contact_logs")
      .select(cols)
      .eq("contact_id", data.contactId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (!data.includeHidden) tq = tq.is("hidden_at", null);

    let aq = context.supabase
      .from("agitacao_contact_logs")
      .select(cols)
      .eq("contact_id", data.contactId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (!data.includeHidden) aq = aq.is("hidden_at", null);

    const [tRes, aRes] = await Promise.all([tq, aq]);
    if (tRes.error) throw tRes.error;
    if (aRes.error) throw aRes.error;

    type Raw = {
      id: string; action: string; note: string | null; created_at: string; user_id: string;
      follow_up_status: "pendente" | "concluido" | null;
      follow_up_at: string | null; follow_up_by: string | null;
      hidden_at: string | null; hidden_by: string | null;
    };
    const tRows = (tRes.data ?? []) as Raw[];
    const aRows = (aRes.data ?? []) as Raw[];

    const merged: ContactLogRow[] = [
      ...tRows.map((r) => ({ ...r, source: "territorio" as const, author_name: null })),
      ...aRows.map((r) => ({ ...r, source: "agitacao" as const, author_name: null })),
    ].sort((x, y) => (x.created_at < y.created_at ? 1 : -1)).slice(0, data.limit);

    const userIds = Array.from(new Set(merged.map((l) => l.user_id).filter(Boolean)));
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
    for (const r of merged) r.author_name = nameById.get(r.user_id) ?? null;

    const pendingCount = merged.filter((l) => l.follow_up_status === "pendente" && !l.hidden_at).length;
    return { rows: merged, pendingCount };
  });

const sourceEnum = z.enum(["territorio", "agitacao"]);
function tableFor(source: LogSource) {
  return source === "territorio" ? "territory_contact_logs" as const : "agitacao_contact_logs" as const;
}

export const setContactLogFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      source: sourceEnum,
      logId: z.string().uuid(),
      status: z.enum(["pendente", "concluido"]).nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error, count } = await context.supabase
      .from(tableFor(data.source))
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

export const setContactLogHidden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      source: sourceEnum,
      logId: z.string().uuid(),
      hidden: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error, count } = await context.supabase
      .from(tableFor(data.source))
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
