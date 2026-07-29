import { z } from "zod";
import { getRequestIp, honeypotSchema, isHoneypotTripped, isRateLimited } from "@/lib/public-form-guards.server";
import { notifyEventRsvpConfirmed } from "@/lib/system-notifications.server";

const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

export function eventsCorsOptionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

async function resolvePublicContact(input: {
  token?: string;
  nome?: string;
  phone?: string;
}): Promise<{ id: string; nome: string; recad_token: string | null } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (input.token?.trim()) {
    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("id,nome,recad_token")
      .eq("recad_token", input.token.trim())
      .maybeSingle();
    if (contact) return { id: contact.id, nome: contact.nome, recad_token: contact.recad_token };
    return null;
  }

  const nome = input.nome?.trim();
  const phone = input.phone?.trim();
  if (!nome || nome.length < 2 || !phone || phone.length < 8) return null;

  const { data: norm } = await supabaseAdmin.rpc("normalize_phone_br", { input: phone });
  const phoneE164 = norm as string | null;
  if (!phoneE164) return null;

  const { data: existing } = await supabaseAdmin
    .from("contacts")
    .select("id,nome,recad_token")
    .eq("phone_e164", phoneE164)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from("contacts")
      .update({ nome, phone_raw: phone, consentimento_whatsapp: true, consentimento_at: new Date().toISOString() })
      .eq("id", existing.id);
    return { id: existing.id, nome: existing.nome ?? nome, recad_token: existing.recad_token };
  }

  const { data: created, error } = await supabaseAdmin
    .from("contacts")
    .insert({
      nome,
      phone_raw: phone,
      phone_e164: phoneE164,
      consentimento_whatsapp: true,
      consentimento_at: new Date().toISOString(),
      origem: "inscricao",
      origem_detalhe: "evento_publico",
    })
    .select("id,nome,recad_token")
    .single();
  if (error || !created) return null;
  return { id: created.id, nome: created.nome, recad_token: created.recad_token };
}

/**
 * Confirma presença de um contato já salvo. Fonte única usada tanto pelo
 * envio de seção do formulário vinculado quanto pelo endpoint de RSVP.
 */
export async function confirmEventRsvpForContact(input: {
  eventSlug: string;
  contactId: string;
  /** `declined` = registrou que não poderá ir; padrão é confirmação. */
  status?: "confirmed" | "declined";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const status = input.status ?? "confirmed";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: event } = await supabaseAdmin
    .from("events")
    .select("id,title,slug,is_published")
    .eq("slug", input.eventSlug)
    .maybeSingle();
  if (!event || !event.is_published) return { ok: false, error: "Evento não encontrado." };

  const { data: prev } = await supabaseAdmin
    .from("event_rsvps")
    .select("status")
    .eq("event_id", event.id)
    .eq("contact_id", input.contactId)
    .maybeSingle();

  const { error: upsertErr } = await supabaseAdmin
    .from("event_rsvps")
    .upsert({ event_id: event.id, contact_id: input.contactId, status }, { onConflict: "event_id,contact_id" });
  if (upsertErr) return { ok: false, error: upsertErr.message };

  // Rastro de origem: registra que a pessoa veio por este evento.
  try {
    await supabaseAdmin.rpc("apply_contact_source", {
      _source_user_id: null,
      _source_form_type: null,
      _source_link_id: null,
      _contact_id: input.contactId,
      _source_module: "formulario_publico",
      _event_type: "inscricao_simples",
      _metadata: {
        via: "evento_rsvp",
        rsvp_status: status,
        event_id: event.id,
        event_slug: event.slug,
        event_title: event.title,
        tracking_label: `Evento: ${event.title}`,
        capture_channel: "formulario_publico",
      },
    } as never);
  } catch {
    /* rastro é complementar, não bloqueia a confirmação */
  }

  if (status === "confirmed" && prev?.status !== "confirmed") {
    try {
      const { data: contact } = await supabaseAdmin
        .from("contacts")
        .select("nome")
        .eq("id", input.contactId)
        .maybeSingle();
      await notifyEventRsvpConfirmed({
        eventId: event.id,
        eventTitle: event.title,
        contactId: input.contactId,
        contactName: contact?.nome ?? "Contato",
      });
    } catch {
      /* non-blocking */
    }
  }

  return { ok: true };
}

export async function handlePublicGetEvent(request: Request, slug: string): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("t")?.trim() || undefined;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: event, error } = await supabaseAdmin
    .from("events")
    .select("id,title,slug,description,location,starts_at,ends_at,is_published,cover_path,post_rsvp_title,post_rsvp_body,post_rsvp_button_text,post_rsvp_button_url,post_decline_title,post_decline_body,post_decline_button_text,post_decline_button_url,linked_form_definition_id,linked_form_start_section_id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: cors });
  }
  if (!event || !event.is_published) {
    return new Response(JSON.stringify({ ok: false, error: "Evento não encontrado." }), { status: 404, headers: cors });
  }

  let contact: { id: string; nome: string } | null = null;
  let rsvp_status: "confirmed" | "declined" | null = null;

  if (token) {
    const resolved = await resolvePublicContact({ token });
    if (resolved) {
      contact = { id: resolved.id, nome: resolved.nome };
      const { data: rsvp } = await supabaseAdmin
        .from("event_rsvps")
        .select("status")
        .eq("event_id", event.id)
        .eq("contact_id", resolved.id)
        .maybeSingle();
      if (rsvp?.status === "confirmed" || rsvp?.status === "declined") {
        rsvp_status = rsvp.status;
      }
    }
  }

  let cover_url: string | null = null;
  if (event.cover_path) {
    const { data: signed } = await supabaseAdmin.storage
      .from("campaign-media")
      .createSignedUrl(event.cover_path, 60 * 60);
    cover_url = signed?.signedUrl ?? null;
  }

  // Formulário vinculado (referência viva — nada é copiado)
  let form: { slug: string; start_section_id: string | null } | null = null;
  if (event.linked_form_definition_id) {
    const { data: def } = await supabaseAdmin
      .from("form_definitions")
      .select("id,slug,is_active,layout_mode")
      .eq("id", event.linked_form_definition_id)
      .maybeSingle();
    if (def?.is_active && def.layout_mode === "sectioned") {
      let startSectionId = event.linked_form_start_section_id ?? null;
      if (!startSectionId) {
        const { data: first } = await supabaseAdmin
          .from("form_sections")
          .select("id")
          .eq("form_definition_id", def.id)
          .order("order_index", { ascending: true })
          .limit(1)
          .maybeSingle();
        startSectionId = first?.id ?? null;
      }
      form = { slug: def.slug, start_section_id: startSectionId };
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      event: { ...event, cover_url },
      form,
      contact,
      rsvp_status,
    }),
    { headers: { ...cors, "Cache-Control": "no-store" } },
  );
}


const rsvpBodySchema = z.object({
  status: z.enum(["confirmed", "declined"]),
  contact_token: z.string().trim().min(8).max(48).optional(),
  nome: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(8).max(40).optional(),
  /** Só usado no fluxo simples (evento sem formulário vinculado). */
  consentimento_whatsapp: z.boolean().optional(),
  ...honeypotSchema,
});

export async function handlePublicEventRsvp(request: Request, slug: string): Promise<Response> {
  const ip = getRequestIp(request);
  if (isRateLimited(`event-rsvp:${slug}:${ip}`, 20, 60_000)) {
    return new Response(JSON.stringify({ ok: false, error: "Muitas tentativas. Aguarde um instante." }), {
      status: 429,
      headers: cors,
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "JSON inválido" }), { status: 400, headers: cors });
  }

  const parsed = rsvpBodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" }),
      { status: 400, headers: cors },
    );
  }
  const d = parsed.data;
  if (isHoneypotTripped(d.hp)) return new Response(JSON.stringify({ ok: true }), { headers: cors });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: event, error: eventErr } = await supabaseAdmin
    .from("events")
    .select("id,title,slug,is_published,post_rsvp_title,post_rsvp_button_text,post_rsvp_button_url")
    .eq("slug", slug)
    .maybeSingle();
  if (eventErr) {
    return new Response(JSON.stringify({ ok: false, error: eventErr.message }), { status: 500, headers: cors });
  }
  if (!event || !event.is_published) {
    return new Response(JSON.stringify({ ok: false, error: "Evento não encontrado." }), { status: 404, headers: cors });
  }

  const contact = await resolvePublicContact({
    token: d.contact_token,
    nome: d.nome,
    phone: d.phone,
  });
  if (!contact) {
    return new Response(
      JSON.stringify({ ok: false, error: "Informe nome e WhatsApp, ou use o link com seu token de contato." }),
      { status: 400, headers: cors },
    );
  }

  if (d.status === "declined") {
    const { error: upsertErr } = await supabaseAdmin
      .from("event_rsvps")
      .upsert({ event_id: event.id, contact_id: contact.id, status: "declined" }, { onConflict: "event_id,contact_id" });
    if (upsertErr) {
      return new Response(JSON.stringify({ ok: false, error: upsertErr.message }), { status: 400, headers: cors });
    }
  } else {
    if (d.consentimento_whatsapp) {
      const nowIso = new Date().toISOString();
      await supabaseAdmin
        .from("contacts")
        .update({ consentimento_whatsapp: true, consentimento_at: nowIso })
        .eq("id", contact.id);
    }
    const result = await confirmEventRsvpForContact({ eventSlug: slug, contactId: contact.id });
    if (!result.ok) {
      return new Response(JSON.stringify({ ok: false, error: result.error }), { status: 400, headers: cors });
    }
  }


  return new Response(
    JSON.stringify({
      ok: true,
      status: d.status,
      contact_token: contact.recad_token,
      contact_name: contact.nome,
      post_rsvp: {
        title: (event as { post_rsvp_title?: string | null }).post_rsvp_title ?? null,
        button_text: (event as { post_rsvp_button_text?: string | null }).post_rsvp_button_text ?? null,
        button_url: (event as { post_rsvp_button_url?: string | null }).post_rsvp_button_url ?? null,
      },
    }),
    { headers: cors },
  );
}

export async function handlePublicEventIcs(slug: string): Promise<Response> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { buildEventIcs } = await import("@/lib/event-ics.server");

  const { data: event, error } = await supabaseAdmin
    .from("events")
    .select("title,slug,description,location,starts_at,ends_at,is_published")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    return new Response(error.message, { status: 500 });
  }
  if (!event || !event.is_published) {
    return new Response("Evento não encontrado.", { status: 404 });
  }

  const ics = buildEventIcs(event);
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug}.ics"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
