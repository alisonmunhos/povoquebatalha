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

const fieldStatusEnum = z.enum(["nao_abordado", "contato_realizado", "nao_encontrado", "observacao"]);

export const listTerritoryContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    search: z.string().trim().max(120).optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(30),
    fieldStatus: z.array(fieldStatusEnum).optional(),
    sinceDays: z.number().int().min(1).max(365).optional(),
    sortBy: z.enum(["nao_abordado_first", "recent_action", "alphabetical"]).default("nao_abordado_first"),
    // "own" = apenas ações minhas para filtro/status; "all" = de todos (padrão)
    actionScope: z.enum(["own", "all"]).default("all"),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    // 1) Buscar logs de ações no período (usado para filtro e para juntar last action)
    const sinceIso = data.sinceDays
      ? new Date(Date.now() - data.sinceDays * 86400000).toISOString()
      : null;

    let logsQ = context.supabase
      .from("territory_contact_logs")
      .select("contact_id,action,note,created_at,user_id")
      .order("created_at", { ascending: false });
    if (sinceIso) logsQ = logsQ.gte("created_at", sinceIso);
    if (data.actionScope === "own") logsQ = logsQ.eq("user_id", context.userId);

    const { data: allLogs, error: logsErr } = await logsQ;
    if (logsErr) throw logsErr;

    // Última ação por contact_id
    const lastByContact = new Map<string, { action: string; note: string | null; created_at: string; user_id: string }>();
    for (const l of (allLogs ?? []) as Array<{ contact_id: string; action: string; note: string | null; created_at: string; user_id: string }>) {
      if (!lastByContact.has(l.contact_id)) {
        lastByContact.set(l.contact_id, { action: l.action, note: l.note, created_at: l.created_at, user_id: l.user_id });
      }
    }

    const filter = new Set(data.fieldStatus ?? []);
    const wantFilter = filter.size > 0;

    // Ids que possuem cada tipo de última-ação
    const idsWith = {
      contato_realizado: [] as string[],
      nao_encontrado: [] as string[],
      observacao: [] as string[],
      any: [] as string[],
    };
    for (const [cid, last] of lastByContact.entries()) {
      idsWith.any.push(cid);
      if (last.action === "contato_realizado") idsWith.contato_realizado.push(cid);
      else if (last.action === "nao_encontrado") idsWith.nao_encontrado.push(cid);
      else if (last.action === "observacao") idsWith.observacao.push(cid);
    }

    // 2) Buscar contatos com paginação + filtros
    let q = context.supabase
      .from("contacts")
      .select("id,nome,phone_e164,bairro,cidade,uf,lifecycle_status,consentimento_whatsapp,opt_out_at,created_at", { count: "exact" })
      .is("arquivado_at", null);

    if (data.search) {
      const term = data.search.replace(/[%_]/g, "").slice(0, 60);
      q = q.or(`nome.ilike.%${term}%,phone_e164.ilike.%${term}%,cidade.ilike.%${term}%,bairro.ilike.%${term}%`);
    }

    if (wantFilter) {
      const includeIds = new Set<string>();
      let includeNaoAbordado = false;
      for (const s of filter) {
        if (s === "nao_abordado") includeNaoAbordado = true;
        else if (s === "contato_realizado") idsWith.contato_realizado.forEach((i) => includeIds.add(i));
        else if (s === "nao_encontrado") idsWith.nao_encontrado.forEach((i) => includeIds.add(i));
        else if (s === "observacao") idsWith.observacao.forEach((i) => includeIds.add(i));
      }
      if (includeNaoAbordado && includeIds.size === 0) {
        // Só "não abordado": exclui todos que têm qualquer última-ação no período
        if (idsWith.any.length > 0) q = q.not("id", "in", `(${idsWith.any.join(",")})`);
      } else if (!includeNaoAbordado && includeIds.size > 0) {
        q = q.in("id", Array.from(includeIds));
      } else if (includeNaoAbordado && includeIds.size > 0) {
        // Não abordado OU alguma ação selecionada → união = universo - (any - includeIds)
        const exclude = idsWith.any.filter((i) => !includeIds.has(i));
        if (exclude.length > 0) q = q.not("id", "in", `(${exclude.join(",")})`);
      } else {
        // filtro vazio efetivo
      }
    }

    // Ordenação
    if (data.sortBy === "alphabetical") {
      q = q.order("nome", { ascending: true, nullsFirst: false });
    } else if (data.sortBy === "recent_action") {
      // sem meio direto no PostgREST — ordenamos por created_at desc como aproximação; refino no client
      q = q.order("created_at", { ascending: false });
    } else {
      // nao_abordado_first: aproxima ordenando por created_at desc; refino no client
      q = q.order("created_at", { ascending: false });
    }

    q = q.range(from, to);
    const { data: rows, count, error } = await q;
    if (error) throw error;

    type ContactRow = {
      id: string; nome: string | null; phone_e164: string | null;
      bairro: string | null; cidade: string | null; uf: string | null;
      lifecycle_status: string | null; consentimento_whatsapp: boolean | null;
      opt_out_at: string | null; created_at: string;
    };
    const enriched = ((rows ?? []) as ContactRow[]).map((r) => ({
      ...r,
      last_action: lastByContact.get(r.id) ?? null,
    }));

    // Reordenar client-side se necessário
    if (data.sortBy === "nao_abordado_first") {
      enriched.sort((a, b) => {
        const aHas = a.last_action ? 1 : 0;
        const bHas = b.last_action ? 1 : 0;
        return aHas - bHas;
      });
    } else if (data.sortBy === "recent_action") {
      enriched.sort((a, b) => {
        const ad = a.last_action?.created_at ?? "";
        const bd = b.last_action?.created_at ?? "";
        return bd.localeCompare(ad);
      });
    }

    return {
      rows: enriched,
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
      restricted: false,
      counts: {
        contato_realizado: idsWith.contato_realizado.length,
        nao_encontrado: idsWith.nao_encontrado.length,
        observacao: idsWith.observacao.length,
        acted: idsWith.any.length,
      },
    };
  });

/** Resumo do dia do usuário logado (fuso local do servidor UTC — considera últimas 24h). */
export const getMyFieldSummaryToday = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const { data, error } = await context.supabase
      .from("territory_contact_logs")
      .select("action,contact_id")
      .eq("user_id", context.userId)
      .gte("created_at", since.toISOString());
    if (error) throw error;
    const rows = (data ?? []) as Array<{ action: string; contact_id: string }>;
    const uniqueContacts = new Set(rows.map((r) => r.contact_id));
    const by = { whatsapp_aberto: 0, contato_realizado: 0, nao_encontrado: 0, observacao: 0, pediu_atualizacao: 0 };
    for (const r of rows) {
      if (r.action in by) (by as Record<string, number>)[r.action] += 1;
    }
    return { totalContatos: uniqueContacts.size, ...by };
  });
