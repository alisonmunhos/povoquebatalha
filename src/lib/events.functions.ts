import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff } from "@/lib/authz";
import { slugifyEventTitle } from "@/lib/event-slug";

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use apenas letras minúsculas, números e hífen.");

const eventInputSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(200),
  slug: slugSchema,
  description: z.string().trim().max(5000).nullable().optional(),
  location: z.string().trim().max(500).nullable().optional(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime().nullable().optional(),
  is_published: z.boolean().optional(),
  cover_path: z.string().max(500).nullable().optional(),
  cover_mime: z.string().max(120).nullable().optional(),
  post_rsvp_title: z.string().trim().max(200).nullable().optional(),
  post_rsvp_button_text: z.string().trim().max(80).nullable().optional(),
  post_rsvp_button_url: z.string().trim().max(500).nullable().optional(),
  linked_form_definition_id: z.string().uuid().nullable().optional(),
  linked_form_start_section_id: z.string().uuid().nullable().optional(),
});



export const listEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("events")
      .select("id,title,slug,starts_at,ends_at,is_published,location,created_at,updated_at")
      .order("starts_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { events: data ?? [] };
  });

export const listPublishedEventsForPicker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("events")
      .select("id,title,slug,starts_at,is_published")
      .eq("is_published", true)
      .order("starts_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { events: data ?? [] };
  });

export const getEvent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await requireStaff(context.supabase, context.userId);
    const { data: row, error } = await context.supabase.from("events").select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);

    const { count: confirmed } = await context.supabase
      .from("event_rsvps")
      .select("id", { count: "exact", head: true })
      .eq("event_id", data.id)
      .eq("status", "confirmed");
    const { count: declined } = await context.supabase
      .from("event_rsvps")
      .select("id", { count: "exact", head: true })
      .eq("event_id", data.id)
      .eq("status", "declined");

    return {
      event: row,
      stats: { confirmed: confirmed ?? 0, declined: declined ?? 0 },
    };
  });

export const suggestEventSlug = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ title: z.string().trim().min(2) }).parse(raw))
  .handler(async ({ data, context }) => {
    await requireStaff(context.supabase, context.userId);
    const base = slugifyEventTitle(data.title);
    if (!base) return { slug: "evento" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let slug = base;
    let n = 2;
    while (true) {
      const { data: existing } = await supabaseAdmin.from("events").select("id").eq("slug", slug).maybeSingle();
      if (!existing) break;
      slug = `${base}-${n}`;
      n++;
    }
    return { slug };
  });

export const upsertEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => eventInputSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await requireStaff(context.supabase, context.userId);
    const row = {
      title: data.title,
      slug: data.slug,
      description: data.description ?? null,
      location: data.location ?? null,
      starts_at: data.starts_at,
      ends_at: data.ends_at ?? null,
      is_published: data.is_published ?? false,
      cover_path: data.cover_path ?? null,
      cover_mime: data.cover_mime ?? null,
      post_rsvp_title: data.post_rsvp_title || null,
      post_rsvp_button_text: data.post_rsvp_button_text || null,
      post_rsvp_button_url: data.post_rsvp_button_url || null,
    };

    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from("events")
        .update(row)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { event: updated };
    }

    const { data: created, error } = await context.supabase
      .from("events")
      .insert({ ...row, created_by: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Aviso pra equipe — não bloqueia o salvamento se falhar.
    try {
      const { notifyEventCreated } = await import("@/lib/system-notifications.server");
      await notifyEventCreated({
        eventId: created.id,
        eventTitle: created.title,
        eventSlug: created.slug,
        isPublished: created.is_published,
        createdBy: context.userId,
      });
    } catch (e) {
      console.error("[events] notifyEventCreated:", e);
    }

    return { event: created };
  });

// ===== Capa do evento (reaproveita o bucket de mídia) =====
export const signEventCoverUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        filename: z.string().trim().min(1).max(200),
        contentType: z.string().trim().min(1).max(120),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    await requireStaff(context.supabase, context.userId);
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowed.includes(data.contentType)) throw new Error("Tipo não permitido. Use PNG, JPG ou WEBP.");
    const clean = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    const path = `eventos/${Date.now()}_${clean}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("campaign-media")
      .createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { path, signedUrl: signed.signedUrl, contentType: data.contentType, filename: clean };
  });

export const getEventCoverUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ path: z.string().min(1).max(500) }).parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("campaign-media")
      .createSignedUrl(data.path, 60 * 60);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

// ===== Lista de quem confirmou presença =====
export const listEventRsvps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        event_id: z.string().uuid(),
        status: z.enum(["confirmed", "declined", "all"]).default("confirmed"),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    await requireStaff(context.supabase, context.userId);
    let q = context.supabase
      .from("event_rsvps")
      .select(
        "id,status,created_at,updated_at,contacts!event_rsvps_contact_id_fkey(id,nome,nome_social,phone_e164,phone_raw,email,cidade,bairro)",
      )
      .eq("event_id", data.event_id)
      .order("updated_at", { ascending: false });
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rsvps: rows ?? [] };
  });


export const deleteEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await requireStaff(context.supabase, context.userId);
    const { error } = await context.supabase.from("events").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
