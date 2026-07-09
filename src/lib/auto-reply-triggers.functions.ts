// CRUD autenticado das frases-gatilho de resposta automática (aba "Entrada de
// Dados" → "Respostas automáticas"). O consumo real (match + envio) roda no
// webhook público (src/routes/api/public/zapi/$evento.ts), via supabaseAdmin —
// não passa por estas server functions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff, requireAdmin } from "@/lib/authz";

export const listAutoReplyTriggers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("auto_reply_triggers")
      .select("id,phrase,response_text,is_active,created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

const createSchema = z.object({
  phrase: z.string().trim().min(2).max(200),
  response_text: z.string().trim().min(1).max(2000),
});

export const createAutoReplyTrigger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("auto_reply_triggers")
      .insert({ ...data, created_by: context.userId })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  phrase: z.string().trim().min(2).max(200).optional(),
  response_text: z.string().trim().min(1).max(2000).optional(),
  is_active: z.boolean().optional(),
});

export const updateAutoReplyTrigger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { id, ...rest } = data;
    const { data: row, error } = await context.supabase
      .from("auto_reply_triggers")
      .update({ ...rest, updated_by: context.userId })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteAutoReplyTrigger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("auto_reply_triggers").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });
