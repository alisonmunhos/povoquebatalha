import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/authz";
import type { Database } from "@/integrations/supabase/types";

type ContactRow = Database["public"]["Tables"]["contacts"]["Row"];


export const listImportedContactsTokens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ search: z.string().optional(), limit: z.number().int().min(1).max(200).default(50) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("contacts")
      .select("id,nome,phone_e164,recad_token,lifecycle_status")
      .eq("origem", "import")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.search) {
      const s = data.search.trim().replace(/[%_,()]/g, " ");
      q = q.or(`nome.ilike.%${s}%,phone_e164.ilike.%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return { rows: rows ?? [] };
  });

/** Quantidade de pares de duplicidade ainda pendentes de revisão. */
export const countPendingDuplicates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count, error } = await context.supabase
      .from("contact_duplicates")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendente");
    if (error) throw error;
    return { pendentes: count ?? 0 };
  });

export const listPendingDuplicates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("contact_duplicates")
      .select("id,contact_a,contact_b,match_type,reason,score,created_at,status")
      .eq("status", "pendente")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    const ids = Array.from(new Set((data ?? []).flatMap((d) => [d.contact_a, d.contact_b])));
    const { data: contacts } = ids.length
      ? await context.supabase.from("contacts").select("id,nome,phone_e164,email,origem,created_at").in("id", ids)
      : { data: [] as Array<{ id: string; nome: string; phone_e164: string | null; email: string | null; origem: string; created_at: string }> };
    const map = new Map((contacts ?? []).map((c) => [c.id, c]));
    return { rows: (data ?? []).map((d) => ({ ...d, a: map.get(d.contact_a) ?? null, b: map.get(d.contact_b) ?? null })) };
  });

export const resolveDuplicate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["ignorar", "separados", "nao_duplicado", "postergar"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // "postergar" só tira o par da fila do dia — continua pendente para revisão futura.
    const status = data.action === "postergar" ? "ignorar" : data.action === "nao_duplicado" ? "separados" : data.action;
    const { error } = await context.supabase
      .from("contact_duplicates")
      .update({ status, resolved_at: new Date().toISOString(), resolved_by: context.userId })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });


// Detalhes de um par para mesclagem
export const getDuplicatePair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: dup, error } = await context.supabase
      .from("contact_duplicates")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    const { data: contacts } = await context.supabase
      .from("contacts")
      .select("*")
      .in("id", [dup.contact_a, dup.contact_b]);
    const a = contacts?.find((c) => c.id === dup.contact_a) ?? null;
    const b = contacts?.find((c) => c.id === dup.contact_b) ?? null;
    return { dup, a, b };
  });

// Mesclagem real: usa supabaseAdmin para chamar merge_contacts(SECURITY DEFINER)
const mergeSchema = z.object({
  duplicate_id: z.string().uuid().optional(),
  survivor_id: z.string().uuid(),
  merged_id: z.string().uuid(),
  field_overrides: z.record(z.string(), z.union([z.string(), z.boolean(), z.null()])).default({}),
  motivo: z.string().max(240).optional(),
  confianca: z.enum(["forte", "provavel", "possivel"]).default("provavel"),
});

export const mergeContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => mergeSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Permissão: somente admin
    await requireAdmin(context.supabase, context.userId, "Apenas administradores podem mesclar contatos.");



    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const overridesNorm: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(data.field_overrides)) {
      if (v === null || v === undefined) continue;
      overridesNorm[k] = typeof v === "boolean" ? (v ? "true" : "false") : v;
    }
    const { data: res, error } = await supabaseAdmin.rpc("merge_contacts", {
      p_survivor: data.survivor_id,
      p_merged: data.merged_id,
      p_field_overrides: overridesNorm as never,
      p_motivo: data.motivo ?? undefined,
      p_confianca: data.confianca,
    });
    if (error) throw error;
    if (data.duplicate_id) {
      await context.supabase
        .from("contact_duplicates")
        .update({ status: "mesclado", resolved_at: new Date().toISOString(), resolved_by: context.userId })
        .eq("id", data.duplicate_id);
    }
    return { ok: true as const, merge_id: res as string };
  });

// ---------------------------------------------------------------------------
// Mesclagem a partir de uma seleção (Gestão da Base) e agrupamento por pessoa
// ---------------------------------------------------------------------------

/** Carrega os contatos selecionados com todos os campos, para o modal de mesclagem. */
export const getMergeCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()).min(2).max(10) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.from("contacts").select("*").in("id", data.ids);
    if (error) throw error;
    const { data: profs } = await context.supabase
      .from("profiles")
      .select("id,contact_id,full_name")
      .in("contact_id", data.ids);
    return { rows: rows ?? [], profiles: profs ?? [] };
  });

/** Mescla vários contatos num sobrevivente só, em sequência. */
export const mergeContactsBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        survivor_id: z.string().uuid(),
        merged_ids: z.array(z.string().uuid()).min(1).max(9),
        field_overrides: z.record(z.string(), z.union([z.string(), z.boolean(), z.null()])).default({}),
        motivo: z.string().max(240).optional(),
        confianca: z.enum(["forte", "provavel", "possivel"]).default("provavel"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId, "Apenas administradores podem mesclar contatos.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const overridesNorm: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(data.field_overrides)) {
      if (v === null || v === undefined) continue;
      overridesNorm[k] = typeof v === "boolean" ? (v ? "true" : "false") : v;
    }

    const merged: string[] = [];
    const falhas: Array<{ id: string; erro: string }> = [];
    let first = true;
    for (const id of data.merged_ids) {
      if (id === data.survivor_id) continue;
      const { error } = await supabaseAdmin.rpc("merge_contacts", {
        p_survivor: data.survivor_id,
        p_merged: id,
        // Overrides de campo valem só para a primeira mesclagem (foi ali que o
        // operador comparou os valores); as demais herdam campos vazios sozinhas.
        p_field_overrides: (first ? overridesNorm : {}) as never,
        p_motivo: data.motivo ?? undefined,
        p_confianca: data.confianca,
      });
      first = false;
      if (error) falhas.push({ id, erro: error.message });
      else merged.push(id);
    }
    return { ok: falhas.length === 0, merged, falhas };
  });

type DupPairRow = {
  id: string;
  contact_a: string;
  contact_b: string;
  match_type: string;
  reason: string | null;
  score: number | null;
  created_at: string;
  status?: string;
  snoozed_until?: string | null;
  resolved_at?: string | null;
};

export type DuplicateView = "revisar" | "adiados" | "decididos";

/** Duplicidades agrupadas por pessoa (componentes conectados), por aba. */
export const listDuplicateGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ view: z.enum(["revisar", "adiados", "decididos"]).default("revisar") }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const nowIso = new Date().toISOString();
    let query = context.supabase
      .from("contact_duplicates")
      .select("id,contact_a,contact_b,match_type,reason,score,created_at,status,snoozed_until,resolved_at");

    if (data.view === "revisar") {
      query = query.eq("status", "pendente").or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`);
    } else if (data.view === "adiados") {
      query = query.eq("status", "pendente").gt("snoozed_until", nowIso);
    } else {
      query = query.in("status", ["separados", "ignorado", "mesclado"]);
    }

    const { data: pairs, error } = await query
      .order("created_at", { ascending: false })
      .limit(data.view === "decididos" ? 200 : 500);
    if (error) throw error;
    const rows = (pairs ?? []) as DupPairRow[];

    // União-busca simples para juntar A-B, B-C num grupo só
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      let r = x;
      while (parent.get(r) && parent.get(r) !== r) r = parent.get(r)!;
      parent.set(x, r);
      return r;
    };
    const union = (a: string, b: string) => {
      parent.set(find(a), find(b));
    };
    for (const p of rows) {
      if (!parent.has(p.contact_a)) parent.set(p.contact_a, p.contact_a);
      if (!parent.has(p.contact_b)) parent.set(p.contact_b, p.contact_b);
      union(p.contact_a, p.contact_b);
    }

    const ids = [...parent.keys()];
    const { data: contacts } = ids.length
      ? await context.supabase.from("contacts").select("*").in("id", ids)
      : { data: [] as ContactRow[] };
    const byId = new Map((contacts ?? []).map((c) => [c.id, c] as const));

    const groups = new Map<
      string,
      {
        key: string;
        contacts: ContactRow[];
        pairs: DupPairRow[];
        match_type: string;
        snoozed_until: string | null;
        status: string;
      }
    >();
    for (const p of rows) {
      const key = find(p.contact_a);
      const g =
        groups.get(key) ??
        { key, contacts: [], pairs: [], match_type: "possivel", snoozed_until: null, status: p.status ?? "pendente" };
      for (const cid of [p.contact_a, p.contact_b]) {
        const c = byId.get(cid);
        if (c && !g.contacts.some((x) => x.id === cid)) g.contacts.push(c);
      }
      g.pairs.push(p);
      if (p.snoozed_until && (!g.snoozed_until || p.snoozed_until > g.snoozed_until)) g.snoozed_until = p.snoozed_until;
      const rank: Record<string, number> = { possivel: 0, provavel: 1, forte: 2 };
      if ((rank[p.match_type] ?? 0) > (rank[g.match_type] ?? 0)) g.match_type = p.match_type;
      groups.set(key, g);
    }

    return {
      groups: [...groups.values()]
        .filter((g) => g.contacts.length >= 2)
        .sort((a, b) => {
          const rank: Record<string, number> = { possivel: 0, provavel: 1, forte: 2 };
          return (rank[b.match_type] ?? 0) - (rank[a.match_type] ?? 0);
        }),
    };
  });

/** Contagens das abas (para revisar, adiados, já decididos). */
export const countDuplicateQueues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const nowIso = new Date().toISOString();
    const [revisar, adiados, decididos] = await Promise.all([
      context.supabase
        .from("contact_duplicates")
        .select("id", { count: "exact", head: true })
        .eq("status", "pendente")
        .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`),
      context.supabase
        .from("contact_duplicates")
        .select("id", { count: "exact", head: true })
        .eq("status", "pendente")
        .gt("snoozed_until", nowIso),
      context.supabase
        .from("contact_duplicates")
        .select("id", { count: "exact", head: true })
        .in("status", ["separados", "ignorado", "mesclado"]),
    ]);
    return {
      revisar: revisar.count ?? 0,
      adiados: adiados.count ?? 0,
      decididos: decididos.count ?? 0,
    };
  });

/** Aplica uma decisão a todos os pares de um grupo. */
export const resolveDuplicateGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        pair_ids: z.array(z.string().uuid()).min(1),
        action: z.enum(["separados", "arquivar", "adiar", "reabrir"]),
        dias: z.number().int().min(1).max(365).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId, "Apenas administradores podem decidir sobre contatos repetidos.");

    const nowIso = new Date().toISOString();
    let patch: Database["public"]["Tables"]["contact_duplicates"]["Update"];
    if (data.action === "adiar") {
      const dias = data.dias ?? 7;
      patch = {
        status: "pendente",
        snoozed_until: new Date(Date.now() + dias * 86400000).toISOString(),
        resolved_at: null,
        resolved_by: context.userId,
      };
    } else if (data.action === "reabrir") {
      patch = { status: "pendente", snoozed_until: null, resolved_at: null, resolved_by: context.userId };
    } else {
      patch = {
        status: data.action === "arquivar" ? "ignorado" : "separados",
        snoozed_until: null,
        resolved_at: nowIso,
        resolved_by: context.userId,
      };
    }

    const { data: updated, error } = await context.supabase
      .from("contact_duplicates")
      .update(patch)
      .in("id", data.pair_ids)
      .select("id");
    if (error) throw error;
    const afetados = updated?.length ?? 0;
    if (afetados === 0) {
      throw new Error("Nada foi alterado — você pode não ter permissão para decidir sobre contatos repetidos.");
    }
    return { ok: true as const, afetados };
  });


/** Revarre a base procurando duplicidades ainda não registradas (em blocos). */
export const rescanDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(400).default(300) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId, "Apenas administradores podem revarrer a base.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ids, error } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .is("arquivado_at", null)
      .order("id")
      .range(data.offset, data.offset + data.limit - 1);
    if (error) throw error;
    const list = (ids ?? []).map((r) => r.id as string);
    let novos = 0;
    for (let i = 0; i < list.length; i += 20) {
      const slice = list.slice(i, i + 20);
      const results = await Promise.all(
        slice.map((id) => supabaseAdmin.rpc("detect_contact_duplicates_for", { _id: id })),
      );
      for (const r of results) novos += (r.data as number | null) ?? 0;
    }
    return { novos, processados: list.length, done: list.length < data.limit };
  });

// ---------------------------------------------------------------------------
// Exclusão de cadastros repetidos direto na tela de duplicidades
// ---------------------------------------------------------------------------

/**
 * Exclui (ou arquiva) cadastros de um grupo de repetidos.
 * Sempre mantém pelo menos um cadastro do grupo e nunca remove usuários do sistema.
 * Ao excluir de vez, os pares em contact_duplicates caem por ON DELETE CASCADE;
 * quando sobra só um cadastro, o grupo some sozinho da fila.
 */
export const deleteDuplicateContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        group_ids: z.array(z.string().uuid()).min(2).max(50),
        delete_ids: z.array(z.string().uuid()).min(1).max(50),
        mode: z.enum(["hard", "arquivar"]).default("hard"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId, "Apenas administradores podem excluir contatos.");

    const deleteIds = Array.from(new Set(data.delete_ids));
    // Também é permitido retirar todos os cadastros do bloco (o bloco some da fila).
    const remaining = data.group_ids.filter((id) => !deleteIds.includes(id));


    const { data: alvos, error: getErr } = await context.supabase
      .from("contacts")
      .select("*")
      .in("id", deleteIds);
    if (getErr) throw getErr;
    const rows = alvos ?? [];
    if (rows.length === 0) throw new Error("Os cadastros selecionados não foram encontrados.");

    const sistema = rows.filter((c) => c.is_system_user);
    if (sistema.length > 0) {
      throw new Error(
        `Não é possível excluir por aqui: ${sistema
          .map((c) => c.nome)
          .join(", ")} tem acesso ao sistema. Use "Unificar cadastros".`,
      );
    }

    const ids = rows.map((c) => c.id);

    if (data.mode === "arquivar") {
      const { error } = await context.supabase
        .from("contacts")
        .update({ arquivado_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
      await context.supabase.from("contact_audit_log").insert(
        ids.map((id) => ({ contact_id: id, user_id: context.userId, action: "archive" })),
      );
    } else {
      for (const c of rows) {
        try {
          await context.supabase.from("access_audit_log").insert({
            actor_id: context.userId,
            target_user_id: null,
            event: "contact_hard_delete",
            meta: {
              contact_id: c.id,
              nome: c.nome,
              phone_e164: c.phone_e164,
              email: c.email,
              cidade: c.cidade,
              uf: c.uf,
              origem: c.origem,
              motivo: "duplicidade",
              deleted_at: new Date().toISOString(),
            } as never,
          });
        } catch {
          /* auditoria não bloqueia */
        }
      }
      const { error } = await context.supabase.from("contacts").delete().in("id", ids);
      if (error) throw error;
    }

    // Resolve os pares que envolvem os cadastros retirados. No modo "hard" o
    // cascade já apagou, então isso cobre principalmente o modo "arquivar".
    const orFilter = ids.map((id) => `contact_a.eq.${id},contact_b.eq.${id}`).join(",");
    await context.supabase
      .from("contact_duplicates")
      .update({
        status: "separados",
        snoozed_until: null,
        resolved_at: new Date().toISOString(),
        resolved_by: context.userId,
      })
      .eq("status", "pendente")
      .or(orFilter);

    // Se sobrou um só, encerra o que restar do grupo.
    if (remaining.length === 1) {
      const soId = remaining[0];
      await context.supabase
        .from("contact_duplicates")
        .update({
          status: "separados",
          snoozed_until: null,
          resolved_at: new Date().toISOString(),
          resolved_by: context.userId,
        })
        .eq("status", "pendente")
        .or(`contact_a.eq.${soId},contact_b.eq.${soId}`);
    }

    return { ok: true as const, removidos: ids.length, restantes: remaining.length, mode: data.mode };
  });
