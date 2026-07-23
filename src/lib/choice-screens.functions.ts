// CRUD autenticado das telas de escolha (Fluxo 1 — hub de links para formulários/URLs).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff, requireAdmin } from "@/lib/authz";

export const listChoiceScreens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("choice_screens")
      .select("id,slug,title,subtitle,is_active,created_at,updated_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const getChoiceScreen = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context.supabase, context.userId);
    const { data: screen, error } = await context.supabase
      .from("choice_screens")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    const { data: options } = await context.supabase
      .from("choice_screen_options")
      .select("*")
      .eq("choice_screen_id", data.id)
      .order("order_index", { ascending: true });
    return { screen, options: options ?? [] };
  });

const createSchema = z.object({
  title: z.string().trim().min(2).max(160),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use apenas letras minúsculas, números e hífen."),
  subtitle: z.string().trim().max(300).nullable().optional(),
});

export const createChoiceScreen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("choice_screens")
      .insert({
        title: data.title,
        slug: data.slug,
        subtitle: data.subtitle ?? null,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(2).max(160).optional(),
  subtitle: z.string().trim().max(300).nullable().optional(),
  is_active: z.boolean().optional(),
});

export const updateChoiceScreen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { id, ...rest } = data;
    const { data: row, error } = await context.supabase
      .from("choice_screens")
      .update(rest)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteChoiceScreen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("choice_screens").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

const optionSchema = z
  .object({
    id: z.string().uuid().optional(),
    order_index: z.number().int().min(0),
    label: z.string().trim().min(1).max(120),
    description: z.string().trim().max(400).nullable().optional(),
    target_type: z.enum(["form", "url"]),
    target_form_slug: z.string().trim().max(80).nullable().optional(),
    target_url: z.string().trim().max(500).nullable().optional(),
  })
  .superRefine((opt, ctx) => {
    if (opt.target_type === "form") {
      if (!opt.target_form_slug?.trim()) {
        ctx.addIssue({ code: "custom", message: "Informe o slug do formulário destino.", path: ["target_form_slug"] });
      }
      if (opt.target_url?.trim()) {
        ctx.addIssue({ code: "custom", message: "Opção de formulário não deve ter URL.", path: ["target_url"] });
      }
    } else {
      if (!opt.target_url?.trim()) {
        ctx.addIssue({ code: "custom", message: "Informe a URL destino.", path: ["target_url"] });
      }
      if (opt.target_form_slug?.trim()) {
        ctx.addIssue({ code: "custom", message: "Opção de URL não deve ter slug de formulário.", path: ["target_form_slug"] });
      }
    }
  });

const upsertOptionsSchema = z.object({
  choice_screen_id: z.string().uuid(),
  options: z.array(optionSchema).max(20),
});

export const upsertChoiceScreenOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertOptionsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);

    const keepIds = data.options.map((o) => o.id).filter((id): id is string => Boolean(id));
    if (keepIds.length > 0) {
      await context.supabase
        .from("choice_screen_options")
        .delete()
        .eq("choice_screen_id", data.choice_screen_id)
        .not("id", "in", `(${keepIds.join(",")})`);
    } else {
      await context.supabase.from("choice_screen_options").delete().eq("choice_screen_id", data.choice_screen_id);
    }

    for (const o of data.options) {
      const row = {
        choice_screen_id: data.choice_screen_id,
        order_index: o.order_index,
        label: o.label,
        description: o.description ?? null,
        target_type: o.target_type,
        target_form_slug: o.target_type === "form" ? (o.target_form_slug?.trim() ?? null) : null,
        target_url: o.target_type === "url" ? (o.target_url?.trim() ?? null) : null,
      };
      if (o.id) {
        const { error } = await context.supabase.from("choice_screen_options").update(row).eq("id", o.id);
        if (error) throw error;
      } else {
        const { error } = await context.supabase.from("choice_screen_options").insert(row);
        if (error) throw error;
      }
    }

    return { ok: true as const };
  });
