import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff, requireAdmin } from "@/lib/authz";

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use apenas letras minúsculas, números e hífen.");

export const listLegalPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("legal_pages")
      .select("id,slug,title,updated_at")
      .order("title", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const getLegalPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("legal_pages")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    return row;
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(200),
  slug: slugSchema,
  content: z.string().max(50000),
});

export const upsertLegalPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const row = {
      title: data.title,
      slug: data.slug,
      content: data.content,
    };
    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from("legal_pages")
        .update(row)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw error;
      return updated;
    }
    const { data: created, error } = await context.supabase
      .from("legal_pages")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return created;
  });

export const deleteLegalPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("legal_pages").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });
