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

export async function handlePublicGetEvent(request: Request, slug: string): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("t")?.trim() || undefined;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: event, error } = await supabaseAdmin
    .from("events")
    .select("id,title,slug,description,location,starts_at,ends_at,is_published")
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

  return new Response(
    JSON.stringify({
      ok: true,
      event,
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
    .select("id,title,slug,is_published")
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

  const { data: prev } = await supabaseAdmin
    .from("event_rsvps")
    .select("status")
    .eq("event_id", event.id)
    .eq("contact_id", contact.id)
    .maybeSingle();

  const { error: upsertErr } = await supabaseAdmin.from("event_rsvps").upsert(
    {
      event_id: event.id,
      contact_id: contact.id,
      status: d.status,
    },
    { onConflict: "event_id,contact_id" },
  );
  if (upsertErr) {
    return new Response(JSON.stringify({ ok: false, error: upsertErr.message }), { status: 400, headers: cors });
  }

  if (d.status === "confirmed" && prev?.status !== "confirmed") {
    try {
      await notifyEventRsvpConfirmed({
        eventId: event.id,
        eventTitle: event.title,
        contactId: contact.id,
        contactName: contact.nome,
      });
    } catch {
      /* non-blocking */
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      status: d.status,
      contact_token: contact.recad_token,
      contact_name: contact.nome,
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
