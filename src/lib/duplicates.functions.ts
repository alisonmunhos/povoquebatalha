import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/authz";


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
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), action: z.enum(["ignorar", "separados"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("contact_duplicates")
      .update({ status: data.action, resolved_at: new Date().toISOString(), resolved_by: context.userId })
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
