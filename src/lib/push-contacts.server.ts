// Push para contatos públicos (sem login) — inscrição via API pública e envio via service-role.
import { z } from "zod";
import { getRequestIp, honeypotSchema, isHoneypotTripped, isRateLimited } from "@/lib/public-form-guards.server";

const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

export function pushCorsOptionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

const subscribeBodySchema = z.object({
  contact_id: z.string().uuid(),
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  user_agent: z.string().max(500).optional().nullable(),
  ...honeypotSchema,
});

const unsubscribeBodySchema = z.object({
  contact_id: z.string().uuid(),
  endpoint: z.string().url(),
  ...honeypotSchema,
});

export async function handlePublicPushSubscribe(request: Request): Promise<Response> {
  const ip = getRequestIp(request);
  if (isRateLimited(`push-subscribe:${ip}`, 15, 60_000)) {
    return new Response(JSON.stringify({ ok: false, error: "Muitas tentativas. Tente novamente em instantes." }), {
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

  const parsed = subscribeBodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" }),
      { status: 400, headers: cors },
    );
  }
  const d = parsed.data;
  if (isHoneypotTripped(d.hp)) return new Response(JSON.stringify({ ok: true }), { headers: cors });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: contact, error: contactErr } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("id", d.contact_id)
    .maybeSingle();
  if (contactErr) {
    return new Response(JSON.stringify({ ok: false, error: contactErr.message }), { status: 500, headers: cors });
  }
  if (!contact) {
    return new Response(JSON.stringify({ ok: false, error: "Contato não encontrado." }), { status: 404, headers: cors });
  }

  await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", d.endpoint);
  const { error } = await supabaseAdmin.from("push_subscriptions").insert({
    contact_id: d.contact_id,
    user_id: null,
    endpoint: d.endpoint,
    p256dh: d.p256dh,
    auth: d.auth,
    user_agent: d.user_agent ?? null,
  });
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 400, headers: cors });
  }

  return new Response(JSON.stringify({ ok: true as const }), { headers: cors });
}

export async function handlePublicPushUnsubscribe(request: Request): Promise<Response> {
  const ip = getRequestIp(request);
  if (isRateLimited(`push-unsubscribe:${ip}`, 20, 60_000)) {
    return new Response(JSON.stringify({ ok: false, error: "Muitas tentativas. Tente novamente em instantes." }), {
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

  const parsed = unsubscribeBodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" }),
      { status: 400, headers: cors },
    );
  }
  const d = parsed.data;
  if (isHoneypotTripped(d.hp)) return new Response(JSON.stringify({ ok: true }), { headers: cors });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("push_subscriptions")
    .delete()
    .eq("contact_id", d.contact_id)
    .eq("endpoint", d.endpoint);
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 400, headers: cors });
  }

  return new Response(JSON.stringify({ ok: true as const }), { headers: cors });
}

export async function sendPushToContacts(input: {
  contact_ids: string[];
  title: string;
  body: string;
  url?: string;
  tag?: string;
}): Promise<{ sent: number; failed: number; removed: number }> {
  const ids = Array.from(new Set(input.contact_ids)).filter(Boolean);
  if (!ids.length) return { sent: 0, failed: 0, removed: 0 };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendWebPush } = await import("@/lib/web-push.server");

  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("contact_id, endpoint, p256dh, auth")
    .in("contact_id", ids)
    .not("contact_id", "is", null);
  if (error) throw new Error(error.message);
  if (!subs?.length) return { sent: 0, failed: 0, removed: 0 };

  let sent = 0;
  let failed = 0;
  let removed = 0;

  await Promise.allSettled(
    subs.map(async (s) => {
      const result = await sendWebPush(
        { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
        {
          title: input.title,
          body: input.body,
          url: input.url ?? "/",
          tag: input.tag ?? `pqb-contact-${s.contact_id}`,
        },
      );
      if (result.gone) {
        removed++;
        await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      } else if (result.ok) {
        sent++;
      } else {
        failed++;
      }
    }),
  );

  return { sent, failed, removed };
}
