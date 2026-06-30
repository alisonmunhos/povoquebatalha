import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const listSchema = z.object({
  search: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().optional(),
  origem: z.enum(["recadastro", "inscricao", "import", "manual"]).optional(),
  consentOnly: z.boolean().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});

export const listContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    let q = context.supabase
      .from("contacts")
      .select("id,nome,phone_e164,cidade,uf,origem,consentimento_whatsapp,opt_out_at,created_at", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (data.search) {
      const s = data.search.trim();
      q = q.or(`nome.ilike.%${s}%,phone_e164.ilike.%${s}%,email.ilike.%${s}%`);
    }
    if (data.cidade) q = q.eq("cidade", data.cidade);
    if (data.uf) q = q.eq("uf", data.uf);
    if (data.origem) q = q.eq("origem", data.origem);
    if (data.consentOnly) q = q.eq("consentimento_whatsapp", true).is("opt_out_at", null);
    const { data: rows, count, error } = await q;
    if (error) throw error;
    return { rows: rows ?? [], total: count ?? 0, page: data.page, pageSize: data.pageSize };
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(2).max(120),
  phone_raw: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().email().max(255).optional().nullable(),
  cidade: z.string().trim().max(120).optional().nullable(),
  uf: z.string().trim().length(2).optional().nullable(),
  cep: z.string().trim().max(12).optional().nullable(),
  endereco: z.string().trim().max(240).optional().nullable(),
  numero: z.string().trim().max(20).optional().nullable(),
  bairro: z.string().trim().max(120).optional().nullable(),
  consentimento_whatsapp: z.boolean().optional(),
  observacoes: z.string().trim().max(1000).optional().nullable(),
});

export const upsertContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const payload = { ...data, origem: "manual" as const, created_by: context.userId };
    if (data.id) {
      const { id, ...rest } = payload;
      const { data: row, error } = await context.supabase
        .from("contacts")
        .update(rest)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("contacts")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const setOptOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), optOut: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("contacts")
      .update({ opt_out_at: data.optOut ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });
