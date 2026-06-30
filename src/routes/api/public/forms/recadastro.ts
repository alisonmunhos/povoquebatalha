import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  nome: z.string().trim().min(2, "Nome muito curto").max(120),
  phone: z.string().trim().min(10, "Telefone inválido").max(40),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  cidade: z.string().trim().max(120).optional().or(z.literal("")),
  uf: z.string().trim().length(2).optional().or(z.literal("")),
  cep: z.string().trim().max(12).optional().or(z.literal("")),
  endereco: z.string().trim().max(240).optional().or(z.literal("")),
  numero: z.string().trim().max(20).optional().or(z.literal("")),
  bairro: z.string().trim().max(120).optional().or(z.literal("")),
  como_conheceu: z.string().trim().max(240).optional().or(z.literal("")),
  quer_voluntariar: z.boolean().optional(),
  consentimento_whatsapp: z.literal(true, {
    errorMap: () => ({ message: "É preciso autorizar o contato por WhatsApp." }),
  }),
  hp: z.string().max(0).optional(), // honeypot
});

const rateLimit = new Map<string, { count: number; reset: number }>();
function isRateLimited(ip: string, limit = 5, windowMs = 60_000) {
  const now = Date.now();
  const entry = rateLimit.get(ip);
  if (!entry || entry.reset < now) {
    rateLimit.set(ip, { count: 1, reset: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

export const Route = createFileRoute("/api/public/forms/recadastro")({
  server: {
    handlers: {
      OPTIONS: () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
      POST: async ({ request }) => {
        const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
        const ip =
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          request.headers.get("cf-connecting-ip") ||
          "unknown";
        if (isRateLimited(ip)) {
          return new Response(JSON.stringify({ ok: false, error: "Muitas tentativas. Tente em 1 minuto." }), {
            status: 429,
            headers: cors,
          });
        }
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ ok: false, error: "JSON inválido" }), {
            status: 400,
            headers: cors,
          });
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return new Response(
            JSON.stringify({ ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" }),
            { status: 400, headers: cors },
          );
        }
        const d = parsed.data;
        if (d.hp) {
          // honeypot triggered — silently accept
          return new Response(JSON.stringify({ ok: true }), { headers: cors });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Normalize phone via DB function so it matches stored format
        const { data: norm } = await supabaseAdmin.rpc("normalize_phone_br", { input: d.phone });
        const phoneE164 = norm as string | null;
        if (!phoneE164) {
          return new Response(JSON.stringify({ ok: false, error: "Telefone inválido" }), {
            status: 400,
            headers: cors,
          });
        }

        // Upsert by phone
        const { data: existing } = await supabaseAdmin
          .from("contacts")
          .select("id")
          .eq("phone_e164", phoneE164)
          .maybeSingle();

        const payload = {
          nome: d.nome,
          phone_raw: d.phone,
          email: d.email || null,
          cidade: d.cidade || null,
          uf: d.uf ? d.uf.toUpperCase() : null,
          cep: d.cep || null,
          endereco: d.endereco || null,
          numero: d.numero || null,
          bairro: d.bairro || null,
          como_conheceu: d.como_conheceu || null,
          quer_voluntariar: d.quer_voluntariar ?? null,
          consentimento_whatsapp: true,
          origem: "recadastro" as const,
          opt_out_at: null,
        };
        if (existing) {
          await supabaseAdmin.from("contacts").update(payload).eq("id", existing.id);
        } else {
          await supabaseAdmin.from("contacts").insert(payload);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: cors });
      },
    },
  },
});
