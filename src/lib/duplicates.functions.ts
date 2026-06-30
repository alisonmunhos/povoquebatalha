import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
      const s = data.search.trim();
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
