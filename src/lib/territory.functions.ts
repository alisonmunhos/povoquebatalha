import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: { from: (t: string) => any }; userId: string };

async function getRoles(ctx: Ctx): Promise<string[]> {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  return (data ?? []).map((r: { role: string }) => r.role);
}

async function assertAdmin(ctx: Ctx) {
  const roles = await getRoles(ctx);
  if (!roles.includes("admin")) throw new Error("Apenas administradores.");
}

async function loadScopes(ctx: Ctx, userId: string) {
  const { data, error } = await ctx.supabase
    .from("user_territory_scopes")
    .select("id,uf,cidade,bairro,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export const listMyScopes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context);
    const scopes = await loadScopes(context, context.userId);
    return { roles, scopes };
  });

export const listUserScopes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    return loadScopes(context, data.userId);
  });

export const addScope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    userId: z.string().uuid(),
    uf: z.string().trim().max(2).optional().nullable(),
    cidade: z.string().trim().max(120).optional().nullable(),
    bairro: z.string().trim().max(160).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!data.uf && !data.cidade && !data.bairro) throw new Error("Informe ao menos UF, cidade ou bairro.");
    const { error } = await context.supabase.from("user_territory_scopes").insert({
      user_id: data.userId,
      uf: data.uf || null,
      cidade: data.cidade || null,
      bairro: data.bairro || null,
      created_by: context.userId,
    });
    if (error) throw error;
    return { ok: true as const };
  });

export const removeScope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("user_territory_scopes").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

/** Territory dashboard: KPIs sobre toda a base (escopo desativado). */
export const getTerritoryOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context);

    const { count: total } = await context.supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .is("arquivado_at", null);

    const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: recentInbound } = await context.supabase
      .from("inbound_messages")
      .select("contact_id")
      .gte("received_at", since30)
      .not("contact_id", "is", null);
    const engajados = new Set((recentInbound ?? []).map((r: { contact_id: string }) => r.contact_id)).size;

    const { count: optOuts } = await context.supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .not("opt_out_at", "is", null);

    const { count: pendentes } = await context.supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("lifecycle_status", "importado_aguardando_recadastro");

    return {
      roles,
      scopes: [] as Array<{ id: string; uf: string | null; cidade: string | null; bairro: string | null; created_at: string }>,
      scopeLabel: "Toda a base",
      restricted: false,
      kpis: {
        total: total ?? 0,
        engajados,
        optOuts: optOuts ?? 0,
        pendentes: pendentes ?? 0,
      },
    };
  });

export const listTerritoryContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    search: z.string().trim().max(120).optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(30),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let q = context.supabase
      .from("contacts")
      .select("id,nome,phone_e164,bairro,cidade,uf,lifecycle_status,consentimento_whatsapp,opt_out_at", { count: "exact" })
      .is("arquivado_at", null)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (data.search) {
      const term = data.search.replace(/[%_]/g, "").slice(0, 60);
      q = q.or(`nome.ilike.%${term}%,phone_e164.ilike.%${term}%,cidade.ilike.%${term}%,bairro.ilike.%${term}%`);
    }
    const { data: rows, count, error } = await q;
    if (error) throw error;
    return { rows: rows ?? [], total: count ?? 0, page: data.page, pageSize: data.pageSize, restricted: false };
  });
